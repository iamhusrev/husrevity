import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Put, Query } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { CodeChallengeBodyDto } from './dto/google-calendar-connect-dtos';
import {
  GoogleCalendarChoiceDto,
  GoogleEventsQueryDto,
  GoogleFeedDto,
  SelectCalendarsRequestDto,
  SetWriteRequestDto,
} from './dto/google-calendar-v2-dtos';
import { GoogleCalendarConnectService } from './google-calendar-connect.service';
import { GoogleCalendarLifecycleService } from './google-calendar-lifecycle.service';
import { GoogleCalendarPublishService, MigrateLegacyResult } from './google-calendar-publish.service';
import { GoogleCalendarWriteService, WriteSettingResult } from './google-calendar-write.service';
import { GoogleCalendarSelectionService } from './google-calendar-selection.service';
import { parseFeedRange } from './google-calendar-v2.util';

/**
 * Calendar picker and web feed of the new Google Calendar model. Every route
 * answers a plain 404 while GOOGLE_CALENDAR_V2_ENABLED is not the literal
 * `true`, so with the flag off the surface does not exist. All routes are
 * owner-scoped by the Bearer user (JwtAuthGuard is the global default).
 */
@Controller('integrations/google-calendar')
export class GoogleCalendarV2Controller {
  private readonly logger = new Logger(GoogleCalendarV2Controller.name);

  constructor(
    private readonly selection: GoogleCalendarSelectionService,
    private readonly lifecycle: GoogleCalendarLifecycleService,
    private readonly connect: GoogleCalendarConnectService,
    private readonly write: GoogleCalendarWriteService,
    private readonly publish: GoogleCalendarPublishService,
  ) {}

  /**
   * Deliberate switch to read-only permissions: pauses sync, stops channels,
   * revokes the current grant and returns an API start URL (like connect-url)
   * for a consent that asks only for the read-only scopes.
   */
  @Post('narrow')
  @HttpCode(HttpStatus.OK)
  async narrow(@CurrentUser() user: AuthenticatedUser, @Body() body: CodeChallengeBodyDto): Promise<{ url: string }> {
    this.requireEnabled();
    const { ticket } = await this.guard('Could not start the permission change', 'narrowing', () =>
      this.lifecycle.beginNarrow(user.userId, body.codeChallenge),
    );
    return { url: this.connect.startUrlFor(ticket) };
  }

  /**
   * Opt-in switch of the optional write-back (default off). Turning it on
   * without the `calendar.app.created` permission answers `enabled: false`
   * plus a `consentUrl` (API start URL with a ticket) the browser must open.
   */
  @Put('write')
  async setWrite(@CurrentUser() user: AuthenticatedUser, @Body() body: SetWriteRequestDto): Promise<WriteSettingResult> {
    this.requireEnabled();
    return this.guard('Could not update the write setting', 'write setting', () =>
      this.write.setWriteEnabled(user.userId, body.enabled, body.codeChallenge),
    );
  }

  /** "Move to new calendar": explicitly publishes the caller's existing personal events. Never automatic. */
  @Post('write/migrate-legacy')
  @HttpCode(HttpStatus.OK)
  async migrateLegacy(@CurrentUser() user: AuthenticatedUser): Promise<MigrateLegacyResult> {
    this.requireEnabled();
    return this.guard('Could not move the events to the new calendar', 'legacy migration', () =>
      this.publish.migrateLegacy(user.userId),
    );
  }

  /** How many legacy Google copies a confirmed disconnect would delete. */
  @Get('disconnect-preview')
  async disconnectPreview(@CurrentUser() user: AuthenticatedUser): Promise<{ legacyCopyCount: number }> {
    this.requireEnabled();
    return this.guard('Could not prepare the disconnect', 'disconnect preview', () =>
      this.lifecycle.disconnectPreview(user.userId),
    );
  }

  /** The user's Google calendars merged with the local selection state. */
  @Get('calendars')
  async calendars(@CurrentUser() user: AuthenticatedUser): Promise<GoogleCalendarChoiceDto[]> {
    this.requireEnabled();
    return this.guard('Could not read the Google calendar list', 'calendar list', () =>
      this.selection.listCalendars(user.userId),
    );
  }

  /** Replaces the selection: named calendars are selected, every other one is deselected. */
  @Put('calendars/selection')
  async updateSelection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SelectCalendarsRequestDto,
  ): Promise<{ selected: string[] }> {
    this.requireEnabled();
    return this.guard('Could not update the calendar selection', 'selection update', () =>
      this.selection.updateSelection(user.userId, body.selected),
    );
  }

  /** Web-only feed of the selected calendars' events plus the legacy copies to hide. */
  @Get('events')
  async events(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GoogleEventsQueryDto,
  ): Promise<GoogleFeedDto> {
    this.requireEnabled();
    const { from, to } = parseFeedRange(query.from, query.to);
    const feed = await this.guard('Google Calendar events are unavailable', 'events feed', () =>
      this.selection.feed(user.userId, from, to),
    );
    return {
      events: feed.events.map((e) => ({
        id: e.id,
        subscriptionId: e.subscriptionId,
        googleEventId: e.googleEventId,
        recurringEventId: e.recurringEventId,
        title: e.title,
        allDay: e.allDay,
        startAt: e.startAt ? new Date(e.startAt).toISOString() : null,
        endAt: e.endAt ? new Date(e.endAt).toISOString() : null,
        startDate: e.startDate,
        endDateExclusive: e.endDateExclusive,
        status: e.status,
        htmlLink: e.htmlLink,
      })),
      hiddenLegacyItemIds: feed.hiddenLegacyItemIds,
    };
  }

  private requireEnabled(): void {
    if (!this.selection.isEnabled()) throw ApiException.notFound('Not found');
  }

  /** Domain errors pass through; anything else becomes one stable 502 envelope (cause logged by class only). */
  private async guard<T>(message: string, what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.warn(`Google Calendar ${what} failed (${(err as Error)?.constructor?.name ?? 'unknown'})`);
      throw new ApiException(message, HttpStatus.BAD_GATEWAY);
    }
  }
}
