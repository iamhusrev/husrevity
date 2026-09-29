import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { google, calendar_v3 } from 'googleapis';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { ExternalLink } from './external-link.entity';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { ApiException } from '../common/api.exception';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly googleCalendarConfig: GoogleCalendarConfig,
    private readonly integrationAccountService: IntegrationAccountService,
    @InjectRepository(ExternalLink)
    private readonly externalLinkRepo: Repository<ExternalLink>,
    // No forwardRef needed on this side: by the time this class's own
    // decorator metadata is captured, `google-calendar-sync.service.ts` has
    // already finished loading (its require() is triggered from mid-way
    // through this file's own imports — see the forwardRef comment in
    // GoogleCalendarSyncService's constructor for the full load-order
    // trace and how this was verified empirically with a real Nest DI
    // resolution test, not just unit tests with mocked providers).
    private readonly syncService: GoogleCalendarSyncService,
  ) {}

  /**
   * Gets an authenticated Google Calendar API client for a given owner.
   */
  async getCalendarClient(ownerId: string): Promise<{
    calendar: calendar_v3.Calendar;
    calendarId: string | null;
  }> {
    if (!this.googleCalendarConfig.isConfigured()) {
      throw ApiException.badRequest('Google Calendar integration is not configured');
    }

    const decrypted = await this.integrationAccountService.get(ownerId, 'google_calendar');
    if (!decrypted) {
      throw ApiException.notFound('Google Calendar integration account not found or disconnected');
    }

    const oauth2Client = this.googleCalendarConfig.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: decrypted.accessToken,
      refresh_token: decrypted.refreshToken ?? undefined,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return {
      calendar,
      calendarId: decrypted.account.calendarId,
    };
  }

  /**
   * Ensures the secondary "Husrevity" calendar exists on Google Calendar.
   * If `integration_account.calendar_id` is already populated, returns it immediately.
   * Otherwise, creates a new Google calendar titled "Husrevity" (never touches primary),
   * updates `integration_account.calendar_id`, and returns the new calendar ID.
   */
  async ensureHusrevityCalendar(ownerId: string): Promise<string> {
    const { calendar, calendarId } = await this.getCalendarClient(ownerId);

    if (calendarId) {
      return calendarId;
    }

    try {
      const res = await calendar.calendars.insert({
        requestBody: {
          summary: 'Husrevity',
          description: 'Husrevity synchronized calendar',
          // Matches the rest of the app's wall-clock convention (item-recurrence.service.ts) —
          // UTC here would make Google's own calendar UI show event day-boundaries offset from
          // what the user sees inside Husrevity.
          timeZone: 'Europe/Istanbul',
        },
      });

      const newCalendarId = res.data?.id;
      if (!newCalendarId) {
        throw ApiException.badRequest('Failed to obtain calendar ID from Google response');
      }

      await this.integrationAccountService.updateCalendarId(
        ownerId,
        'google_calendar',
        newCalendarId,
      );

      this.logger.log(`Created Husrevity calendar (${newCalendarId}) for owner ${ownerId}`);
      return newCalendarId;
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }
      this.logger.error(
        `Error creating Husrevity calendar for owner ${ownerId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw ApiException.badRequest(
        `Failed to create Husrevity calendar: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Formats a Husrevity Item into a Google Calendar Event payload,
   * setting `extendedProperties.private.husrevityId` for loop prevention during sync.
   */
  formatEventForGoogle(item: {
    id?: string;
    title: string;
    notes?: string | null;
    scheduledAt?: Date | string | null;
    durationMin?: number | null;
  }): calendar_v3.Schema$Event {
    let start: calendar_v3.Schema$EventDateTime | undefined;
    let end: calendar_v3.Schema$EventDateTime | undefined;

    if (item.scheduledAt) {
      const startDate = new Date(item.scheduledAt);
      const startIso = startDate.toISOString();
      const durationMs = (item.durationMin ?? 30) * 60 * 1000;
      const endDate = new Date(startDate.getTime() + durationMs);
      const endIso = endDate.toISOString();

      start = { dateTime: startIso };
      end = { dateTime: endIso };
    }

    return {
      summary: item.title,
      description: item.notes ?? undefined,
      start,
      end,
      extendedProperties: {
        private: {
          husrevityId: item.id ?? '',
        },
      },
    };
  }

  /**
   * Extracts the Husrevity Item ID from a Google Calendar Event's private extended properties, if present.
   */
  getHusrevityIdFromEvent(event: calendar_v3.Schema$Event): string | null {
    return event.extendedProperties?.private?.husrevityId ?? null;
  }

  /**
   * Syncs a Husrevity event Item to Google Calendar (insert or update).
   * Only processes items with `kind === 'event'` and `source !== 'gcal'`.
   * Updates or creates the corresponding `external_link` record.
   * Performs conflict resolution ("last updated wins") by checking etags before update.
   */
  async syncItemToGoogleCalendar(item: {
    id: string;
    ownerId: string;
    kind: string;
    source?: string | null;
    title: string;
    notes?: string | null;
    scheduledAt?: Date | string | null;
    durationMin?: number | null;
    updatedAt?: Date | string | null;
  }): Promise<ExternalLink | null> {
    if (item.kind !== 'event' || item.source === 'gcal') {
      return null;
    }

    if (!this.googleCalendarConfig.isConfigured()) {
      return null;
    }

    const decrypted = await this.integrationAccountService.get(item.ownerId, 'google_calendar');
    if (!decrypted || decrypted.account.status !== 'connected') {
      return null;
    }

    try {
      const { calendar, calendarId: existingCalId } = await this.getCalendarClient(item.ownerId);
      const calendarId = existingCalId ?? (await this.ensureHusrevityCalendar(item.ownerId));

      let link = await this.externalLinkRepo.findOne({
        where: { itemId: item.id, provider: 'google_calendar' },
      });

      const eventPayload = this.formatEventForGoogle(item);

      if (link && link.externalId) {
        // Fetch remote event to check etag and conflict state
        let remoteEvent: calendar_v3.Schema$Event | null = null;
        try {
          const getRes = await calendar.events.get({
            calendarId,
            eventId: link.externalId,
          });
          remoteEvent = getRes.data;
        } catch (getErr: any) {
          this.logger.warn(
            `Failed to fetch remote event ${link.externalId} for conflict check: ${getErr?.message}`,
          );
        }

        if (remoteEvent) {
          const remoteEtag = remoteEvent.etag ?? null;
          const remoteUpdated = remoteEvent.updated ? new Date(remoteEvent.updated) : null;
          const localUpdated = item.updatedAt ? new Date(item.updatedAt) : new Date();

          // Check if etag changed on Google Calendar since last sync
          if (link.etag && remoteEtag && link.etag !== remoteEtag) {
            this.logger.warn(
              `Conflict detected for item ${item.id} (link etag ${link.etag} !== remote etag ${remoteEtag})`,
            );

            // "Son updated kazanır" (Last updated wins): If remote Google event is newer than local item,
            // skip local write and trigger incremental pull sync.
            if (remoteUpdated && remoteUpdated.getTime() > localUpdated.getTime()) {
              this.logger.warn(
                `Remote event is newer (${remoteUpdated.toISOString()} > ${localUpdated.toISOString()}). Skipping local write and triggering pull sync.`,
              );
              if (this.syncService) {
                try {
                  await this.syncService.syncIncremental(item.ownerId);
                } catch (syncErr: any) {
                  this.logger.error(
                    `Failed to trigger incremental sync after conflict resolution: ${syncErr?.message}`,
                  );
                }
              }
              return link;
            }
          }
        }

        const res = await calendar.events.update({
          calendarId,
          eventId: link.externalId,
          requestBody: eventPayload,
        });

        link.etag = res.data.etag ?? link.etag;
        link.lastSyncedAt = new Date();
        return await this.externalLinkRepo.save(link);
      } else {
        const res = await calendar.events.insert({
          calendarId,
          requestBody: eventPayload,
        });

        const externalId = res.data.id;
        if (!externalId) {
          this.logger.warn(`Google Calendar insert returned no event ID for item ${item.id}`);
          return null;
        }

        if (!link) {
          link = this.externalLinkRepo.create({
            itemId: item.id,
            provider: 'google_calendar',
            externalId,
            etag: res.data.etag ?? null,
            lastSyncedAt: new Date(),
          });
        } else {
          link.externalId = externalId;
          link.etag = res.data.etag ?? null;
          link.lastSyncedAt = new Date();
        }

        return await this.externalLinkRepo.save(link);
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync item ${item.id} to Google Calendar for owner ${item.ownerId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return null;
    }
  }

  /**
   * Registers or renews a Google Calendar `events.watch` webhook channel for push notifications.
   * Sends notifications to `GOOGLE_CALENDAR_WEBHOOK_URL` (…/hooks/gcal); skipped when unset.
   * Stores channelId, resourceId, and expiration date in `integration_account`.
   * Stops existing active channel if present.
   */
  async registerWatchChannel(ownerId: string): Promise<{
    channelId: string;
    resourceId: string;
    expiration: Date;
  } | null> {
    if (!this.googleCalendarConfig.isConfigured()) {
      return null;
    }

    const webhookAddress = this.googleCalendarConfig.webhookUrl;
    if (!webhookAddress) {
      this.logger.warn(
        'GOOGLE_CALENDAR_WEBHOOK_URL is not set — skipping push-notification channel; relying on the periodic sync',
      );
      return null;
    }

    const decrypted = await this.integrationAccountService.get(ownerId, 'google_calendar');
    if (!decrypted || decrypted.account.status !== 'connected') {
      return null;
    }

    const { calendar, calendarId: existingCalId } = await this.getCalendarClient(ownerId);
    const calendarId = existingCalId ?? (await this.ensureHusrevityCalendar(ownerId));

    // Stop existing active watch channel if present
    if (decrypted.account.channelId && decrypted.account.resourceId) {
      try {
        await calendar.channels.stop({
          requestBody: {
            id: decrypted.account.channelId,
            resourceId: decrypted.account.resourceId,
          },
        });
      } catch (stopErr: any) {
        this.logger.warn(
          `Failed to stop existing watch channel ${decrypted.account.channelId} for owner ${ownerId}: ${stopErr?.message}`,
        );
      }
    }

    const channelId = `husrevity-gcal-${ownerId}-${Date.now()}`;
    // Google echoes this back on every push notification as the
    // X-Goog-Channel-Token header — the documented way for the receiver
    // (gcal-webhook.controller.ts) to verify a call genuinely came from
    // Google, instead of trusting the (non-secret, ownerId-embedding)
    // channelId/resourceId headers alone.
    const channelToken = randomBytes(24).toString('base64url');

    try {
      const res = await calendar.events.watch({
        calendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookAddress,
          token: channelToken,
        },
      });

      const resourceId = res.data.resourceId;
      const expirationMs = res.data.expiration;
      const expiration = expirationMs
        ? new Date(Number(expirationMs))
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      if (!resourceId) {
        this.logger.warn(`Google Calendar events.watch returned no resourceId for owner ${ownerId}`);
        return null;
      }

      await this.integrationAccountService.updateWatchChannel(
        ownerId,
        'google_calendar',
        channelId,
        resourceId,
        expiration,
        channelToken,
      );

      this.logger.log(
        `Registered watch channel (${channelId}, resource: ${resourceId}, expires: ${expiration.toISOString()}) for owner ${ownerId}`,
      );

      return { channelId, resourceId, expiration };
    } catch (error: any) {
      this.logger.error(
        `Failed to register watch channel for owner ${ownerId}: ${error?.message}`,
        error?.stack,
      );
      return null;
    }
  }

  /**
   * Stops the active Google Calendar `events.watch` channel for an owner.
   */
  async stopWatchChannel(ownerId: string): Promise<boolean> {
    if (!this.googleCalendarConfig.isConfigured()) {
      return false;
    }

    const decrypted = await this.integrationAccountService.get(ownerId, 'google_calendar');
    if (!decrypted || !decrypted.account.channelId || !decrypted.account.resourceId) {
      return false;
    }

    try {
      const { calendar } = await this.getCalendarClient(ownerId);
      await calendar.channels.stop({
        requestBody: {
          id: decrypted.account.channelId,
          resourceId: decrypted.account.resourceId,
        },
      });

      await this.integrationAccountService.updateWatchChannel(
        ownerId,
        'google_calendar',
        null,
        null,
        null,
        null,
      );

      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to stop watch channel for owner ${ownerId}: ${error?.message}`,
        error?.stack,
      );
      return false;
    }
  }
}
