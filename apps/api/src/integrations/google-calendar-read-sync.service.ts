import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { DataSource, EntityManager } from 'typeorm';
import {
  computeWindow,
  GoogleEventDto,
  mapGoogleEvent,
  MappedGoogleEvent,
  overlapsWindow,
  SyncWindow,
} from './google-calendar-event.mapper';
import {
  GOOGLE_EVENTS_READER,
  GoogleEventsListRequest,
  GoogleEventsReader,
  googleErrorStatus,
} from './google-events-reader';
import { isDefiniteAuthFailure } from './google-error';
import { hashChannelToken, hashesMatch } from './channel-token';
import { redactSecrets } from './log-redaction';

/**
 * Per-subscription read engine for the new Google Calendar model (plan 2.2).
 * Everything here is behind GOOGLE_CALENDAR_V2_ENABLED (literal `true`); with
 * the flag off every entry point returns `{ status: 'disabled' }` and touches
 * neither Google nor the database.
 *
 * INVARIANTS (the lease/fencing/deselect/webhook tests rely on these)
 *
 *  I1  Nothing is written before every page of a listing was fetched. A delta
 *      is applied in ONE transaction together with the new sync token; a
 *      rebuild stages into an invisible generation and flips in ONE transaction.
 *  I2  Visibility: event rows count only when `generation` equals the
 *      subscription's `active_generation` AND the subscription is `selected`.
 *      Rows of any other generation are staging/garbage, never served.
 *  I3  Fencing: `epoch` only grows. `acquireLease` bumps it; `fenceSubscription`
 *      (deselect) bumps it and clears the lease. EVERY write transaction starts
 *      with `assertLease`, an UPDATE ... WHERE id AND epoch = held AND
 *      lease_holder = me AND lease not expired AND selected, which also takes the
 *      row lock. A stale or deselected worker therefore matches 0 rows, throws
 *      LeaseLostError and rolls back, so it cannot write rows or the token.
 *  I4  Event identity is (subscription_id, generation, google_event_id). A Google
 *      event id is NEVER looked up globally: every statement is bound to one
 *      subscription, which belongs to exactly one owner. The same Google event
 *      id under two users (shared calendar) is two independent rows.
 *  I5  Cancellation: a cancelled event carrying `recurringEventId` is a single
 *      instance and removes only its own row; a cancelled event without it is a
 *      single event or a whole series and removes its row plus every row whose
 *      `recurring_event_id` equals its id.
 *  I6  Bounded storage: only events overlapping [window_min, window_max) are
 *      stored. The window is -90d..+365d (UTC-day aligned) and moves forward
 *      through `advanceWindow` (daily); events that fall out are dropped by the
 *      generation swap.
 *  I7  Data minimisation: title (<= 255) and timing only. No tokens in logs.
 *  I8  Managed calendar: a subscription flagged `managed` (or that has a
 *      `google_calendar_publication` row) is the calendar Husrevity itself publishes items into. It is never
 *      synced, never served and never hides legacy copies, so an item cannot show
 *      twice (as the item and as its own Google event).
 *  I9  Legacy copies (plan 2.2, step v2_read): `findFeed` reports the ids of the
 *      owner's legacy `source='gcal'` items as hidden for the web feed only when
 *      the legacy calendar (`integration_account.calendar_id`) is a selected,
 *      managed-free subscription of an `active` connection that has synced
 *      successfully at least once, i.e. when its cached rows are actually served.
 *      Otherwise the copies stay visible. `/items` and `/today` never use this.
 *  I10 Webhooks only flag: `markSyncNeededByChannel` sets `needs_sync_at = now()`
 *      (a NEW value, so a sync that is running keeps the flag for the next tick).
 *      Rejections never reveal why (unknown channel, wrong token, resource
 *      mismatch, stopped/expired channel and deselected subscription look alike).
 *
 *  I11 Failures: a definite credential failure (`invalid_grant`, 401, 403 with an
 *      auth/insufficient-scope reason) sets the owner's connection to
 *      `needs_reconnect` with a constant, sanitized `last_error` and clears
 *      `needs_sync_at` of the owner's subscriptions; nothing is retried until the
 *      user reconnects. Any other failure (rate limit, one forbidden/missing
 *      calendar, 5xx, network) only backs the subscription off exponentially
 *      (1 min doubling, capped at 1 h); a success clears the backoff.
 *
 * UNVERIFIED AGAINST REAL GOOGLE (plan section 7, item 5): whether a sync token
 * obtained from a `singleEvents=false, showDeleted=true` listing keeps working
 * for the incremental calls is the documented behaviour; the window listing
 * deliberately never provides a token.
 */

