import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ApiException } from '../common/api.exception';
import {
  GOOGLE_CALENDAR_GATEWAY,
  GoogleCalendarGateway,
  GoogleEventWrite,
  GoogleWrittenEvent,
} from './google-calendar-gateway';
import { CALENDAR_APP_CREATED_SCOPE } from './google-calendar-v2.util';
import { googleErrorStatus } from './google-events-reader';
import { redactSecrets } from './log-redaction';

/** Name of the app-created calendar. Deliberately not the legacy "Husrevity" calendar. */
export const MANAGED_CALENDAR_SUMMARY = 'Husrevity Planner';
const MANAGED_CALENDAR_TIME_ZONE = 'Europe/Istanbul';

/** Google event ids are base32hex (a-v, 0-9) and 5-1024 chars; a fixed prefix plus hex fits. */
const EVENT_ID_PREFIX = 'hv';
const EVENT_ID_HEX_LENGTH = 40;
const DEFAULT_DURATION_MIN = 30;
/** One "move to new calendar" request publishes at most this many items (Google calls are sequential). */
export const MIGRATE_BATCH_SIZE = 200;
/** A queued Google delete is retried this many times; afterwards the row is left alone and the failure logged once. */
export const MAX_DELETE_ATTEMPTS = 5;
/** One sweep handles at most this many pending deletes (Google calls are sequential). */
const SWEEP_BATCH_SIZE = 200;

export interface SweepResult {
  removed: number;
  failed: number;
  abandoned: number;
}

/** The fields of an item the publisher needs; an `Item` entity satisfies it. */
export interface PublishableItem {
  id: string;
  ownerId: string;
  kind: string;
  source?: string | null;
  projectId?: string | null;
  title: string;
  scheduledAt?: Date | string | null;
  durationMin?: number | null;
  deletedAt?: Date | null;
}

export type PublishOutcome = 'created' | 'updated' | 'removed' | 'skipped';

export interface MigrateLegacyResult {
  published: number;
  skipped: number;
  failed: number;
  /** Eligible items still unpublished after this request (a batch limit or failures). */
  remaining: number;
}

interface PendingRow {
  id: string;
  eventId: string;
  calendarId: string;
}

/** SQL twin of `isEligible` over `items i` (a soft-deleted item is ineligible). */
const INELIGIBLE_ITEM_SQL = `i.deleted_at IS NOT NULL OR i.kind <> 'event' OR i.source = 'gcal'
          OR i.project_id IS NOT NULL OR i.scheduled_at IS NULL`;

/** Class and HTTP status only: provider messages can echo credentials. */
function errorLabel(err: unknown): string {
  const status = googleErrorStatus(err);
  return status ? `google_${status}` : redactSecrets((err as Error)?.name ?? 'Error');
}

interface ManagedCalendar {
  id: string;
  calendarId: string;
}

/**
 * Optional write-back of personal Husrevity events to Google (plan section 2.2,
 * "Yazma açılırsa"). Everything is gated by GOOGLE_CALENDAR_V2_ENABLED=true,
 * the per-user `write_enabled` opt-in and the granted `calendar.app.created`
 * scope. Items go into ONE new app-created calendar (the `managed` subscription,
 * never read back) and only as title + time.
 *
 * Idempotency: the Google event id is derived deterministically from owner and
 * item, so any retry (lost response, crash between Google and the database)
 * finds the same id. insert answering 409 means "already there": the event is
 * patched instead, and the publication row is written only after Google
 * confirmed, so a missing row always means "retry me", never a duplicate.
 */
@Injectable()
export class GoogleCalendarPublishService {
  private readonly logger = new Logger(GoogleCalendarPublishService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(GOOGLE_CALENDAR_GATEWAY) private readonly gateway: GoogleCalendarGateway,
  ) {}

  /** Only the literal string `true` enables the new model. */
  isEnabled(): boolean {
    return this.config.get<string>('GOOGLE_CALENDAR_V2_ENABLED') === 'true';
  }

  /** Deterministic Google event id of an item. Contains no raw ids; valid base32hex. */
  eventIdFor(ownerId: string, itemId: string): string {
    const hex = createHash('sha256').update(`husrevity-gcal-publish:${ownerId}:${itemId}`).digest('hex');
    return `${EVENT_ID_PREFIX}${hex.slice(0, EVENT_ID_HEX_LENGTH)}`;
  }

  /**
   * True when the new publisher (and not the legacy write path) owns writes for
   * this owner: flag on, write opted in, connection active, scope granted.
   */
  async isHandling(ownerId: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const rows = await this.dataSource.query(
      `SELECT 1 FROM google_calendar_connection
        WHERE owner_id = $1 AND write_enabled AND status = 'active' AND granted_scopes @> $2::jsonb`,
      [ownerId, JSON.stringify([CALENDAR_APP_CREATED_SCOPE])],
    );
    return rows.length > 0;
  }

