import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Auth } from 'googleapis';
import { JwtService } from '@nestjs/jwt';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarService } from './google-calendar.service';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { ApiException } from '../common/api.exception';

const OAUTH_STATE_PURPOSE = 'gcal-oauth-state';

interface OAuthStatePayload {
  sub: string;
  purpose: typeof OAUTH_STATE_PURPOSE;
}

@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  constructor(
    private readonly googleCalendarConfig: GoogleCalendarConfig,
    private readonly integrationAccountService: IntegrationAccountService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Redirects the user to Google OAuth2 consent screen.
   * Guarantees refresh token with access_type=offline and prompt=consent.
   *
   * `state` is a short-lived signed token (not the raw userId) — the
   * callback route below is @Public() and unauthenticated, so it must be
   * able to cryptographically verify who initiated the flow instead of
   * trusting a client-suppliable value (would otherwise let anyone bind
   * their own Google account to an arbitrary victim's ownerId).
   */
  @Get('connect')
  connect(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const client = this.googleCalendarConfig.createOAuth2Client();
    const state = this.jwtService.sign(
      { purpose: OAUTH_STATE_PURPOSE } satisfies Omit<OAuthStatePayload, 'sub'>,
      { subject: user.userId, expiresIn: '10m' },
    );
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state,
    });

    return res.redirect(url);
  }

  /**
   * Handles Google OAuth2 callback redirect, exchanges authorization code for tokens,
   * saves the integration account encrypted in database, and ensures the Husrevity calendar.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (!code) {
      throw ApiException.badRequest('Authorization code is required');
    }

    const ownerId = user?.userId ?? this.verifyState(state);
    if (!ownerId) {
      throw ApiException.badRequest('Missing state or user authentication');
    }

    const client = this.googleCalendarConfig.createOAuth2Client();
    let tokens: Auth.Credentials;

    try {
      const tokenRes = await client.getToken(code);
      tokens = tokenRes.tokens;
    } catch (error) {
      throw ApiException.badRequest(`Failed to exchange code for tokens: ${(error as Error).message}`);
    }

    if (!tokens.access_token) {
      throw ApiException.badRequest('Google did not return an access token');
    }

    const scopes = tokens.scope
      ? tokens.scope.split(' ')
      : ['https://www.googleapis.com/auth/calendar'];

    const account = await this.integrationAccountService.save(
      ownerId,
      'google_calendar',
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      },
      scopes,
    );

    let calendarId: string | null = null;
    try {
      calendarId = await this.googleCalendarService.ensureHusrevityCalendar(ownerId);
      await this.googleCalendarService.registerWatchChannel(ownerId);
    } catch {
      // Unconfigured or network error during OAuth callback should not fail token storage
    }

    return {
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

  /**
   * Verifies the signed `state` param produced by connect(). Returns undefined
   * (never throws) for a missing/expired/forged/wrong-purpose token so the
   * caller can fall back to the generic "missing state" 400.
   */
  private verifyState(state?: string): string | undefined {
    if (!state) {
      return undefined;
    }
    try {
      const payload = this.jwtService.verify<OAuthStatePayload>(state);
      if (payload.purpose !== OAUTH_STATE_PURPOSE || !payload.sub) {
        return undefined;
      }
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
