import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleCalendarService } from './google-calendar.service';
import { IntegrationAccountService } from './integration-account.service';
import { ExternalLink } from './external-link.entity';
import { Item } from '../item/item.entity';
import { ApiException } from '../common/api.exception';
import { linkedItemOwnedBy } from './owner-scope';
import { redactSecrets } from './log-redaction';
import { GoogleCalendarEngineService } from './google-calendar-engine.service';

/** Matches the `items.title` column (VARCHAR(255)). */
const MAX_TITLE_LENGTH = 255;

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  let cut = title.slice(0, MAX_TITLE_LENGTH);
  // Do not leave half of a surrogate pair at the end.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

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
    /** Absent in minimal wiring: then every owner stays on the legacy engine, as before. */
    @Optional() private readonly engine?: GoogleCalendarEngineService,
  ) {}

  /** False when the new engine owns this owner or the grant was narrowed: the legacy pull must stay silent. */
  private async legacyAllowed(ownerId: string): Promise<boolean> {
    return (await this.engine?.legacyEngineAllowed(ownerId)) !== false;
  }

  /**
   * Performs an incremental pull sync from Google Calendar to Husrevity items for a user.
   * Fetches events updated since last sync using `syncToken`, inserts/updates `Item`s
   * (kind='event', source='gcal'), updates `external_link` records, and saves the new `syncToken`.
   */
  async syncIncremental(ownerId: string): Promise<SyncIncrementalResult> {
    // Webhook and periodic paths both land here: an owner on the v2 engine (or with a narrowed grant) is never pulled by the legacy engine.
    if (!(await this.legacyAllowed(ownerId))) {
      return { syncedCount: 0, deletedCount: 0, syncToken: null };
    }
    const decryptedAccount = await this.integrationAccountService.get(ownerId, 'google_calendar');

    if (!decryptedAccount) {
      throw ApiException.notFound('Google Calendar integration account not found or disconnected');
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
        await this.integrationAccountService.updateSyncToken(ownerId, 'google_calendar', null);
        return await this.fetchAndProcessEvents(calendar, calendarId, ownerId, null);
      }

      throw err;
    }
  }

  /**
   * A full pull (no sync token) must not overwrite a Husrevity-origin item the user edited
   * after Google last changed the event. Incremental pulls keep applying Google's change.
   */
  private localEditWins(item: Item, gcalEvent: { updated?: string | null }, syncToken: string | null): boolean {
    if (syncToken || (item.source ?? 'gcal') === 'gcal' || !gcalEvent.updated || !item.updatedAt) return false;
    const eventUpdated = new Date(gcalEvent.updated).getTime();
    return !Number.isNaN(eventUpdated) && new Date(item.updatedAt).getTime() > eventUpdated;
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
            where: {
              provider: 'google_calendar',
              externalId: gcalEvent.id,
              itemId: linkedItemOwnedBy(ownerId),
            },
          });

          if (link) {
            const item = await this.itemRepo.findOne({
              where: { id: link.itemId, ownerId },
            });
            if (item) {
              await this.itemRepo.softRemove(item);
            }
            await this.externalLinkRepo.softRemove(link);
            deletedCount++;
          }
        } else {
          const title = truncateTitle(gcalEvent.summary || '(No title)');
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
            where: {
              provider: 'google_calendar',
              externalId: gcalEvent.id,
              itemId: linkedItemOwnedBy(ownerId),
            },
          });

          if (link) {
            // Soft-deleted rows are loaded on purpose: a locally deleted item must stay deleted.
            let item = await this.itemRepo.findOne({
              where: { id: link.itemId, ownerId },
              withDeleted: true,
            });
            if (item?.deletedAt) continue;

            if (item && this.localEditWins(item, gcalEvent, syncToken)) {
              link.etag = etag;
              link.lastSyncedAt = new Date();
              await this.externalLinkRepo.save(link);
              continue;
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
                withDeleted: true,
              });
            }
            // Deleted locally: no resurrection and no new copy for this Google event.
            if (item?.deletedAt) continue;

            if (item) {
              if (!this.localEditWins(item, gcalEvent, syncToken)) {
                item.title = title;
                item.notes = notes;
                item.scheduledAt = scheduledAt;
                item.durationMin = durationMin;
                item.kind = 'event';
                item.source = item.source || 'gcal';
                await this.itemRepo.save(item);
              }
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
      `Incremental sync complete for owner ${ownerId}: synced ${syncedCount}, deleted ${deletedCount}`,
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
    const allConnected =
      await this.integrationAccountService.findConnectedAccounts('google_calendar');
    const connectedAccounts: typeof allConnected = [];
    for (const account of allConnected) {
      if (await this.legacyAllowed(account.ownerId)) connectedAccounts.push(account);
    }
    let successful = 0;
    let failed = 0;

    for (const account of connectedAccounts) {
      try {
        await this.syncIncremental(account.ownerId);
        successful++;
      } catch (err: any) {
        failed++;
        this.logger.error(
          `Failed periodic sync for owner ${account.ownerId}: ${redactSecrets(err?.message || err)}`,
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