  /**
   * Creates or updates the Google event of a personal item. An item that is no
   * longer eligible (moved into a project, deleted, ...) has its event removed.
   * Throws on Google failures so the caller can log or count them.
   */
  async publishItem(item: PublishableItem): Promise<PublishOutcome> {
    if (!(await this.isHandling(item.ownerId))) return 'skipped';
    if (!isEligible(item)) return this.removePublication(item.ownerId, item.id);

    const target = await this.ensureManagedCalendar(item.ownerId);
    const eventId = this.eventIdFor(item.ownerId, item.id);
    const body = buildEventBody(item);
    const hasRow = (
      await this.dataSource.query(
        `SELECT 1 FROM google_calendar_publication WHERE owner_id = $1 AND item_id = $2 AND subscription_id = $3`,
        [item.ownerId, item.id, target.id],
      )
    ).length > 0;

    const { written, outcome } = hasRow
      ? await this.patchThenInsert(item.ownerId, target.calendarId, eventId, body)
      : await this.insertThenPatch(item.ownerId, target.calendarId, eventId, body);

    await this.dataSource.query(
      `INSERT INTO google_calendar_publication (owner_id, item_id, subscription_id, google_event_id, etag)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (item_id, subscription_id) DO UPDATE
         SET etag = EXCLUDED.etag, delete_pending_at = NULL, delete_attempts = 0, updated_at = now()`,
      [item.ownerId, item.id, target.id, eventId, written.etag],
    );
    return outcome;
  }

  /** Removes the Google event of an item (used when the item is deleted). Gated by the flag only. */
  async unpublishItem(ownerId: string, itemId: string): Promise<PublishOutcome> {
    if (!this.isEnabled()) return 'skipped';
    return this.removePublication(ownerId, itemId);
  }