export class LeaseLostError extends Error {
  constructor(subscriptionId: string) {
    super(`Lease lost for subscription ${subscriptionId}`);
    this.name = 'LeaseLostError';
  }
}

export interface LeaseHandle {
  subscriptionId: string;
  holder: string;
  epoch: number;
}

export type SyncStatus = 'disabled' | 'skipped' | 'synced' | 'rebuilt' | 'failed' | 'lease_lost';

export interface SyncResult {
  status: SyncStatus;
  /** Why a rebuild happened: initial, gone (410), series_changed, window_advance. */
  reason?: string;
}

interface SubscriptionRow {
  id: string;
  ownerId: string;
  googleCalendarId: string;
  syncToken: string | null;
  activeGeneration: number;
  windowMin: Date | null;
  windowMax: Date | null;
  /** Kept as text: a JS Date would truncate microseconds and the clear-if-unchanged compare would never match. */
  needsSyncAt: string | null;
}

export interface VisibleGoogleEvent {
  id: string;
  subscriptionId: string;
  googleEventId: string;
  recurringEventId: string | null;
  title: string;
  allDay: boolean;
  startAt: Date | null;
  endAt: Date | null;
  /** 'YYYY-MM-DD' text (never a Date), set for all-day events only. */
  startDate: string | null;
  endDateExclusive: string | null;
  status: string;
  htmlLink: string | null;
}

/** Rule I8, as a predicate over the alias `s` (google_calendar_subscription). */
const NOT_MANAGED = `NOT (s.managed OR EXISTS (SELECT 1 FROM google_calendar_publication p WHERE p.subscription_id = s.id))`;

const FEED_ZONE = 'Europe/Istanbul';

/** First visible day and the day after the last visible day of [from, to), in the feed zone. */
export function allDayBounds(from: Date, to: Date): { fromDate: string; toDateExclusive: string } {
  const fromDate = DateTime.fromJSDate(from, { zone: FEED_ZONE }).toISODate()!;
  const lastDay = DateTime.fromMillis(Math.max(to.getTime() - 1, from.getTime()), { zone: FEED_ZONE });
  return { fromDate, toDateExclusive: lastDay.plus({ days: 1 }).toISODate()! };
}

const MAX_PAGES = 2000;
const LEASE_TTL_SECONDS = 300;
const EVENT_INSERT_CHUNK = 100;
const MAX_BACKOFF_SECONDS = 3600;
/** Constant, user-safe reason stored when the grant is unusable (never the provider message). */
const NEEDS_RECONNECT_ERROR = 'google_auth_failed';

/** TypeORM returns `[rows, count]` for UPDATE/DELETE ... RETURNING; plain rows for SELECT. */
function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res) && res.length === 2 && Array.isArray(res[0]) && typeof res[1] === 'number') {
    return res[0] as T[];
  }
  return res as T[];
}

@Injectable()
export class GoogleCalendarReadSyncService {
  private readonly logger = new Logger(GoogleCalendarReadSyncService.name);

