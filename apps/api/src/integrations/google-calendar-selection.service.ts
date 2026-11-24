import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { GoogleCalendarChoiceDto } from './dto/google-calendar-v2-dtos';
import { hashChannelToken } from './channel-token';
import {
  GOOGLE_CALENDAR_GATEWAY,
  GoogleCalendarGateway,
  GoogleCalendarListEntry,
} from './google-calendar-gateway';
import { GoogleCalendarReadSyncService, VisibleGoogleEvent } from './google-calendar-read-sync.service';
import { GoogleCalendarConfig } from './google-calendar.config';
import { BROAD_CALENDAR_SCOPE, GoogleCalendarMode, REVOKE_FAILED_TOMBSTONE_SQL, deriveMode, sanitizeLastError } from './google-calendar-v2.util';
import { googleErrorStatus } from './google-events-reader';
import { redactSecrets } from './log-redaction';

/** Additive fields of `GET /integrations/google-calendar/status`. */
export interface GoogleStatusExtras {
  v2Enabled: boolean;
  mode: GoogleCalendarMode;
  needsReconnect: boolean;
  selectedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Optional write-back opt-in (additive; always false while the flag is off). */
  writeEnabled: boolean;
  /** A disconnect could not revoke the Google grant after all retries: it may still be active in the user's Google Account. */
  revokeFailed: boolean;
  /**
   * Flag-off rollback: the stored grant is narrowed (no broad calendar scope), so the legacy
   * engine cannot run and sync is paused (nothing is read or written, cached data stays).
   * Always false while the new model is on. Additive.
   */
  paused: boolean;
}

interface LocalSubscription {
  id: string;
  googleCalendarId: string;
  selected: boolean;
  managed: boolean;
  summary: string | null;
}

/** Rule I8 of the read engine: a `managed` subscription (or one with a publication row) is the managed Husrevity calendar. */
const IS_MANAGED = `(s.managed OR EXISTS (SELECT 1 FROM google_calendar_publication p WHERE p.subscription_id = s.id))`;

/** A channel just registered lives until Google reports its real expiry. */
const PLACEHOLDER_CHANNEL_TTL_SECONDS = 3600;

/** A channel is renewed once it expires within this many hours (or already expired). */
const RENEW_WITHIN_HOURS = 24;
const RENEW_BATCH = 50;

/**
 * Calendar picker logic of the new Google Calendar model (plan slice 7):
 * lists the user's Google calendars merged with the local selection, applies a
 * selection through the engine's select/deselect/reselect primitives, keeps one
 * push channel per selected calendar and answers the status/feed read paths.
 *
 * Every statement is bound to the caller's owner id; a subscription id coming
 * from the database is only ever used after an owner-scoped lookup. Nothing
 * here touches Google or the new tables while GOOGLE_CALENDAR_V2_ENABLED is
 * not the literal `true` (the controller answers 404 before reaching it).
 * Channels last about a week and are renewed by `renewDueChannels`.
 */
