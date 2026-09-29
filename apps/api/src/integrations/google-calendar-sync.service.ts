import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleCalendarService } from './google-calendar.service';
import { IntegrationAccountService } from './integration-account.service';
import { ExternalLink } from './external-link.entity';
import { Item } from '../item/item.entity';
import { ApiException } from '../common/api.exception';

export interface SyncIncrementalResult {
  syncedCount: number;
  deletedCount: number;
  syncToken: string | null;
}

@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);

  constructor(
    // forwardRef is required on BOTH sides of this circular pair (see the
    // matching @Inject(forwardRef(...)) in GoogleCalendarService) — without
    // it here, whichever of the two files Node happens to require() first
    // (via the circular `google-calendar.service.ts` <->
    // `google-calendar-sync.service.ts` imports) captures `undefined` for
    // this constructor's reflected design:paramtypes, and Nest fails to
    // resolve this dependency at real app bootstrap. Verified empirically:
    // Reflect.getMetadata('design:paramtypes', GoogleCalendarSyncService)[0]
    // was `undefined` before this fix. Unit tests never caught it because
    // they provide GoogleCalendarService manually via a mock, bypassing
    // reflection-based resolution entirely.
    @Inject(forwardRef(() => GoogleCalendarService))
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly integrationAccountService: IntegrationAccountService,
    @InjectRepository(ExternalLink)
    private readonly externalLinkRepo: Repository<ExternalLink>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  /**
   * Performs an incremental pull sync from Google Calendar to Husrevity items for a user.
   * Fetches events updated since last sync using `syncToken`, inserts/updates `Item`s
   * (kind='event', source='gcal'), updates `external_link` records, and saves the new `syncToken`.
   */
  async syncIncremental(ownerId: string): Promise<SyncIncrementalResult> {
    const decryptedAccount = await this.integrationAccountService.get(
      ownerId,
      'google_calendar',
    );

    if (!decryptedAccount) {
      throw ApiException.notFound(
        'Google Calendar integration account not found or disconnected',
      );
    }

    const { calendar } = await this.googleCalendarService.getCalendarClient(ownerId);
    const calendarId = await this.googleCalendarService.ensureHusrevityCalendar(ownerId);

    const initialSyncToken = decryptedAccount.account.syncToken;

    try {
      return await this.fetchAndProcessEvents(calendar, calendarId, ownerId, initialSyncToken);
    } catch (err: any) {
      const is410 =
        err?.code === 410 ||
        err?.code === '410' ||
        err?.status === 410 ||
        err?.status === '410' ||
        err?.response?.status === 410 ||
        err?.response?.status === '410';

      if (initialSyncToken && is410) {
        this.logger.warn(
          `Sync token expired or invalid (410 Gone) for owner ${ownerId}, clearing token and performing full resync`,
        );
        await this.integrationAccountService.updateSyncToken(
          ownerId,
          'google_calendar',
          null,
        );
        return await this.fetchAndProcessEvents(calendar, calendarId, ownerId, null);
      }

      throw err;
    }
  }

  private async fetchAndProcessEvents(
    calendar: any,
    calendarId: string,
    ownerId: string,
    syncToken: string | null,
  ): Promise<SyncIncrementalResult> {
    let pageToken: string | undefined = undefined;
    let newSyncToken: string | null = null;
    let syncedCount = 0;
    let deletedCount = 0;

    do {
      const params: any = {
        calendarId,
        pageToken,
        maxResults: 250,
      };

      if (syncToken) {
        params.syncToken = syncToken;
      }

      const response = await calendar.events.list(params);
      const gcalEvents = response.data.items ?? [];

      for (const gcalEvent of gcalEvents) {
        if (!gcalEvent.id) continue;

        if (gcalEvent.status === 'cancelled') {
          const link = await this.externalLinkRepo.findOne({
            where: { provider: 'google_calendar', externalId: gcalEvent.id },
          });

          if (link) {
            const item = await this.itemRepo.findOne({
              where: { id: link.itemId },
            });
            if (item) {
              await this.itemRepo.softRemove(item);
            }
            await this.externalLinkRepo.softRemove(link);
            deletedCount++;
          }
        } else {
          const title = gcalEvent.summary || '(No title)';
          const notes = gcalEvent.description ?? null;
          let scheduledAt: Date | null = null;

          if (gcalEvent.start?.dateTime) {
            scheduledAt = new Date(gcalEvent.start.dateTime);
          } else if (gcalEvent.start?.date) {
            scheduledAt = new Date(`${gcalEvent.start.date}T00:00:00.000Z`);
          }

          let durationMin: number | null = null;
          if (gcalEvent.start?.dateTime && gcalEvent.end?.dateTime) {
            const startMs = new Date(gcalEvent.start.dateTime).getTime();
            const endMs = new Date(gcalEvent.end.dateTime).getTime();
            durationMin = Math.max(0, Math.round((endMs - startMs) / 60000));
          }

          const etag = gcalEvent.etag ?? null;
          const husrevityId = this.googleCalendarService.getHusrevityIdFromEvent(gcalEvent);

          let link = await this.externalLinkRepo.findOne({
            where: { provider: 'google_calendar', externalId: gcalEvent.id },
          });

          if (link) {
            let item = await this.itemRepo.findOne({
              where: { id: link.itemId },
            });

            if (item) {
              item.title = title;
              item.notes = notes;
              item.scheduledAt = scheduledAt;
              item.durationMin = durationMin;
              item.kind = 'event';
              item.source = item.source || 'gcal';
              await this.itemRepo.save(item);
            } else {
              item = this.itemRepo.create({
                ownerId,
                kind: 'event',
                title,
                notes,
                scheduledAt,
                durationMin,
                status: 'open',
                source: 'gcal',
                payload: {},
              });
              item = await this.itemRepo.save(item);
              link.itemId = item.id;
            }

            link.etag = etag;
            link.lastSyncedAt = new Date();
            await this.externalLinkRepo.save(link);
            syncedCount++;
          } else {
            let item: Item | null = null;
            if (husrevityId) {
              item = await this.itemRepo.findOne({
                where: { id: husrevityId, ownerId },
              });
            }

            if (item) {
              item.title = title;
              item.notes = notes;
              item.scheduledAt = scheduledAt;
              item.durationMin = durationMin;
              item.kind = 'event';
              item.source = item.source || 'gcal';
              await this.itemRepo.save(item);
            } else {
              item = this.itemRepo.create({
                ownerId,
                kind: 'event',
                title,
                notes,
                scheduledAt,
                durationMin,
                status: 'open',
                source: 'gcal',
                payload: {},
              });
              item = await this.itemRepo.save(item);
            }

            link = this.externalLinkRepo.create({
              itemId: item.id,
              provider: 'google_calendar',
              externalId: gcalEvent.id,
              etag,
              lastSyncedAt: new Date(),
            });
            await this.externalLinkRepo.save(link);
            syncedCount++;
          }
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;
      if (response.data.nextSyncToken) {
        newSyncToken = response.data.nextSyncToken;
      }
    } while (pageToken);

    if (newSyncToken) {
      await this.integrationAccountService.updateSyncToken(
        ownerId,
        'google_calendar',
        newSyncToken,
      );
    }

    this.logger.log(
      `Incremental sync complete for owner ${ownerId}: synced ${syncedCount}, deleted ${deletedCount}, next syncToken: ${newSyncToken}`,
    );

    return {
      syncedCount,
      deletedCount,
      syncToken: newSyncToken,
    };
  }

  /**
   * Performs incremental pull sync for all connected Google Calendar accounts.
   */
  async syncAllConnectedAccounts(): Promise<{ total: number; successful: number; failed: number }> {
    const connectedAccounts = await this.integrationAccountService.findConnectedAccounts(
      'google_calendar',
    );
    let successful = 0;
    let failed = 0;

    for (const account of connectedAccounts) {
      try {
        await this.syncIncremental(account.ownerId);
        successful++;
      } catch (err: any) {
        failed++;
        this.logger.error(
          `Failed periodic sync for owner ${account.ownerId}: ${err?.message || err}`,
        );
      }
    }

    this.logger.log(
      `Completed periodic sync for all connected accounts: ${successful} succeeded, ${failed} failed out of ${connectedAccounts.length} total`,
    );

    return {
      total: connectedAccounts.length,
      successful,
      failed,
    };
  }
}
