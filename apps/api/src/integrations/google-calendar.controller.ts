import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Auth } from 'googleapis';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarLifecycleService } from './google-calendar-lifecycle.service';
import { GoogleCalendarWriteService } from './google-calendar-write.service';
import { GoogleCalendarSelectionService } from './google-calendar-selection.service';
import {
  CALENDAR_CONNECT_SCOPES,
  CALENDAR_NARROW_SCOPES,
  CALENDAR_FLOW_COOKIE,
  GoogleCalendarConnectService,
} from './google-calendar-connect.service';
import { assertTopLevelNavigation } from '../auth/google-login.controller';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { ApiException } from '../common/api.exception';
import {
  LegacyCopiesCountResponse,
  PurgeLegacyCopiesRequestDto,
  PurgeLegacyCopiesResponse,
} from './dto/google-calendar-legacy-copies-dtos';
import {
  CalendarExchangeRequestDto,
  CalendarExchangeResponse,
  CodeChallengeQueryDto,
} from './dto/google-calendar-connect-dtos';

const FLOW_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  private readonly logger = new Logger(GoogleCalendarController.name);

  constructor(
    private readonly googleCalendarConfig: GoogleCalendarConfig,
    private readonly integrationAccountService: IntegrationAccountService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly connectService: GoogleCalendarConnectService,
    private readonly selection: GoogleCalendarSelectionService,
    private readonly lifecycle: GoogleCalendarLifecycleService,
    private readonly write: GoogleCalendarWriteService,
  ) {}

  /**
   * Legacy entry point. A plain browser navigation cannot carry the Bearer
   * token, so it only works for clients that can; it begins the same
   * ticket flow as connect-url and sends the browser to the API start route,
   * which binds the flow to this browser with a cookie. It never redirects
   * to Google directly.
   */
  @Get('connect')
  async connect(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CodeChallengeQueryDto,
    @Res() res: Response,
  ) {
    const { ticket } = await this.connectService.begin(user.userId, query.codeChallenge);
    return res.redirect(302, this.connectService.startUrlFor(ticket));
  }

  /**
   * The web app fetches this with its Bearer-authenticated axios instance and
   * then navigates the browser to the returned API start URL. The URL carries
   * a single-use, short-lived ticket, not a Google consent URL.
   */
  @Get('connect-url')
  async connectUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CodeChallengeQueryDto,
  ): Promise<{ url: string }> {
    const { ticket } = await this.connectService.begin(user.userId, query.codeChallenge);
    return { url: this.connectService.startUrlFor(ticket) };
  }

  /**
   * Browser navigation target: redeems the ticket, sets the flow-specific
   * HttpOnly SameSite=Lax cookie in THIS browser and redirects to the Google
   * consent screen (offline access, forced consent, unchanged scope set).
   */
  @Public()
  @Throttle(FLOW_THROTTLE)
  @Get('start')
  async start(
    @Query('ticket') ticket: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    assertTopLevelNavigation(req.headers);
    const { authUrl, cookieValue } = await this.connectService.start(ticket);
    const { path, secure } = this.connectService.cookieOptions();
    res.cookie(CALENDAR_FLOW_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path,
      maxAge: 10 * 60 * 1000,
    });
    noStore(res);
    res.redirect(302, authUrl);
  }

  /**
   * `configured`, `connected` and `connectedAt` are the original contract.
   * Everything after them is additive: `v2Enabled`, `mode`, `needsReconnect`,
   * `selectedCount`, `lastSyncAt`, `lastError` (sanitized, never a token),
   * `revokeFailed` (the Google grant may still be active after a disconnect whose
   * revoke could not be completed; shown in both flag states).
   */
  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    const decrypted = await this.integrationAccountService.get(user.userId, 'google_calendar');
    const extras = await this.selection.statusExtras(user.userId, {
      connected: !!decrypted,
      lastSyncAt: decrypted?.account.lastSyncAt ?? null,
      scopes: decrypted?.account.scopes ?? [],
    });
    return {
      configured: this.googleCalendarConfig.isConfigured(),
      connected: !!decrypted,
      connectedAt: decrypted ? decrypted.account.connectedAt.toISOString() : null,
      ...extras,
    };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Query('deleteLegacyCopies') deleteLegacyCopies?: string,
  ): Promise<void> {
    // Every mode (v2 flag on or off): stop all channels including the legacy watch channel,
    // revoke the Google grant and remove the stored tokens. The existing `items` copies
    // survive unless the user explicitly confirmed `deleteLegacyCopies=true`.
    await this.lifecycle.disconnect(user.userId, { deleteLegacyCopies: deleteLegacyCopies === 'true' });
  }

  /** How many legacy `gcal` copies a purge would delete. Works in every mode, also after a disconnect. */
  @Get('legacy-copies')
  async legacyCopies(@CurrentUser() user: AuthenticatedUser): Promise<LegacyCopiesCountResponse> {
    return this.lifecycle.disconnectPreview(user.userId);
  }

  /**
   * Permanently deletes the caller's legacy `gcal` event copies (and their links). Needs an
   * explicit `{ confirm: true }`, works in every mode, with or without a connected account.
   * Husrevity-origin items and other owners are never touched.
   */
  @Post('legacy-copies/purge')
  @HttpCode(HttpStatus.OK)
  async purgeLegacyCopies(
    @CurrentUser() user: AuthenticatedUser,
    @Body() _body: PurgeLegacyCopiesRequestDto,
  ): Promise<PurgeLegacyCopiesResponse> {
    return this.lifecycle.purgeLegacyCopies(user.userId);
  }

  /**
   * Google redirects here. The flow is looked up by state and must match the
   * cookie set by start() in this browser. NO token is requested or stored:
   * the Google code is parked encrypted on the flow row and the browser goes to
   * the web with a single-use handoff code in the URL fragment (or an error
   * fragment). The tokens are stored only by POST exchange.
   */
  @Public()
  @Throttle(FLOW_THROTTLE)
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response, @Query() query: CallbackQuery) {
    const { path, secure } = this.connectService.cookieOptions();
    res.clearCookie(CALENDAR_FLOW_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path });
    noStore(res);
    try {
      const { redirectUrl } = await this.connectService.handleCallback(query, req.headers.cookie);
      return res.redirect(302, redirectUrl);
    } catch (error) {
      this.logger.warn(`Google OAuth callback failed (${(error as Error).constructor.name})`);
      return res.redirect(302, `${this.googleCalendarConfig.callbackPageUrl}#error=google_failed`);
    }
  }

  /**
   * Finishes any calendar consent (connect, narrow, write). Bearer required;
   * only the flow's own user holding the matching PKCE verifier can redeem the
   * handoff code, so a link started by someone else can never bind this user's
   * Google account to theirs. The owner is the Bearer user, equal to the flow user.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CalendarExchangeRequestDto,
  ): Promise<CalendarExchangeResponse> {
    const { ownerId, kind, googleCode } = await this.connectService.redeemHandoff(
      user.userId,
      body.code,
      body.verifier,
    );
    try {
      if (kind === 'write') {
        return { kind, connected: await this.write.completeWrite(ownerId, googleCode) };
      }
      if (kind === 'narrow') {
        return { kind, connected: await this.lifecycle.completeNarrow(ownerId, googleCode) };
      }
      const stored = await this.storeConnection(ownerId, googleCode);
      if (this.selection.isEnabled()) {
        await this.lifecycle.markReconnected(ownerId, stored.scopes, stored.account.id);
      }
      return { kind, connected: true };
    } catch (error) {
      // Never log the message of a failed exchange: it may echo request details.
      this.logger.warn(`Google calendar exchange failed (${(error as Error).constructor.name})`);
      return { kind, connected: false };
    }
  }

  /** Exchanges the authorization code and stores the encrypted tokens for `ownerId`. */
  async storeConnection(ownerId: string, code: string) {
    if (!code) {
      throw ApiException.badRequest('Authorization code is required');
    }

    const client = this.googleCalendarConfig.createOAuth2Client();
    let tokens: Auth.Credentials;

    try {
      const tokenRes = await client.getToken(code);
      tokens = tokenRes.tokens;
    } catch (error) {
      throw ApiException.badRequest(
        `Failed to exchange code for tokens: ${(error as Error).message}`,
      );
    }

    if (!tokens.access_token) {
      throw ApiException.badRequest('Google did not return an access token');
    }

    const v2 = this.googleCalendarConfig.v2Enabled;
    const scopes = tokens.scope ? tokens.scope.split(' ') : v2 ? CALENDAR_NARROW_SCOPES : CALENDAR_CONNECT_SCOPES;

    const account = await this.integrationAccountService.save(
      ownerId,
      'google_calendar',
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      },
      scopes,
    );

    // The new model reads the user's own calendars: it never creates the legacy
    // "Husrevity" calendar and never registers the legacy watch channel.
    let calendarId: string | null = null;
    if (!v2) {
      try {
        calendarId = await this.googleCalendarService.ensureHusrevityCalendar(ownerId);
        await this.googleCalendarService.registerWatchChannel(ownerId);
      } catch {
        // Unconfigured or network error during OAuth callback should not fail token storage
      }
    }

    return {
      scopes,
      message: 'Google Calendar successfully connected',
      account: {
        id: account.id,
        provider: account.provider,
        status: account.status,
        calendarId: calendarId ?? account.calendarId,
        connectedAt: account.connectedAt,
      },
    };
  }
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
}