  /** Page size requested from Google (tests lower it to force pagination). */
  pageSize = 250;
  /** Clock for window math and timestamps; leases use the database clock. */
  now: () => Date = () => new Date();

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(GOOGLE_EVENTS_READER) private readonly reader: GoogleEventsReader,
  ) {}

  /** Only the literal string `true` enables the engine. */
  isEnabled(): boolean {
    return this.config.get<string>('GOOGLE_CALENDAR_V2_ENABLED') === 'true';
  }

  // ---------------------------------------------------------------------
  // Entry points
  // ---------------------------------------------------------------------

  /** Incremental sync of one subscription (rebuilds on initial/410/series change). */
  async syncSubscription(subscriptionId: string): Promise<SyncResult> {
    if (!this.isEnabled()) return { status: 'disabled' };
    return this.withLease(subscriptionId, async (lease, sub) => {
      if (!sub.syncToken || !sub.windowMin || !sub.windowMax) {
        return this.rebuild(lease, sub, { refreshToken: true, reason: 'initial' });
      }
      let delta: { items: GoogleEventDto[]; syncToken: string | undefined };
      try {
        delta = await this.fetchAll(lease, sub, {
          syncToken: sub.syncToken,
          singleEvents: false,
          showDeleted: true,
        });
      } catch (err) {
        if (googleErrorStatus(err) === 410) {
          return this.rebuild(lease, sub, { refreshToken: true, reason: 'gone' });
        }
        throw err;
      }
      // A created/changed series master cannot be expanded locally: re-read the
      // window (authoritative) and keep the delta token. Fetched, not yet written.
      if (delta.items.some((e) => e.status !== 'cancelled' && (e.recurrence?.length ?? 0) > 0)) {
        return this.rebuild(lease, sub, {
          refreshToken: false,
          tokenOverride: delta.syncToken!,
          reason: 'series_changed',
        });
      }
      await this.applyDelta(lease, sub, delta.items, delta.syncToken!);
      return { status: 'synced' };
    });
  }

  /**
   * Daily entry: moves the window forward by re-reading it into a new
   * generation (storage stays bounded for endless series). Keeps the sync token.
   */
  async advanceWindow(subscriptionId: string): Promise<SyncResult> {
    if (!this.isEnabled()) return { status: 'disabled' };
    return this.withLease(subscriptionId, (lease, sub) =>
      this.rebuild(lease, sub, { refreshToken: !sub.syncToken, reason: 'window_advance' }),
    );
  }

  /**
   * Minute-level entry for the worker: syncs subscriptions that a webhook
   * flagged (`needs_sync_at`), that never synced, or whose last sync is older
   * than the safety-net interval. Many webhooks collapse into one run.
   *
   * Failure isolation (I11): a subscription whose `next_attempt_at` is in the
   * future is skipped, and subscriptions that never failed come first, so a
   * pile of permanently failing calendars cannot fill the `limit` slots.
   */
  async runDueSyncs(limit = 20): Promise<{ attempted: number; results: SyncResult[] }> {
    if (!this.isEnabled()) return { attempted: 0, results: [] };
    const ids = await this.query<{ id: string }>(
      `SELECT s.id FROM google_calendar_subscription s
         JOIN google_calendar_connection c ON c.id = s.connection_id
        WHERE s.selected AND c.status = 'active' AND ${NOT_MANAGED}
          AND (s.lease_holder IS NULL OR s.lease_expires_at <= now())
          AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= now())
          AND (s.needs_sync_at IS NOT NULL OR s.last_sync_at IS NULL
               OR s.last_sync_at < now() - interval '30 minutes')
        ORDER BY s.consecutive_failures, s.needs_sync_at NULLS LAST, s.last_sync_at NULLS FIRST
        LIMIT $1`,
      [limit],
    );
    const results: SyncResult[] = [];
    for (const { id } of ids) results.push(await this.syncSubscription(id));
    return { attempted: ids.length, results };
  }

  /** Daily entry for the worker: window advance for subscriptions not rebuilt in ~20h. */
  async advanceDueWindows(limit = 20): Promise<{ attempted: number; results: SyncResult[] }> {
    if (!this.isEnabled()) return { attempted: 0, results: [] };
    const ids = await this.query<{ id: string }>(
      `SELECT s.id FROM google_calendar_subscription s
         JOIN google_calendar_connection c ON c.id = s.connection_id
        WHERE s.selected AND c.status = 'active' AND ${NOT_MANAGED} AND s.sync_token IS NOT NULL
          AND (s.lease_holder IS NULL OR s.lease_expires_at <= now())
          AND (s.last_full_sync_at IS NULL OR s.last_full_sync_at < now() - interval '20 hours')
        ORDER BY s.last_full_sync_at NULLS FIRST
        LIMIT $1`,
      [limit],
    );
    const results: SyncResult[] = [];
    for (const { id } of ids) results.push(await this.advanceWindow(id));
    return { attempted: ids.length, results };
  }

  /**
   * Visible Google events of one owner in [from, to). Visibility rule I2. Dates
   * come back as text so the driver can never shift them through a timezone.
   * All-day events are floating dates, so their bounds are the calendar days of
   * the range in Europe/Istanbul (not UTC). Events Husrevity itself pushed from
   * one of the owner's own non-legacy items (linked through `external_link`)
   * are left out: the item is already shown, so they would appear twice. Legacy
   * `source = 'gcal'` copies are not excluded here (rule I9 hides the item).
   */
  async findVisibleEvents(ownerId: string, from: Date, to: Date): Promise<VisibleGoogleEvent[]> {
    const { fromDate, toDateExclusive } = allDayBounds(from, to);
    const rows = await this.query<Record<string, unknown>>(
      `SELECT e.id::text AS id, e.subscription_id::text AS "subscriptionId",
              e.google_event_id AS "googleEventId", e.recurring_event_id AS "recurringEventId",
              e.title, e.all_day AS "allDay", e.start_at AS "startAt", e.end_at AS "endAt",
              e.start_date::text AS "startDate", e.end_date_exclusive::text AS "endDateExclusive",
              e.status, e.html_link AS "htmlLink"
         FROM google_calendar_event e
         JOIN google_calendar_subscription s
           ON s.id = e.subscription_id AND s.owner_id = e.owner_id
          AND e.generation = s.active_generation AND s.selected AND ${NOT_MANAGED}
        WHERE e.owner_id = $1
          AND ((NOT e.all_day AND e.start_at < $3 AND (e.end_at > $2 OR e.start_at >= $2))
            OR (e.all_day AND e.start_date < $5::date AND e.end_date_exclusive > $4::date))
          AND NOT EXISTS (
            SELECT 1 FROM external_link l
              JOIN items i ON i.id = l.item_id
             WHERE l.provider = 'google_calendar' AND l.external_id = e.google_event_id
               AND l.deleted_at IS NULL AND i.deleted_at IS NULL
               AND i.owner_id = e.owner_id AND i.source <> 'gcal')
        ORDER BY e.start_at NULLS FIRST, e.start_date, e.id`,
      [ownerId, from, to, fromDate, toDateExclusive],
    );
    return rows as unknown as VisibleGoogleEvent[];
  }

  /**
   * Data for the web calendar feed: the visible Google events plus the legacy
   * item copies the web must hide (I9). Empty while the flag is off, so the
   * legacy behaviour is untouched.
   */
  async findFeed(
    ownerId: string,
    from: Date,
    to: Date,
  ): Promise<{ events: VisibleGoogleEvent[]; hiddenLegacyItemIds: string[] }> {
    if (!this.isEnabled()) return { events: [], hiddenLegacyItemIds: [] };
    const [events, hidden] = await Promise.all([
      this.findVisibleEvents(ownerId, from, to),
      this.query<{ id: string }>(
        `SELECT i.id::text AS id FROM items i
          WHERE i.owner_id = $1 AND i.source = 'gcal' AND i.deleted_at IS NULL
            AND EXISTS (
              SELECT 1
                FROM google_calendar_subscription s
                JOIN google_calendar_connection c ON c.id = s.connection_id
                JOIN integration_account a
                  ON a.owner_id = s.owner_id AND a.provider = 'google_calendar'
                 AND a.deleted_at IS NULL AND a.calendar_id = s.google_calendar_id
               WHERE s.owner_id = $1 AND s.selected AND s.last_sync_at IS NOT NULL
                 AND c.status = 'active' AND ${NOT_MANAGED})
          ORDER BY i.id`,
        [ownerId],
      ),
    ]);
    return { events, hiddenLegacyItemIds: hidden.map((r) => r.id) };
  }

  // ---------------------------------------------------------------------
  // Selection (deselect fences in-flight work, reselect restores in full)
  // ---------------------------------------------------------------------

  /**
   * Deselects a calendar: epoch + 1, lease cleared, cached rows and token
   * dropped, in one transaction. An in-flight sync of the old epoch can no
   * longer write (I3). Returns the new epoch (-1 when the subscription is unknown).
   */
  async deselectSubscription(subscriptionId: string): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const epoch = await this.fenceSubscription(subscriptionId, m);
      if (epoch < 0) return epoch;
      await m.query(`DELETE FROM google_calendar_event WHERE subscription_id = $1`, [subscriptionId]);
      await m.query(
        `UPDATE google_calendar_subscription
            SET selected = false, sync_token = NULL, window_min = NULL, window_max = NULL,
                building_generation = NULL, needs_sync_at = NULL, last_sync_at = NULL,
                last_full_sync_at = NULL, last_error = NULL
          WHERE id = $1`,
        [subscriptionId],
      );
      return epoch;
    });
  }

  /**
   * Selects a calendar that has no subscription yet: creates the row selected
   * and flagged for an initial sync. Returns the new id, or null when the owner
   * already has a subscription for it (the caller then reselects or leaves it).
   * Bound to one owner and connection, so another owner's row can never match.
   */
  async selectSubscription(
    ownerId: string,
    connectionId: string,
    googleCalendarId: string,
    summary: string | null,
  ): Promise<string | null> {
    const rows = await this.query<{ id: string }>(
      `INSERT INTO google_calendar_subscription
         (owner_id, connection_id, google_calendar_id, summary, selected, needs_sync_at)
       VALUES ($1, $2, $3, $4, true, now())
       ON CONFLICT (owner_id, google_calendar_id) DO NOTHING
       RETURNING id::text AS id`,
      [ownerId, connectionId, googleCalendarId, summary?.slice(0, 255) ?? null],
    );
    return rows[0]?.id ?? null;
  }

  /** Selects a calendar again: no token, so the next sync is a full initial rebuild. */
  async reselectSubscription(subscriptionId: string): Promise<number> {
    const rows = await this.query<{ epoch: number }>(
      `UPDATE google_calendar_subscription
          SET selected = true, sync_token = NULL, window_min = NULL, window_max = NULL,
              epoch = epoch + 1, lease_holder = NULL, lease_expires_at = NULL,
              needs_sync_at = now(), updated_at = now()
        WHERE id = $1 RETURNING epoch`,
      [subscriptionId],
    );
    return rows[0]?.epoch ?? -1;
  }

  // ---------------------------------------------------------------------
  // Webhook routing (I10)
  // ---------------------------------------------------------------------

  /**
   * Routes a push notification by channel UUID + hashed token + resource id to
   * its subscription and flags it for the next worker tick. Returns true when
   * the channel was recognised and authentic, false for EVERY other reason
   * (flag off, unknown channel, wrong token, resource mismatch, stopped or
   * expired channel, deselected or managed subscription). `mark=false`
   * authenticates without flagging (the `sync` handshake). Never logs the token.
   */
  async markSyncNeededByChannel(
    channelId: string,
    resourceId: string,
    token: string | undefined,
    mark = true,
  ): Promise<boolean> {
    if (!this.isEnabled() || !token) return false;
    const found = await this.query<{ subscriptionId: string; tokenHash: string; resourceId: string | null }>(
      `SELECT c.subscription_id::text AS "subscriptionId", c.token_hash AS "tokenHash", c.resource_id AS "resourceId"
         FROM google_calendar_channel c
         JOIN google_calendar_subscription s ON s.id = c.subscription_id AND s.owner_id = c.owner_id
        WHERE c.id = $1::uuid AND c.stopped_at IS NULL AND c.expires_at > now()
          AND s.selected AND ${NOT_MANAGED}`,
      [channelId],
    );
    const ch = found[0];
    if (!ch) return false;
    if (!hashesMatch(ch.tokenHash, hashChannelToken(token))) return false;
    if (ch.resourceId !== null && ch.resourceId !== resourceId) return false;
    if (mark) {
      await this.query(
        `UPDATE google_calendar_subscription SET needs_sync_at = now() WHERE id = $1 AND selected`,
        [ch.subscriptionId],
      );
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Lease / epoch primitives (I3)
  // ---------------------------------------------------------------------

  /** Takes the lease when it is free or expired and bumps the epoch. null when busy/deselected. */
  async acquireLease(subscriptionId: string, holder: string = randomUUID()): Promise<LeaseHandle | null> {
    const rows = await this.query<{ epoch: number }>(
      `UPDATE google_calendar_subscription
          SET lease_holder = $2, lease_expires_at = now() + make_interval(secs => $3),
              epoch = epoch + 1, updated_at = now()
        WHERE id = $1 AND selected
          AND (lease_holder IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= now())
        RETURNING epoch`,
      [subscriptionId, holder, LEASE_TTL_SECONDS],
    );
    return rows.length ? { subscriptionId, holder, epoch: rows[0].epoch } : null;
  }

  /** Extends the lease; false (not an error) when it was lost. */
  async renewLease(lease: LeaseHandle): Promise<boolean> {
    const rows = await this.query(
      `UPDATE google_calendar_subscription
          SET lease_expires_at = now() + make_interval(secs => $4)
        WHERE id = $1 AND epoch = $2 AND lease_holder = $3 AND selected AND lease_expires_at > now()
        RETURNING id`,
      [lease.subscriptionId, lease.epoch, lease.holder, LEASE_TTL_SECONDS],
    );
    return rows.length > 0;
  }

  /** Releases only a lease that is still ours (same holder and epoch). */
  async releaseLease(lease: LeaseHandle): Promise<void> {
    await this.query(
      `UPDATE google_calendar_subscription SET lease_holder = NULL, lease_expires_at = NULL
        WHERE id = $1 AND epoch = $2 AND lease_holder = $3`,
      [lease.subscriptionId, lease.epoch, lease.holder],
    );
  }

  /**
   * Invalidates every in-flight worker of the subscription: epoch + 1 and the
   * lease cleared. Used by deselect; safe to call inside a caller's transaction
   * by passing its manager.
   */
  async fenceSubscription(subscriptionId: string, manager?: EntityManager): Promise<number> {
    const rows = await this.query<{ epoch: number }>(
      `UPDATE google_calendar_subscription
          SET epoch = epoch + 1, lease_holder = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 RETURNING epoch`,
      [subscriptionId],
      manager,
    );
    return rows[0]?.epoch ?? -1;
  }

  /**
   * First statement of every write transaction. Takes the subscription row
   * lock, so concurrent acquire/fence calls wait until this transaction ends.
   */
  async assertLease(manager: EntityManager, lease: LeaseHandle): Promise<void> {
    const rows = await this.query(
      `UPDATE google_calendar_subscription SET updated_at = now()
        WHERE id = $1 AND epoch = $2 AND lease_holder = $3 AND selected AND lease_expires_at > now()
        RETURNING id`,
      [lease.subscriptionId, lease.epoch, lease.holder],
      manager,
    );
    if (rows.length === 0) throw new LeaseLostError(lease.subscriptionId);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async query<T = unknown>(sql: string, params: unknown[] = [], manager?: EntityManager): Promise<T[]> {
    const res = await (manager ?? this.dataSource).query(sql, params);
    return rowsOf<T>(res);
  }

  private async withLease(
    subscriptionId: string,
    fn: (lease: LeaseHandle, sub: SubscriptionRow) => Promise<SyncResult>,
  ): Promise<SyncResult> {
    const lease = await this.acquireLease(subscriptionId);
    if (!lease) return { status: 'skipped' };
    let sub: SubscriptionRow | null = null;
    try {
      sub = await this.loadSubscription(subscriptionId);
      if (!sub) return { status: 'skipped' };
      return await fn(lease, sub);
    } catch (err) {
      if (err instanceof LeaseLostError) return { status: 'lease_lost' };
      const status = googleErrorStatus(err);
      // Log class and HTTP status only: provider messages can echo credentials.
      this.logger.warn(
        `Google Calendar sync failed for subscription ${subscriptionId}: ${status ?? (err as Error).name}`,
      );
      if (isDefiniteAuthFailure(err)) {
        await this.markNeedsReconnect(lease, sub?.ownerId ?? null);
        return { status: 'failed' };
      }
      await this.recordError(lease, status ? `google_${status}` : redactSecrets((err as Error).message));
      return { status: 'failed' };
    } finally {
      await this.releaseLease(lease).catch(() => undefined);
    }
  }

  private async loadSubscription(id: string): Promise<SubscriptionRow | null> {
    const rows = await this.query<SubscriptionRow>(
      `SELECT s.id::text AS id, s.owner_id::text AS "ownerId", s.google_calendar_id AS "googleCalendarId",
              s.sync_token AS "syncToken", s.active_generation AS "activeGeneration",
              s.window_min AS "windowMin", s.window_max AS "windowMax", s.needs_sync_at::text AS "needsSyncAt"
         FROM google_calendar_subscription s
         JOIN google_calendar_connection c ON c.id = s.connection_id
        WHERE s.id = $1 AND s.selected AND c.status = 'active' AND ${NOT_MANAGED}`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Records the failure and backs the subscription off: 60 s doubling per consecutive failure, capped at 1 h. */
  private async recordError(lease: LeaseHandle, message: string): Promise<void> {
    await this.query(
      `UPDATE google_calendar_subscription
          SET last_error = $4, consecutive_failures = consecutive_failures + 1,
              next_attempt_at = now() + make_interval(secs => least($5::int, 60 * power(2, least(consecutive_failures, 6)))::int)
        WHERE id = $1 AND epoch = $2 AND lease_holder = $3`,
      [lease.subscriptionId, lease.epoch, lease.holder, message.slice(0, 255), MAX_BACKOFF_SECONDS],
    ).catch(() => undefined);
  }

  /**
   * The grant is unusable: the owner's connection needs a reconnect and nothing is retried meanwhile.
   * Only an `active` connection flips (a disconnect or narrowing in progress stays as it is). `last_error`
   * is a constant label, never the provider message.
   */
  private async markNeedsReconnect(lease: LeaseHandle, ownerId: string | null): Promise<void> {
    if (!ownerId) return;
    try {
      await this.query(
        `UPDATE google_calendar_connection SET status = 'needs_reconnect', last_error = $2, updated_at = now()
          WHERE owner_id = $1 AND status = 'active'`,
        [ownerId, NEEDS_RECONNECT_ERROR],
      );
      await this.query(
        `UPDATE google_calendar_subscription
            SET needs_sync_at = NULL,
                last_error = CASE WHEN id = $2 THEN $3 ELSE last_error END
          WHERE owner_id = $1`,
        [ownerId, lease.subscriptionId, NEEDS_RECONNECT_ERROR],
      );
    } catch (err) {
      this.logger.warn(`Could not flag the Google connection as needs_reconnect: ${(err as Error).name}`);
    }
  }

  /** Fetches every page of a listing; writes nothing (I1). */
  private async fetchAll(
    lease: LeaseHandle,
    sub: SubscriptionRow,
    base: Omit<GoogleEventsListRequest, 'calendarId' | 'pageToken' | 'maxResults'>,
    onPage?: (items: GoogleEventDto[]) => Promise<void>,
  ): Promise<{ items: GoogleEventDto[]; syncToken: string | undefined }> {
    const items: GoogleEventDto[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      if (!(await this.renewLease(lease))) throw new LeaseLostError(lease.subscriptionId);
      const res = await this.reader.listEvents(sub.ownerId, {
        ...base,
        calendarId: sub.googleCalendarId,
        pageToken,
        maxResults: this.pageSize,
      });
      if (onPage) await onPage(res.items);
      else items.push(...res.items);
      if (!res.nextPageToken) {
        if (base.syncToken && !res.nextSyncToken) throw new Error('Google returned no sync token');
        return { items, syncToken: res.nextSyncToken };
      }
      pageToken = res.nextPageToken;
    }
    throw new Error('Google listing exceeded the page limit');
  }

  /** Applies a fetched delta and the new token in ONE transaction. */
  private async applyDelta(
    lease: LeaseHandle,
    sub: SubscriptionRow,
    events: GoogleEventDto[],
    newToken: string,
  ): Promise<void> {
    const window: SyncWindow = { min: sub.windowMin!, max: sub.windowMax! };
    await this.dataSource.transaction(async (m) => {
      await this.assertLease(m, lease);
      const upserts = new Map<string, MappedGoogleEvent>();
      for (const ev of events) {
        if (!ev.id) continue;
        if (ev.status === 'cancelled') {
          upserts.delete(ev.id);
          await this.removeCancelled(m, sub, ev);
          continue;
        }
        const mapped = mapGoogleEvent(ev);
        if (mapped && overlapsWindow(mapped, window)) {
          upserts.set(ev.id, mapped);
        } else {
          // Moved out of the window or unusable: make sure no stale row stays.
          upserts.delete(ev.id);
          await m.query(
            `DELETE FROM google_calendar_event WHERE subscription_id = $1 AND generation = $2 AND google_event_id = $3`,
            [sub.id, sub.activeGeneration, ev.id],
          );
        }
      }
      await this.upsertRows(m, sub, sub.activeGeneration, [...upserts.values()]);
      await m.query(
        `UPDATE google_calendar_subscription
            SET sync_token = $2, last_sync_at = now(), last_error = NULL,
                consecutive_failures = 0, next_attempt_at = NULL,
                needs_sync_at = CASE WHEN needs_sync_at IS NOT DISTINCT FROM $3::timestamptz THEN NULL ELSE needs_sync_at END
          WHERE id = $1`,
        [sub.id, newToken, sub.needsSyncAt],
      );
    });
  }

  /** Rule I5. */
  private async removeCancelled(m: EntityManager, sub: SubscriptionRow, ev: GoogleEventDto): Promise<void> {
    if (ev.recurringEventId) {
      await m.query(
        `DELETE FROM google_calendar_event WHERE subscription_id = $1 AND generation = $2 AND google_event_id = $3`,
        [sub.id, sub.activeGeneration, ev.id],
      );
      return;
    }
    await m.query(
      `DELETE FROM google_calendar_event
        WHERE subscription_id = $1 AND generation = $2 AND (google_event_id = $3 OR recurring_event_id = $3)`,
      [sub.id, sub.activeGeneration, ev.id],
    );
  }

  /**
   * Re-reads the window into the next generation and swaps it in atomically.
   * `refreshToken` first walks a full `singleEvents=false, showDeleted=true`
   * listing purely to obtain a sync token (taken BEFORE the window read, so a
   * change in between is replayed by the next delta, which is idempotent).
   * Old rows stay visible until the final transaction; a failure anywhere
   * leaves them and the old token untouched (staged rows are invisible, I2).
   */
  private async rebuild(
    lease: LeaseHandle,
    sub: SubscriptionRow,
    opts: { refreshToken: boolean; tokenOverride?: string; reason: string },
  ): Promise<SyncResult> {
    let token = opts.tokenOverride ?? sub.syncToken;
    if (opts.refreshToken) {
      const walked = await this.fetchAll(lease, sub, { singleEvents: false, showDeleted: true }, async () => undefined);
      if (!walked.syncToken) throw new Error('Google returned no sync token');
      token = walked.syncToken;
    }
    if (!token) throw new Error('No sync token available for rebuild');

    const window = computeWindow(this.now());
    const building = sub.activeGeneration + 1;

    await this.dataSource.transaction(async (m) => {
      await this.assertLease(m, lease);
      // Leftovers of an earlier failed rebuild would collide with the staging generation.
      await m.query(
        `DELETE FROM google_calendar_event WHERE subscription_id = $1 AND generation <> $2`,
        [sub.id, sub.activeGeneration],
      );
      await m.query(`UPDATE google_calendar_subscription SET building_generation = $2 WHERE id = $1`, [
        sub.id,
        building,
      ]);
    });

    await this.fetchAll(
      lease,
      sub,
      { singleEvents: true, showDeleted: false, timeMin: window.min.toISOString(), timeMax: window.max.toISOString() },
      async (items) => {
        const rows = items
          .filter((e) => e.status !== 'cancelled')
          .map((e) => mapGoogleEvent(e))
          .filter((r): r is MappedGoogleEvent => r !== null && overlapsWindow(r, window));
        await this.dataSource.transaction(async (m) => {
          await this.assertLease(m, lease);
          await this.upsertRows(m, sub, building, rows);
        });
      },
    );

    await this.dataSource.transaction(async (m) => {
      await this.assertLease(m, lease);
      await m.query(
        `UPDATE google_calendar_subscription
            SET active_generation = $2, building_generation = NULL, sync_token = $3,
                window_min = $4, window_max = $5, last_sync_at = now(), last_full_sync_at = now(),
                last_error = NULL, consecutive_failures = 0, next_attempt_at = NULL,
                needs_sync_at = CASE WHEN needs_sync_at IS NOT DISTINCT FROM $6::timestamptz THEN NULL ELSE needs_sync_at END
          WHERE id = $1`,
        [sub.id, building, token, window.min, window.max, sub.needsSyncAt],
      );
      await m.query(
        `DELETE FROM google_calendar_event WHERE subscription_id = $1 AND generation <> $2`,
        [sub.id, building],
      );
    });
    return { status: 'rebuilt', reason: opts.reason };
  }

  private async upsertRows(
    m: EntityManager,
    sub: SubscriptionRow,
    generation: number,
    rows: MappedGoogleEvent[],
  ): Promise<void> {
    // One statement cannot touch the same key twice: keep the last row per id.
    const byId = new Map(rows.map((r) => [r.googleEventId, r]));
    const unique = [...byId.values()];
    for (let i = 0; i < unique.length; i += EVENT_INSERT_CHUNK) {
      const chunk = unique.slice(i, i + EVENT_INSERT_CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((r) => {
        const base = params.length;
        params.push(
          sub.ownerId,
          sub.id,
          generation,
          r.googleEventId,
          r.recurringEventId,
          r.originalStartAt,
          r.originalStartDate,
          r.status,
          r.title,
          r.allDay,
          r.startAt,
          r.endAt,
          r.startDate,
          r.endDateExclusive,
          r.htmlLink,
          r.etag,
          r.googleUpdatedAt,
        );
        const p = (n: number): string => `$${base + n}`;
        return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}::date, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}, ${p(12)}, ${p(13)}::date, ${p(14)}::date, ${p(15)}, ${p(16)}, ${p(17)})`;
      });
      await m.query(
        `INSERT INTO google_calendar_event
           (owner_id, subscription_id, generation, google_event_id, recurring_event_id, original_start_at,
            original_start_date, status, title, all_day, start_at, end_at, start_date, end_date_exclusive,
            html_link, etag, google_updated_at)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (subscription_id, generation, google_event_id) DO UPDATE SET
           recurring_event_id = EXCLUDED.recurring_event_id, original_start_at = EXCLUDED.original_start_at,
           original_start_date = EXCLUDED.original_start_date, status = EXCLUDED.status, title = EXCLUDED.title,
           all_day = EXCLUDED.all_day, start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
           start_date = EXCLUDED.start_date, end_date_exclusive = EXCLUDED.end_date_exclusive,
           html_link = EXCLUDED.html_link, etag = EXCLUDED.etag,
           google_updated_at = EXCLUDED.google_updated_at, updated_at = now()`,
        params,
      );
    }
  }
}