  /**
   * "Yeni takvime taşı": publishes the owner's existing eligible items to the
   * new managed calendar, on explicit request only. Items that already have a
   * publication row are skipped; the deterministic ids make a repeat harmless.
   */
  async migrateLegacy(ownerId: string): Promise<MigrateLegacyResult> {
    if (!(await this.isHandling(ownerId))) {
      throw ApiException.conflict('Writing to Google Calendar is not enabled');
    }
    const rows = (await this.dataSource.query(
      `SELECT i.id::text AS id, i.owner_id::text AS "ownerId", i.kind, i.source, i.project_id::text AS "projectId",
              i.title, i.scheduled_at AS "scheduledAt", i.duration_min AS "durationMin",
              EXISTS (SELECT 1 FROM google_calendar_publication p
                        JOIN google_calendar_subscription s ON s.id = p.subscription_id AND s.managed
                       WHERE p.item_id = i.id AND p.owner_id = i.owner_id) AS published
         FROM items i
        WHERE i.owner_id = $1 AND i.kind = 'event' AND i.source <> 'gcal' AND i.project_id IS NULL
          AND i.deleted_at IS NULL AND i.scheduled_at IS NOT NULL
        ORDER BY i.id`,
      [ownerId],
    )) as (PublishableItem & { published: boolean })[];

    const pending = rows.filter((r) => !r.published);
    const batch = pending.slice(0, MIGRATE_BATCH_SIZE);
    const result: MigrateLegacyResult = { published: 0, skipped: rows.length - pending.length, failed: 0, remaining: 0 };
    for (const item of batch) {
      try {
        const outcome = await this.publishItem(item);
        if (outcome === 'skipped') result.skipped++;
        else result.published++;
      } catch {
        result.failed++;
      }
    }
    result.remaining = pending.length - batch.length + result.failed;
    return result;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * Marks the item's publication rows pending-delete (durable), then tries to
   * remove the Google event and the row. A Google failure keeps the row, counts
   * the attempt and is rethrown so the caller can log it; the sweep retries.
   */
  private async removePublication(ownerId: string, itemId: string): Promise<PublishOutcome> {
    // The CTE keeps the result a plain row list (a bare UPDATE ... RETURNING comes back as [rows, count]).
    const rows = (await this.dataSource.query(
      `WITH u AS (
         UPDATE google_calendar_publication p
            SET delete_pending_at = COALESCE(p.delete_pending_at, now())
           FROM google_calendar_subscription s
          WHERE s.id = p.subscription_id AND s.owner_id = p.owner_id AND p.owner_id = $1 AND p.item_id = $2
          RETURNING p.id::text AS id, p.google_event_id AS "eventId", s.google_calendar_id AS "calendarId")
       SELECT id, "eventId", "calendarId" FROM u`,
      [ownerId, itemId],
    )) as PendingRow[];
    if (rows.length === 0) return 'skipped';
    for (const row of rows) await this.deleteCopy(ownerId, row);
    return 'removed';
  }

  /**
   * Deletes one published copy. Already gone in Google (404/410) is the state we
   * want; any other failure bumps `delete_attempts`, keeps the row and rethrows.
   */
  private async deleteCopy(ownerId: string, row: PendingRow): Promise<void> {
    try {
      await this.gateway.deleteEvent(ownerId, row.calendarId, row.eventId);
    } catch (err) {
      const status = googleErrorStatus(err);
      if (status !== 404 && status !== 410) {
        await this.dataSource.query(
          `UPDATE google_calendar_publication SET delete_attempts = delete_attempts + 1, updated_at = now()
            WHERE id = $1 AND owner_id = $2`,
          [row.id, ownerId],
        );
        throw err;
      }
    }
    await this.dataSource.query(`DELETE FROM google_calendar_publication WHERE id = $1 AND owner_id = $2`, [
      row.id,
      ownerId,
    ]);
  }

  /**
   * Worker body (also safe to call directly). Reconciles first, so EVERY path that
   * stops an item being published is covered even when it bypassed the publisher
   * (bulk soft-deletes, the legacy mirror, project deletion, undo, write turned off):
   *  - copies whose item is deleted or no longer eligible are marked pending-delete;
   *  - copies of an owner whose write is off are marked pending-delete (turning
   *    write off removes the copies from the Husrevity Planner calendar);
   *  - pending copies that are eligible again under an enabled write are un-queued.
   * Then it removes the pending copies from Google with bounded attempts. Not
   * gated by the v2 flag: queued removals must never be stranded. Logs ids and
   * counts only, never tokens.
   */
  async sweepPendingDeletes(): Promise<SweepResult> {
    const out: SweepResult = { removed: 0, failed: 0, abandoned: 0 };
    await this.dataSource.query(
      `UPDATE google_calendar_publication p SET delete_pending_at = now(), updated_at = now()
         FROM items i
        WHERE i.id = p.item_id AND p.delete_pending_at IS NULL AND (${INELIGIBLE_ITEM_SQL})`,
    );
    await this.dataSource.query(
      `UPDATE google_calendar_publication p SET delete_pending_at = now(), updated_at = now()
         FROM google_calendar_connection c
        WHERE c.owner_id = p.owner_id AND NOT c.write_enabled AND p.delete_pending_at IS NULL`,
    );
    await this.dataSource.query(
      `UPDATE google_calendar_publication p SET delete_pending_at = NULL, delete_attempts = 0, updated_at = now()
         FROM items i, google_calendar_connection c
        WHERE i.id = p.item_id AND c.owner_id = p.owner_id AND c.write_enabled
          AND p.delete_pending_at IS NOT NULL AND NOT (${INELIGIBLE_ITEM_SQL})`,
    );

    const pending = (await this.dataSource.query(
      `SELECT p.id::text AS id, p.owner_id::text AS "ownerId", p.google_event_id AS "eventId",
              s.google_calendar_id AS "calendarId", p.delete_attempts AS attempts
         FROM google_calendar_publication p
         JOIN google_calendar_subscription s ON s.id = p.subscription_id AND s.owner_id = p.owner_id
        WHERE p.delete_pending_at IS NOT NULL AND p.delete_attempts < $1
        ORDER BY p.delete_pending_at, p.id
        LIMIT $2`,
      [MAX_DELETE_ATTEMPTS, SWEEP_BATCH_SIZE],
    )) as (PendingRow & { ownerId: string; attempts: number })[];
    for (const row of pending) {
      try {
        // The batch was selected a while ago: re-check right before the Google call so a copy
        // whose item was restored (or whose pending mark was cleared) meanwhile is never removed.
        if (!(await this.stillPendingRemoval(row.ownerId, row.id))) continue;
        await this.deleteCopy(row.ownerId, row);
        out.removed++;
      } catch (err) {
        if (row.attempts + 1 >= MAX_DELETE_ATTEMPTS) {
          out.abandoned++;
          this.logger.error(
            `Giving up removing a published Google event after ${MAX_DELETE_ATTEMPTS} attempts (owner ${row.ownerId}, publication ${row.id}, ${errorLabel(err)})`,
          );
        } else {
          out.failed++;
          this.logger.warn(`Removing a published Google event failed, will retry (${errorLabel(err)})`);
        }
      }
    }
    return out;
  }

  /**
   * True when the publication is still marked pending-delete AND its copy must still go:
   * the item is gone or no longer eligible, or the owner's write is off. When the pending
   * mark is set but nothing justifies it any more (the item was restored, write is on),
   * the mark is cleared instead and false is returned.
   */
  private async stillPendingRemoval(ownerId: string, publicationId: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `SELECT p.delete_pending_at IS NOT NULL AS pending,
              (i.id IS NULL OR (${INELIGIBLE_ITEM_SQL}) OR c.id IS NULL OR NOT c.write_enabled) AS "mustGo"
         FROM google_calendar_publication p
         LEFT JOIN items i ON i.id = p.item_id
         LEFT JOIN google_calendar_connection c ON c.owner_id = p.owner_id
        WHERE p.id = $1 AND p.owner_id = $2`,
      [publicationId, ownerId],
    )) as { pending: boolean; mustGo: boolean }[];
    const row = rows[0];
    if (!row || !row.pending) return false;
    if (row.mustGo) return true;
    await this.dataSource.query(
      `UPDATE google_calendar_publication SET delete_pending_at = NULL, delete_attempts = 0, updated_at = now()
        WHERE id = $1 AND owner_id = $2`,
      [publicationId, ownerId],
    );
    return false;
  }

  /** First publish of an item (or a retry of one): a 409 means the event already exists, so patch it. */
  private async insertThenPatch(ownerId: string, calendarId: string, eventId: string, body: GoogleEventWrite) {
    try {
      const written = await this.gateway.insertEvent(ownerId, calendarId, eventId, body);
      return { written, outcome: 'created' as const };
    } catch (err) {
      if (googleErrorStatus(err) !== 409) throw err;
      const written = await this.gateway.patchEvent(ownerId, calendarId, eventId, body);
      return { written, outcome: 'updated' as const };
    }
  }

  /** Known item: patch; when the event is gone for good, publish it again under the same id. */
  private async patchThenInsert(
    ownerId: string,
    calendarId: string,
    eventId: string,
    body: GoogleEventWrite,
  ): Promise<{ written: GoogleWrittenEvent; outcome: 'created' | 'updated' }> {
    try {
      const written = await this.gateway.patchEvent(ownerId, calendarId, eventId, body);
      return { written, outcome: 'updated' };
    } catch (err) {
      const status = googleErrorStatus(err);
      if (status !== 404 && status !== 410) throw err;
      return this.insertThenPatch(ownerId, calendarId, eventId, body);
    }
  }

  /**
   * The owner's managed calendar, created on first use. The lookup, the Google
   * calendars.insert and the subscription row sit in one transaction under an
   * advisory lock, so two concurrent first publishes cannot create two calendars.
   */
  private async ensureManagedCalendar(ownerId: string): Promise<ManagedCalendar> {
    const existing = await this.findManaged(ownerId);
    if (existing) return existing;
    return this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext('gcal_managed_calendar'), (($1::bigint) % 2147483647)::int)`, [
        ownerId,
      ]);
      const again = (await m.query(
        `SELECT id::text AS id, google_calendar_id AS "calendarId" FROM google_calendar_subscription
          WHERE owner_id = $1 AND managed`,
        [ownerId],
      )) as ManagedCalendar[];
      if (again[0]) return again[0];

      const conn = (await m.query(`SELECT id::text AS id FROM google_calendar_connection WHERE owner_id = $1`, [
        ownerId,
      ])) as { id: string }[];
      if (!conn[0]) throw ApiException.conflict('Google Calendar is not connected');
      const created = await this.gateway.createCalendar(ownerId, {
        summary: MANAGED_CALENDAR_SUMMARY,
        timeZone: MANAGED_CALENDAR_TIME_ZONE,
      });
      const rows = (await m.query(
        `INSERT INTO google_calendar_subscription (owner_id, connection_id, google_calendar_id, summary, managed, selected)
         VALUES ($1, $2, $3, $4, true, false)
         RETURNING id::text AS id, google_calendar_id AS "calendarId"`,
        [ownerId, conn[0].id, created.id, MANAGED_CALENDAR_SUMMARY],
      )) as ManagedCalendar[];
      return rows[0];
    });
  }

  private async findManaged(ownerId: string): Promise<ManagedCalendar | null> {
    const rows = (await this.dataSource.query(
      `SELECT id::text AS id, google_calendar_id AS "calendarId" FROM google_calendar_subscription
        WHERE owner_id = $1 AND managed`,
      [ownerId],
    )) as ManagedCalendar[];
    return rows[0] ?? null;
  }
}

/** Plan section 2.2: only personal events that did not come from Google are ever written. */
export function isEligible(item: PublishableItem): boolean {
  return item.kind === 'event' && item.source !== 'gcal' && !item.projectId && !!item.scheduledAt && !item.deletedAt;
}

/** Title and time only: no notes, no description, no extended properties. */
export function buildEventBody(item: PublishableItem): GoogleEventWrite {
  const start = new Date(item.scheduledAt as Date | string);
  const end = new Date(start.getTime() + (item.durationMin ?? DEFAULT_DURATION_MIN) * 60_000);
  return {
    summary: item.title.slice(0, 255) || '(No title)',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    status: 'confirmed',
  };
}