@Injectable()
export class GoogleCalendarSelectionService {
  private readonly logger = new Logger(GoogleCalendarSelectionService.name);
  /** Serialises selection updates per owner inside this process (double clicks, retries). */
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly readSync: GoogleCalendarReadSyncService,
    @Inject(GOOGLE_CALENDAR_GATEWAY) private readonly gateway: GoogleCalendarGateway,
    private readonly calendarConfig: GoogleCalendarConfig,
  ) {}

  /** Only the literal string `true` enables the new model. */
  isEnabled(): boolean {
    return this.config.get<string>('GOOGLE_CALENDAR_V2_ENABLED') === 'true';
  }

  // ---------------------------------------------------------------------
  // Picker
  // ---------------------------------------------------------------------

  async listCalendars(ownerId: string): Promise<GoogleCalendarChoiceDto[]> {
    await this.requireUsableAccount(ownerId, { allowReconnectState: true });
    const [entries, local] = await Promise.all([this.gateway.listCalendars(ownerId), this.localSubscriptions(ownerId)]);
    const byId = new Map(local.map((s) => [s.googleCalendarId, s]));
    return entries.map((e) => {
      const sub = byId.get(e.id);
      const managed = sub?.managed ?? false;
      return {
        id: e.id,
        summary: e.summary,
        backgroundColor: e.backgroundColor,
        accessRole: e.accessRole,
        primary: e.primary,
        selected: managed ? false : (sub?.selected ?? false),
        managed,
      };
    });
  }

  /** Replaces the owner's selection with `selected` (an empty list deselects everything). */
  async updateSelection(ownerId: string, selected: string[]): Promise<{ selected: string[] }> {
    return this.serialised(ownerId, () => this.applySelection(ownerId, selected));
  }

  private async applySelection(ownerId: string, wanted: string[]): Promise<{ selected: string[] }> {
    const account = await this.requireUsableAccount(ownerId, { allowReconnectState: false });
    const entries = new Map((await this.gateway.listCalendars(ownerId)).map((e) => [e.id, e]));
    const local = await this.localSubscriptions(ownerId);
    const localById = new Map(local.map((s) => [s.googleCalendarId, s]));

    for (const id of wanted) {
      const entry = entries.get(id);
      if (!entry) throw ApiException.badRequest('Unknown calendar in the selection');
      if (localById.get(id)?.managed) throw ApiException.badRequest('The Husrevity calendar cannot be selected');
      if (entry.accessRole === 'freeBusyReader') {
        throw ApiException.badRequest('Calendars that only share free/busy information cannot be selected');
      }
    }

    const connectionId = await this.upsertConnection(ownerId, account);
    const wantedSet = new Set(wanted);
    const subscriptionIds: string[] = [];

    for (const id of wanted) {
      subscriptionIds.push(await this.selectOne(ownerId, connectionId, entries.get(id)!, localById.get(id)));
    }

    for (const sub of local) {
      if (sub.selected && !sub.managed && !wantedSet.has(sub.googleCalendarId)) {
        await this.readSync.deselectSubscription(sub.id);
        await this.stopChannels(ownerId, sub.id);
      }
    }

    // Channels last: a failure here must not undo a valid selection.
    for (const subscriptionId of subscriptionIds) {
      await this.ensureChannel(ownerId, subscriptionId);
    }
    return { selected: [...wanted] };
  }

  /** Select-new, reselect or no-op for one calendar; returns the subscription id. */
  private async selectOne(
    ownerId: string,
    connectionId: string,
    entry: GoogleCalendarListEntry,
    existing: LocalSubscription | undefined,
  ): Promise<string> {
    let current = existing;
    if (!current) {
      const created = await this.readSync.selectSubscription(ownerId, connectionId, entry.id, entry.summary);
      if (created) return created;
      // Lost a race with another writer of the same owner: fall through as an existing row.
      current = (await this.localSubscriptions(ownerId)).find((s) => s.googleCalendarId === entry.id);
      if (!current) throw new Error('Subscription vanished during selection');
    }
    if (!current.selected) {
      await this.readSync.reselectSubscription(current.id);
    }
    if (current.summary !== entry.summary) {
      await this.dataSource.query(
        `UPDATE google_calendar_subscription SET summary = $3 WHERE id = $1 AND owner_id = $2`,
        [current.id, ownerId, entry.summary.slice(0, 255)],
      );
    }
    return current.id;
  }

  // ---------------------------------------------------------------------
  // Push channels
  // ---------------------------------------------------------------------

  /**
   * Registers one channel for the subscription unless an active one exists or
   * no webhook address is configured. The row is written BEFORE the Google
   * call (Google pushes a handshake right away) and removed again on failure.
   * The raw token only goes to Google; only its hash is stored.
   */
  private async ensureChannel(ownerId: string, subscriptionId: string): Promise<void> {
    const address = this.calendarConfig.webhookUrl;
    if (!address) return;
    const rows = await this.dataSource.query(
      `SELECT s.google_calendar_id AS "calendarId",
              EXISTS (SELECT 1 FROM google_calendar_channel c
                       WHERE c.subscription_id = s.id AND c.owner_id = s.owner_id
                         AND c.stopped_at IS NULL AND c.expires_at > now()) AS "hasChannel"
         FROM google_calendar_subscription s
        WHERE s.id = $1 AND s.owner_id = $2 AND s.selected`,
      [subscriptionId, ownerId],
    );
    const row = rows[0] as { calendarId: string; hasChannel: boolean } | undefined;
    if (!row || row.hasChannel) return;

    const channelId = randomUUID();
    const token = randomBytes(24).toString('base64url');
    try {
      await this.dataSource.query(
        `INSERT INTO google_calendar_channel (id, owner_id, subscription_id, token_hash, resource_id, expires_at)
         VALUES ($1, $2, $3, $4, NULL, now() + make_interval(secs => $5))`,
        [channelId, ownerId, subscriptionId, hashChannelToken(token), PLACEHOLDER_CHANNEL_TTL_SECONDS],
      );
      const res = await this.gateway.watchEvents(ownerId, {
        calendarId: row.calendarId,
        channelId,
        address,
        token,
      });
      await this.dataSource.query(
        `UPDATE google_calendar_channel SET resource_id = $2, expires_at = $3 WHERE id = $1 AND owner_id = $4`,
        [channelId, res.resourceId, res.expiresAt, ownerId],
      );
    } catch (err) {
      this.logger.warn(`Google Calendar channel registration failed: ${this.errorLabel(err)}`);
      await this.dataSource
        .query(`DELETE FROM google_calendar_channel WHERE id = $1 AND owner_id = $2`, [channelId, ownerId])
        .catch(() => undefined);
    }
  }

  /**
   * Renews push channels that expire within 24 hours (or already expired but
   * were never stopped) and creates the channel of a selected subscription that
   * has none at all (its first registration failed). Only selected, non-managed subscriptions of `active`
   * connections qualify, and nothing happens while the flag is off.
   *
   * Per subscription: take the engine lease (so two instances or a running sync
   * never renew the same subscription at once; the loser skips), re-check that
   * the renewal is still needed, register the NEW channel first and only then
   * stop the old ones. If the new registration fails the old channel is left
   * untouched and the next run retries. If Google refuses to stop an old
   * channel it is still marked stopped locally (logged without provider
   * details), so the webhook routes only the new channel; Google lets the
   * orphan expire on its own.
   */
  async renewDueChannels(): Promise<{ attempted: number; renewed: number }> {
    if (!this.isEnabled() || !this.calendarConfig.webhookUrl) return { attempted: 0, renewed: 0 };
    // Two kinds of subscription are due: one whose live channel is about to expire, and a selected
    // one that has no live channel at all (its first registration failed, e.g. Google was down).
    const due = (await this.dataSource.query(
      `SELECT d.id FROM (
         SELECT s.id::text AS id
           FROM google_calendar_channel c
           JOIN google_calendar_subscription s ON s.id = c.subscription_id AND s.owner_id = c.owner_id
           JOIN google_calendar_connection n ON n.id = s.connection_id
          WHERE c.stopped_at IS NULL AND c.expires_at < now() + make_interval(hours => $1)
            AND s.selected AND n.status = 'active' AND NOT ${IS_MANAGED}
         UNION
         SELECT s.id::text AS id
           FROM google_calendar_subscription s
           JOIN google_calendar_connection n ON n.id = s.connection_id
          WHERE s.selected AND n.status = 'active' AND NOT ${IS_MANAGED}
            AND NOT EXISTS (SELECT 1 FROM google_calendar_channel c
                             WHERE c.subscription_id = s.id AND c.owner_id = s.owner_id AND c.stopped_at IS NULL)
       ) d
       LIMIT $2`,
      [RENEW_WITHIN_HOURS, RENEW_BATCH],
    )) as { id: string }[];
    let renewed = 0;
    for (const { id } of due) {
      try {
        if (await this.renewSubscriptionChannel(id)) renewed += 1;
      } catch (err) {
        this.logger.warn(`Google Calendar channel renewal failed: ${this.errorLabel(err)}`);
      }
    }
    return { attempted: due.length, renewed };
  }

  private async renewSubscriptionChannel(subscriptionId: string): Promise<boolean> {
    const lease = await this.readSync.acquireLease(subscriptionId);
    if (!lease) return false;
    try {
      const rows = (await this.dataSource.query(
        `SELECT s.owner_id::text AS "ownerId", s.google_calendar_id AS "calendarId",
                EXISTS (SELECT 1 FROM google_calendar_channel c
                         WHERE c.subscription_id = s.id AND c.owner_id = s.owner_id
                           AND c.stopped_at IS NULL AND c.expires_at >= now() + make_interval(hours => $2)) AS "healthy"
           FROM google_calendar_subscription s
           JOIN google_calendar_connection n ON n.id = s.connection_id
          WHERE s.id = $1 AND s.selected AND n.status = 'active' AND NOT ${IS_MANAGED}`,
        [subscriptionId, RENEW_WITHIN_HOURS],
      )) as { ownerId: string; calendarId: string; healthy: boolean }[];
      const row = rows[0];
      const address = this.calendarConfig.webhookUrl;
      // Another instance may have renewed between the due scan and the lease.
      if (!row || row.healthy || !address) return false;

      const old = (await this.dataSource.query(
        `SELECT id::text AS id, resource_id AS "resourceId" FROM google_calendar_channel
          WHERE subscription_id = $1 AND owner_id = $2 AND stopped_at IS NULL`,
        [subscriptionId, row.ownerId],
      )) as { id: string; resourceId: string | null }[];

      const channelId = randomUUID();
      const token = randomBytes(24).toString('base64url');
      try {
        await this.dataSource.query(
          `INSERT INTO google_calendar_channel (id, owner_id, subscription_id, token_hash, resource_id, expires_at)
           VALUES ($1, $2, $3, $4, NULL, now() + make_interval(secs => $5))`,
          [channelId, row.ownerId, subscriptionId, hashChannelToken(token), PLACEHOLDER_CHANNEL_TTL_SECONDS],
        );
        const res = await this.gateway.watchEvents(row.ownerId, { calendarId: row.calendarId, channelId, address, token });
        await this.dataSource.query(
          `UPDATE google_calendar_channel SET resource_id = $2, expires_at = $3 WHERE id = $1 AND owner_id = $4`,
          [channelId, res.resourceId, res.expiresAt, row.ownerId],
        );
      } catch (err) {
        this.logger.warn(`Google Calendar channel renewal registration failed: ${this.errorLabel(err)}`);
        await this.dataSource
          .query(`DELETE FROM google_calendar_channel WHERE id = $1 AND owner_id = $2`, [channelId, row.ownerId])
          .catch(() => undefined);
        return false;
      }

      for (const ch of old) {
        if (ch.resourceId) {
          try {
            await this.gateway.stopChannel(row.ownerId, ch.id, ch.resourceId);
          } catch (err) {
            this.logger.warn(`Google Calendar old channel stop failed: ${this.errorLabel(err)}`);
          }
        }
        await this.dataSource.query(
          `UPDATE google_calendar_channel SET stopped_at = now() WHERE id = $1 AND owner_id = $2`,
          [ch.id, row.ownerId],
        );
      }
      return true;
    } finally {
      await this.readSync.releaseLease(lease);
    }
  }

  /** Stops every active channel of the owner (best effort, each one recorded as stopped locally). */
  async stopAllChannels(ownerId: string): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT DISTINCT subscription_id::text AS id FROM google_calendar_channel
        WHERE owner_id = $1 AND stopped_at IS NULL`,
      [ownerId],
    )) as { id: string }[];
    for (const r of rows) await this.stopChannels(ownerId, r.id);
  }

  /** Registers a channel for every selected, non-managed calendar that has none (used after a reconnect). */
  async registerChannelsForSelected(ownerId: string): Promise<void> {
    for (const s of await this.localSubscriptions(ownerId)) {
      if (s.selected && !s.managed) await this.ensureChannel(ownerId, s.id);
    }
  }

  /** Stops every active channel of the subscription. A refusal by Google still marks it stopped locally. */
  private async stopChannels(ownerId: string, subscriptionId: string): Promise<void> {
    const active = (await this.dataSource.query(
      `SELECT id::text AS id, resource_id AS "resourceId" FROM google_calendar_channel
        WHERE subscription_id = $1 AND owner_id = $2 AND stopped_at IS NULL`,
      [subscriptionId, ownerId],
    )) as { id: string; resourceId: string | null }[];
    for (const ch of active) {
      if (ch.resourceId) {
        try {
          await this.gateway.stopChannel(ownerId, ch.id, ch.resourceId);
        } catch (err) {
          this.logger.warn(`Google Calendar channel stop failed: ${this.errorLabel(err)}`);
        }
      }
      await this.dataSource.query(
        `UPDATE google_calendar_channel SET stopped_at = now() WHERE id = $1 AND owner_id = $2`,
        [ch.id, ownerId],
      );
    }
  }

  // ---------------------------------------------------------------------
  // Status and feed
  // ---------------------------------------------------------------------

  /**
   * Additive status fields. With the flag off this is the legacy shape and
   * nothing but the passed-in legacy account data is used.
   */
  async statusExtras(
    ownerId: string,
    legacy: { connected: boolean; lastSyncAt: Date | null; scopes: string[] },
  ): Promise<GoogleStatusExtras> {
    const revokeFailed = !legacy.connected && (await this.hasRevokeFailedTombstone(ownerId));
    if (!this.isEnabled()) {
      return {
        paused: legacy.connected && legacy.scopes.length > 0 && !legacy.scopes.includes(BROAD_CALENDAR_SCOPE),
        v2Enabled: false,
        mode: 'legacy',
        needsReconnect: false,
        selectedCount: 0,
        lastSyncAt: legacy.lastSyncAt ? legacy.lastSyncAt.toISOString() : null,
        lastError: null,
        writeEnabled: false,
        revokeFailed,
      };
    }
    try {
      const conn = (await this.dataSource.query(
        `SELECT status, granted_scopes AS "grantedScopes", last_error AS "lastError", write_enabled AS "writeEnabled"
           FROM google_calendar_connection WHERE owner_id = $1`,
        [ownerId],
      )) as { status: string; grantedScopes: string[]; lastError: string | null; writeEnabled: boolean }[];
      const agg = (await this.dataSource.query(
        `SELECT count(*)::int AS "selectedCount", max(s.last_sync_at) AS "lastSyncAt",
                (SELECT s2.last_error FROM google_calendar_subscription s2
                  WHERE s2.owner_id = $1 AND s2.selected AND s2.last_error IS NOT NULL
                    AND NOT (s2.managed OR EXISTS (SELECT 1 FROM google_calendar_publication p WHERE p.subscription_id = s2.id))
                  ORDER BY s2.updated_at DESC, s2.id DESC LIMIT 1) AS "lastError"
           FROM google_calendar_subscription s
          WHERE s.owner_id = $1 AND s.selected AND NOT ${IS_MANAGED}`,
        [ownerId],
      )) as { selectedCount: number; lastSyncAt: Date | null; lastError: string | null }[];
      const scopes = conn[0]?.grantedScopes?.length ? conn[0].grantedScopes : legacy.scopes;
      // Read-only wording only for an owner who is actually on the v2 engine (live connection row);
      // a legacy user without one is still written for by the legacy engine.
      const onV2 = conn[0]?.status === 'active' || conn[0]?.status === 'needs_reconnect';
      return {
        paused: false,
        v2Enabled: true,
        mode: onV2 ? deriveMode(true, scopes) : 'legacy',
        needsReconnect: conn[0]?.status === 'needs_reconnect',
        selectedCount: agg[0]?.selectedCount ?? 0,
        lastSyncAt: agg[0]?.lastSyncAt ? new Date(agg[0].lastSyncAt).toISOString() : null,
        lastError: sanitizeLastError(agg[0]?.lastError ?? conn[0]?.lastError ?? null),
        writeEnabled: conn[0]?.writeEnabled === true,
        revokeFailed,
      };
    } catch (err) {
      // The status call also serves the legacy connect/disconnect card: never let the new tables break it.
      this.logger.warn(`Google Calendar status extras failed: ${this.errorLabel(err)}`);
      return {
        paused: false,
        v2Enabled: true,
        mode: deriveMode(true, legacy.scopes),
        needsReconnect: false,
        selectedCount: 0,
        lastSyncAt: null,
        lastError: null,
        writeEnabled: false,
        revokeFailed,
      };
    }
  }

  /** The tombstone left when the revoke retries were abandoned. Lookup failures read as "no". */
  private async hasRevokeFailedTombstone(ownerId: string): Promise<boolean> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT 1 FROM google_calendar_connection WHERE owner_id = $1 AND ${REVOKE_FAILED_TOMBSTONE_SQL} LIMIT 1`,
        [ownerId],
      )) as unknown[];
      return rows.length > 0;
    } catch (err) {
      this.logger.warn(`Google Calendar revoke-failed lookup failed: ${this.errorLabel(err)}`);
      return false;
    }
  }

  feed(ownerId: string, from: Date, to: Date): Promise<{ events: VisibleGoogleEvent[]; hiddenLegacyItemIds: string[] }> {
    return this.readSync.findFeed(ownerId, from, to);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async localSubscriptions(ownerId: string): Promise<LocalSubscription[]> {
    return (await this.dataSource.query(
      `SELECT s.id::text AS id, s.google_calendar_id AS "googleCalendarId", s.selected, s.summary,
              ${IS_MANAGED} AS managed
         FROM google_calendar_subscription s WHERE s.owner_id = $1`,
      [ownerId],
    )) as LocalSubscription[];
  }

  /** The owner's connected integration account (read-only; tokens are never read). */
  private async requireUsableAccount(
    ownerId: string,
    opts: { allowReconnectState: boolean },
  ): Promise<{ id: string; scopes: string[] }> {
    const accounts = (await this.dataSource.query(
      `SELECT a.id::text AS id, a.scopes FROM integration_account a
        WHERE a.owner_id = $1 AND a.provider = 'google_calendar' AND a.deleted_at IS NULL
          AND a.status = 'connected'
        ORDER BY a.id DESC LIMIT 1`,
      [ownerId],
    )) as { id: string; scopes: string[] }[];
    if (accounts.length === 0) throw ApiException.notFound('Google Calendar is not connected');
    if (!opts.allowReconnectState) {
      const conn = (await this.dataSource.query(
        `SELECT status FROM google_calendar_connection WHERE owner_id = $1`,
        [ownerId],
      )) as { status: string }[];
      if (conn[0] && conn[0].status !== 'active') {
        throw ApiException.conflict('Google Calendar must be reconnected before the selection can change');
      }
    }
    return accounts[0];
  }

  private async upsertConnection(ownerId: string, account: { id: string; scopes: string[] }): Promise<string> {
    const rows = (await this.dataSource.query(
      `INSERT INTO google_calendar_connection (owner_id, integration_account_id, granted_scopes)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (owner_id) DO UPDATE
         SET integration_account_id = EXCLUDED.integration_account_id,
             granted_scopes = EXCLUDED.granted_scopes, updated_at = now()
       RETURNING id::text AS id`,
      [ownerId, account.id, JSON.stringify(account.scopes ?? [])],
    )) as { id: string }[];
    return rows[0].id;
  }

  private async serialised<T>(ownerId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(ownerId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.tails.set(ownerId, tail);
    try {
      return await run;
    } finally {
      if (this.tails.get(ownerId) === tail) this.tails.delete(ownerId);
    }
  }

  /** Class and HTTP status only: provider messages can echo credentials. */
  private errorLabel(err: unknown): string {
    const status = googleErrorStatus(err);
    return status ? `google_${status}` : redactSecrets((err as Error)?.name ?? 'Error');
  }
}
