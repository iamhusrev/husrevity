import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { CryptoService } from '../crypto/crypto.service';
import { GOOGLE_CALENDAR_GATEWAY, GoogleCalendarGateway } from './google-calendar-gateway';
import { CALENDAR_NARROW_SCOPES, GoogleCalendarConnectService } from './google-calendar-connect.service';
import { GoogleCalendarEngineService } from './google-calendar-engine.service';
import { GoogleCalendarSelectionService } from './google-calendar-selection.service';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { MAX_REVOKE_ATTEMPTS, deriveMode } from './google-calendar-v2.util';
import { googleErrorStatus } from './google-events-reader';
import { isGoogleNotConfiguredError } from './google-error';
import { redactSecrets } from './log-redaction';

export { MAX_REVOKE_ATTEMPTS };

const MSG_NARROW_MISMATCH = 'Google returned a different permission set than the read-only access requested';
const MSG_NARROW_NO_REFRESH = 'Google did not return a refresh token; reconnect to finish narrowing';
const MSG_NARROW_ABANDONED = 'Permission change was not completed; reconnect to continue';

/** The only scopes a narrowing consent may come back with. */
const NARROW_ALLOW_LIST = new Set(CALENDAR_NARROW_SCOPES);

interface AccountRow {
  id: string;
  status: string;
  encryptedAccess: string | null;
  encryptedRefresh: string | null;
  /** Legacy watch channel kept on the account row. */
  channelId: string | null;
  resourceId: string | null;
}

/**
 * Account lifecycle of the new Google Calendar model (plan slice 9):
 *
 *  - narrowing: pause sync, stop channels, REVOKE the existing grant, then a new
 *    consent with only the read-only scopes; the callback stores a token only
 *    when the granted set is inside the allow-list.
 *  - disconnect (every mode, v2 flag on or off): stop the channels INCLUDING the
 *    legacy watch channel on `integration_account`, revoke, then permanently purge
 *    the integration account (tokens) and the Google tables of the owner in one
 *    transaction. A failed revoke keeps a retry record on `google_calendar_connection`
 *    (and the encrypted token on the account row, needed for the retry) while all
 *    synced data is purged right away; a worker retries. When the retries are
 *    abandoned the token is deleted and a tombstone connection row (disconnected,
 *    attempts at the maximum) remembers that the grant may still be active.
 *  - legacy `gcal` item copies are never deleted by a plain disconnect. They go only
 *    through the explicit confirm option of the disconnect or the owner-scoped purge
 *    (`purgeLegacyCopies`, usable in every mode and after a disconnect), and only items
 *    with source `gcal` and their links are ever touched.
 *  - a legacy owner (an account with a `calendar_id`) keeps a TOKENLESS `disconnected`
 *    integration_account row after a disconnect: empty access token, no refresh token,
 *    no scopes, no sync token, no channel. Only the calendar id survives, so a reconnect
 *    reuses the same Google calendar and the existing links keep working. Every reader
 *    treats a non-`connected` row as not connected and the empty token never decrypts.
 *
 * Every statement is bound to the caller's owner id. Tokens are never logged.
 */
@Injectable()
export class GoogleCalendarLifecycleService {
  private readonly logger = new Logger(GoogleCalendarLifecycleService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly accounts: IntegrationAccountService,
    private readonly connect: GoogleCalendarConnectService,
    private readonly selection: GoogleCalendarSelectionService,
    private readonly calendarConfig: GoogleCalendarConfig,
    private readonly engine: GoogleCalendarEngineService,
    @Inject(GOOGLE_CALENDAR_GATEWAY) private readonly gateway: GoogleCalendarGateway,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('GOOGLE_CALENDAR_V2_ENABLED') === 'true';
  }

  // ---------------------------------------------------------------------
  // Narrowing
  // ---------------------------------------------------------------------

  /**
   * Pauses sync, stops the channels, revokes the current grant and hands out a
   * start ticket for the read-only consent. Idempotent: a repeated call after an
   * abandoned attempt simply starts over (an already invalid token counts as revoked).
   */
  async beginNarrow(ownerId: string, codeChallenge: string): Promise<{ ticket: string }> {
    if (!this.calendarConfig.isConfigured()) {
      throw ApiException.badRequest('Google Calendar integration is not configured');
    }
    const account = await this.findAccount(ownerId, ['connected']);
    if (!account) throw ApiException.notFound('Google Calendar is not connected');
    const scopes = await this.currentScopes(ownerId, account.id);
    if (deriveMode(true, scopes) !== 'v2_read') {
      throw ApiException.conflict('Google Calendar permissions are already narrowed');
    }

    await this.markNeedsReconnect(ownerId, account.id, MSG_NARROW_ABANDONED);
    await this.dataSource.query(
      `UPDATE google_calendar_subscription SET needs_sync_at = NULL WHERE owner_id = $1`,
      [ownerId],
    );
    await this.selection.stopAllChannels(ownerId);
    try {
      await this.revokeAccountTokens(account);
    } catch (err) {
      this.logger.warn(`Google token revoke failed while narrowing: ${this.errorLabel(err)}`);
      throw new ApiException('Could not revoke the existing Google permission', 502);
    }
    return this.connect.begin(ownerId, codeChallenge, { narrow: true });
  }

  /**
   * Callback of a narrowing consent. Returns true when the read-only token was
   * stored. Any other outcome stores nothing, revokes what Google just issued
   * (best effort) and leaves the connection in needs_reconnect.
   */
  async completeNarrow(ownerId: string, code: string): Promise<boolean> {
    const account = await this.findAccount(ownerId, ['connected']);
    if (!account) return false;

    let tokens: { access_token?: string | null; refresh_token?: string | null; scope?: string | null };
    try {
      tokens = (await this.calendarConfig.createOAuth2Client().getToken(code)).tokens;
    } catch (err) {
      this.logger.warn(`Google code exchange failed while narrowing: ${this.errorLabel(err)}`);
      await this.markNeedsReconnect(ownerId, account.id, MSG_NARROW_ABANDONED);
      return false;
    }

    const granted = (tokens.scope ?? '').split(/\s+/).filter(Boolean);
    const inAllowList = granted.length > 0 && granted.every((s) => NARROW_ALLOW_LIST.has(s));
    const hasAll = CALENDAR_NARROW_SCOPES.every((s) => granted.includes(s));
    if (!tokens.access_token || !inAllowList || !hasAll || !tokens.refresh_token) {
      const reason = !inAllowList || !hasAll ? MSG_NARROW_MISMATCH : MSG_NARROW_NO_REFRESH;
      await this.markNeedsReconnect(ownerId, account.id, reason);
      const issued = tokens.refresh_token ?? tokens.access_token;
      if (issued) {
        await this.gateway.revokeToken(issued).catch((err) => {
          this.logger.warn(`Revoking a rejected Google token failed: ${this.errorLabel(err)}`);
        });
      }
      return false;
    }

    await this.accounts.save(
      ownerId,
      'google_calendar',
      { accessToken: tokens.access_token, refreshToken: tokens.refresh_token },
      granted,
    );
    await this.dataSource.query(
      `INSERT INTO google_calendar_connection (owner_id, integration_account_id, status, granted_scopes)
       VALUES ($1, $2, 'active', $3::jsonb)
       ON CONFLICT (owner_id) DO UPDATE
         SET integration_account_id = EXCLUDED.integration_account_id, status = 'active',
             granted_scopes = EXCLUDED.granted_scopes, last_error = NULL, updated_at = now()`,
      [ownerId, account.id, JSON.stringify(granted)],
    );
    // Cached events stayed; resume with a fresh incremental pass and new channels.
    await this.dataSource.query(
      `UPDATE google_calendar_subscription SET needs_sync_at = now() WHERE owner_id = $1 AND selected`,
      [ownerId],
    );
    await this.selection.registerChannelsForSelected(ownerId).catch((err) => {
      this.logger.warn(`Channel registration after narrowing failed: ${this.errorLabel(err)}`);
    });
    return true;
  }

  /**
   * A successful regular connect with the new model on: upserts the connection row as
   * `active`, linked to the integration account and carrying the granted scopes, and
   * clears any pending revoke (a failed revoke of an earlier disconnect must never
   * reach the freshly connected token). The owner is on the v2 engine from this
   * moment, before any calendar is picked. After an abandoned narrowing the cached
   * selection also resumes syncing.
   */
  async markReconnected(ownerId: string, grantedScopes: string[], accountId?: string | null): Promise<void> {
    const res = (await this.dataSource.query(
      `WITH prev AS (SELECT status FROM google_calendar_connection WHERE owner_id = $1),
            u AS (
         INSERT INTO google_calendar_connection (owner_id, integration_account_id, status, granted_scopes)
         VALUES ($1, $3, 'active', $2::jsonb)
         ON CONFLICT (owner_id) DO UPDATE
           SET status = 'active', granted_scopes = EXCLUDED.granted_scopes,
               integration_account_id = COALESCE(EXCLUDED.integration_account_id, google_calendar_connection.integration_account_id),
               last_error = NULL, revoke_pending_at = NULL, revoke_attempts = 0, updated_at = now()
         RETURNING id)
       SELECT (SELECT status FROM prev) AS "prevStatus", (SELECT count(*)::int FROM u) AS c`,
      [ownerId, JSON.stringify(grantedScopes), accountId ?? null],
    )) as { prevStatus: string | null; c: number }[];
    if (!res[0]?.c || res[0].prevStatus !== 'needs_reconnect') return;
    await this.dataSource.query(
      `UPDATE google_calendar_subscription
          SET needs_sync_at = now(), consecutive_failures = 0, next_attempt_at = NULL
        WHERE owner_id = $1 AND selected`,
      [ownerId],
    );
  }

  // ---------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------

  /**
   * Number of legacy `gcal` item copies a confirmed disconnect or purge would delete (works in every mode).
   * Counts live AND soft-deleted rows because `deleteLegacyCopies` hard-deletes both, so the number
   * shown to the user always equals the purge's `deleted`.
   */
  async disconnectPreview(ownerId: string): Promise<{ legacyCopyCount: number }> {
    const rows = (await this.dataSource.query(
      `SELECT count(*)::int AS c FROM items WHERE owner_id = $1 AND source = 'gcal'`,
      [ownerId],
    )) as { c: number }[];
    return { legacyCopyCount: rows[0]?.c ?? 0 };
  }

  /**
   * Explicit, owner-scoped purge of the legacy `gcal` copies: hard-deletes the caller's
   * `source = 'gcal'` items and their `external_link` rows, nothing else. Needs no
   * integration account and no flag. Deliberately bypasses the per-item read-only
   * guard of ItemService (those rows are owned by the legacy mirror) through its own
   * owner-bound SQL. The controller only calls this after an explicit `confirm: true`.
   *
   * Refused with 409 (nothing touched) while the owner has a connected account AND the legacy
   * engine is active for them: the next legacy pull would import the copies again. Allowed after
   * a disconnect, for owners on the v2 engine and for a paused narrowed owner.
   */
  async purgeLegacyCopies(ownerId: string): Promise<{ deleted: number }> {
    if ((await this.findAccount(ownerId, ['connected'])) && (await this.engine.legacyEngineAllowed(ownerId))) {
      throw ApiException.conflict('Disconnect Google Calendar before deleting the synced copies, otherwise the next sync imports them again');
    }
    const deleted = await this.dataSource.transaction((m) => this.deleteLegacyCopies(m, ownerId));
    return { deleted };
  }

  async disconnect(
    ownerId: string,
    opts: { deleteLegacyCopies: boolean },
  ): Promise<{ revokePending: boolean; legacyCopiesDeleted: number }> {
    const account = await this.findAccount(ownerId, ['connected', 'disconnected']);
    const conn = await this.dataSource.query(
      `SELECT id FROM google_calendar_connection WHERE owner_id = $1`,
      [ownerId],
    );
    if (!account && conn.length === 0) throw ApiException.notFound('Integration account not found');

    if (account) {
      await this.dataSource.query(
        `INSERT INTO google_calendar_connection (owner_id, integration_account_id, status)
         VALUES ($1, $2, 'disconnected')
         ON CONFLICT (owner_id) DO UPDATE SET status = 'disconnected', updated_at = now()`,
        [ownerId, account.id],
      );
    } else {
      await this.dataSource.query(
        `UPDATE google_calendar_connection SET status = 'disconnected', updated_at = now() WHERE owner_id = $1`,
        [ownerId],
      );
    }
    await this.dataSource.query(
      `UPDATE google_calendar_subscription SET needs_sync_at = NULL WHERE owner_id = $1`,
      [ownerId],
    );
    // Channels are stopped while the token still works.
    await this.selection.stopAllChannels(ownerId);
    if (account) await this.stopLegacyChannel(ownerId, account);

    let revoked = true;
    // A missing Google configuration is a deployment state, not a failed attempt: the retry record starts at 0.
    let attemptsUsed = 1;
    if (account) {
      try {
        await this.revokeAccountTokens(account);
      } catch (err) {
        revoked = false;
        if (isGoogleNotConfiguredError(err)) attemptsUsed = 0;
        this.logger.warn(`Google token revoke failed on disconnect, will retry: ${this.errorLabel(err)}`);
      }
    }

    const legacyCopiesDeleted = await this.dataSource.transaction(async (m) => {
      await this.purgeSyncedData(m, ownerId);
      const deleted = opts.deleteLegacyCopies ? await this.deleteLegacyCopies(m, ownerId) : 0;
      if (revoked) {
        await this.purgeAccount(m, ownerId);
      } else {
        // The connection row is the retry record; the account row keeps the encrypted token it needs.
        await m.query(
          `UPDATE google_calendar_connection
              SET revoke_pending_at = now(), revoke_attempts = $2, updated_at = now()
            WHERE owner_id = $1`,
          [ownerId, attemptsUsed],
        );
        await m.query(
          `UPDATE integration_account
              SET status = 'disconnected', channel_id = NULL, resource_id = NULL,
                  channel_expiration = NULL, channel_token = NULL
            WHERE owner_id = $1 AND provider = 'google_calendar'`,
          [ownerId],
        );
      }
      return deleted;
    });
    return { revokePending: !revoked, legacyCopiesDeleted };
  }

  /**
   * Worker body: retries every pending revoke. Success (or a token Google no
   * longer knows) removes the account and connection rows. After
   * MAX_REVOKE_ATTEMPTS failures the record is dropped and the failure logged
   * (owner id and counts only, never a token).
   *
   * A "not configured" error (missing Google client settings) is not a failed
   * attempt: the record, the counter and the token stay as they are and the
   * retry resumes once the configuration is back.
   *
   * The purge (and the abandon) re-checks the account INSIDE its transaction,
   * under a row lock: a reconnect that lands after the status check above
   * (or while the revoke call was in flight) wins, the fresh token is never
   * deleted and the retry record is just cleared.
   */
  async retryPendingRevokes(): Promise<{ revoked: number; failed: number; abandoned: number }> {
    const pending = (await this.dataSource.query(
      `SELECT c.owner_id::text AS "ownerId", c.revoke_attempts AS attempts
         FROM google_calendar_connection c
        WHERE c.revoke_pending_at IS NOT NULL
        ORDER BY c.revoke_pending_at, c.id`,
    )) as { ownerId: string; attempts: number }[];
    const out = { revoked: 0, failed: 0, abandoned: 0 };
    for (const p of pending) {
      const account = await this.findAccount(p.ownerId, ['connected', 'disconnected']);
      if (account?.status === 'connected') {
        // The user reconnected after the failed revoke: the stored token is a fresh grant, never revoke it.
        await this.clearRevokeRecord(this.dataSource, p.ownerId);
        continue;
      }
      let ok = true;
      if (account) {
        try {
          await this.revokeAccountTokens(account);
        } catch (err) {
          if (isGoogleNotConfiguredError(err)) {
            this.logger.warn('Google token revoke retry postponed: the Google Calendar integration is not configured');
            continue;
          }
          ok = false;
          this.logger.warn(`Google token revoke retry failed: ${this.errorLabel(err)}`);
        }
      }
      if (ok) {
        const purged = await this.dataSource.transaction(async (m) => {
          if (await this.reconnectedDuringRetry(m, p.ownerId)) return false;
          await this.purgeAccount(m, p.ownerId);
          return true;
        });
        if (purged) out.revoked++;
        continue;
      }
      const attempts = p.attempts + 1;
      if (attempts >= MAX_REVOKE_ATTEMPTS) {
        this.logger.error(
          `Giving up revoking a Google token after ${attempts} attempts (owner ${p.ownerId}); the stored token is being deleted`,
        );
        const dropped = await this.dataSource.transaction(async (m) => {
          if (await this.reconnectedDuringRetry(m, p.ownerId)) return false;
          await this.purgeAccountKeepTombstone(m, p.ownerId, attempts);
          return true;
        });
        if (dropped) out.abandoned++;
      } else {
        await this.dataSource.query(
          `UPDATE google_calendar_connection SET revoke_attempts = $2, updated_at = now() WHERE owner_id = $1`,
          [p.ownerId, attempts],
        );
        out.failed++;
      }
    }
    return out;
  }

  /**
   * First statement of a retry's purge transaction: locks the owner's account rows and, when one is
   * `connected` again, clears the retry record and reports true (the caller must then leave everything alone).
   */
  private async reconnectedDuringRetry(m: EntityManager, ownerId: string): Promise<boolean> {
    const rows = (await m.query(
      `SELECT status FROM integration_account
        WHERE owner_id = $1 AND provider = 'google_calendar' AND deleted_at IS NULL
        FOR UPDATE`,
      [ownerId],
    )) as { status: string }[];
    if (!rows.some((r) => r.status === 'connected')) return false;
    await this.clearRevokeRecord(m, ownerId);
    return true;
  }

  private async clearRevokeRecord(runner: { query: DataSource['query'] }, ownerId: string): Promise<void> {
    await runner.query(
      `UPDATE google_calendar_connection SET revoke_pending_at = NULL, revoke_attempts = 0, updated_at = now() WHERE owner_id = $1`,
      [ownerId],
    );
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * Hard-deletes the owner's `gcal` items (live and soft-deleted) and their links. Never touches any
   * other source or owner. Also clears the legacy sync cursor: with the copies gone, the next pull
   * has to be a full one so a later reconnect can import the Google events again.
   */
  private async deleteLegacyCopies(m: EntityManager, ownerId: string): Promise<number> {
    await m.query(
      `UPDATE integration_account SET sync_token = NULL, last_sync_at = NULL
        WHERE owner_id = $1 AND provider = 'google_calendar'`,
      [ownerId],
    );
    await m.query(
      `DELETE FROM external_link WHERE item_id IN (SELECT id FROM items WHERE owner_id = $1 AND source = 'gcal')`,
      [ownerId],
    );
    const res = (await m.query(
      `WITH d AS (DELETE FROM items WHERE owner_id = $1 AND source = 'gcal' RETURNING 1)
       SELECT count(*)::int AS c FROM d`,
      [ownerId],
    )) as { c: number }[];
    return res[0]?.c ?? 0;
  }

  private async purgeSyncedData(m: EntityManager, ownerId: string): Promise<void> {
    await m.query(`DELETE FROM google_calendar_publication WHERE owner_id = $1`, [ownerId]);
    await m.query(`DELETE FROM google_calendar_event WHERE owner_id = $1`, [ownerId]);
    await m.query(`DELETE FROM google_calendar_channel WHERE owner_id = $1`, [ownerId]);
    await m.query(`DELETE FROM google_calendar_subscription WHERE owner_id = $1`, [ownerId]);
  }

  /** Permanent removal of the connection and of every token (see `removeTokens`). */
  private async purgeAccount(m: EntityManager, ownerId: string): Promise<void> {
    await this.purgeSyncedData(m, ownerId);
    await m.query(`DELETE FROM google_calendar_connection WHERE owner_id = $1`, [ownerId]);
    await this.removeTokens(m, ownerId);
  }

  /**
   * Removes every token of the owner's integration account. A legacy owner (an account
   * that already has its Husrevity `calendar_id`) keeps a tokenless `disconnected` row
   * with just that id, so a reconnect reuses the same calendar instead of creating a
   * second one and the existing `external_link` rows keep pointing at it. The empty
   * string stands in for the NOT NULL access token: it is not a ciphertext, never
   * decrypts into a usable token and the row is never `connected`. An owner without a
   * calendar id has the row deleted outright. `sync_token` and `last_sync_at` stay on the kept
   * row: they are a cursor, not a credential, and keeping them stops a reconnect from turning
   * into a full pull. Call only once the token is no longer needed.
   */
  private async removeTokens(m: EntityManager, ownerId: string): Promise<void> {
    await m.query(
      `UPDATE integration_account
          SET status = 'disconnected', encrypted_access_token = '', encrypted_refresh_token = NULL,
              scopes = '[]'::jsonb,
              channel_id = NULL, resource_id = NULL, channel_expiration = NULL, channel_token = NULL
        WHERE owner_id = $1 AND provider = 'google_calendar' AND calendar_id IS NOT NULL`,
      [ownerId],
    );
    await m.query(
      `DELETE FROM integration_account WHERE owner_id = $1 AND provider = 'google_calendar' AND calendar_id IS NULL`,
      [ownerId],
    );
  }

  /**
   * Token deleted, revoke given up: the connection row stays as a tombstone
   * (`disconnected`, no retry pending, attempts used up) so the status endpoint can
   * tell the user the Google grant may still be active. Not a live connection.
   */
  private async purgeAccountKeepTombstone(m: EntityManager, ownerId: string, attempts: number): Promise<void> {
    await this.purgeSyncedData(m, ownerId);
    await this.removeTokens(m, ownerId);
    await m.query(
      `UPDATE google_calendar_connection
          SET status = 'disconnected', integration_account_id = NULL, revoke_pending_at = NULL,
              revoke_attempts = $2, last_error = NULL, write_enabled = false, updated_at = now()
        WHERE owner_id = $1`,
      [ownerId, Math.max(attempts, MAX_REVOKE_ATTEMPTS)],
    );
  }

  /** Stops the legacy watch channel stored on the account row while the token still works. Best effort. */
  private async stopLegacyChannel(ownerId: string, account: AccountRow): Promise<void> {
    if (!account.channelId || !account.resourceId) return;
    try {
      await this.gateway.stopChannel(ownerId, account.channelId, account.resourceId);
    } catch (err) {
      this.logger.warn(`Legacy Google Calendar channel stop failed: ${this.errorLabel(err)}`);
    }
  }

  private async findAccount(ownerId: string, statuses: string[]): Promise<AccountRow | null> {
    const rows = (await this.dataSource.query(
      `SELECT id::text AS id, status, encrypted_access_token AS "encryptedAccess", encrypted_refresh_token AS "encryptedRefresh",
              channel_id AS "channelId", resource_id AS "resourceId"
         FROM integration_account
        WHERE owner_id = $1 AND provider = 'google_calendar' AND deleted_at IS NULL AND status = ANY($2)
          AND encrypted_access_token <> ''
        ORDER BY id DESC LIMIT 1`,
      [ownerId, statuses],
    )) as AccountRow[];
    return rows[0] ?? null;
  }

  private async currentScopes(ownerId: string, accountId: string): Promise<string[]> {
    const rows = (await this.dataSource.query(
      `SELECT c.granted_scopes AS "connScopes", a.scopes AS "accountScopes"
         FROM integration_account a
         LEFT JOIN google_calendar_connection c ON c.owner_id = a.owner_id
        WHERE a.id = $1 AND a.owner_id = $2`,
      [accountId, ownerId],
    )) as { connScopes: string[] | null; accountScopes: string[] | null }[];
    const conn = rows[0]?.connScopes ?? [];
    return conn.length > 0 ? conn : (rows[0]?.accountScopes ?? []);
  }

  private async markNeedsReconnect(ownerId: string, accountId: string, reason: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO google_calendar_connection (owner_id, integration_account_id, status, last_error)
       VALUES ($1, $2, 'needs_reconnect', $3)
       ON CONFLICT (owner_id) DO UPDATE
         SET status = 'needs_reconnect', last_error = EXCLUDED.last_error, updated_at = now()`,
      [ownerId, accountId, reason.slice(0, 255)],
    );
  }

  /**
   * Revokes the refresh token (which revokes the whole grant), falling back to the
   * access token. Google answering 400 means the token is already invalid, which is
   * the state we want.
   */
  private async revokeAccountTokens(account: AccountRow): Promise<void> {
    const token = this.crypto.decrypt(account.encryptedRefresh) ?? this.crypto.decrypt(account.encryptedAccess);
    if (!token) return;
    try {
      await this.gateway.revokeToken(token);
    } catch (err) {
      // "Not configured" is an ApiException 400 of ours, not Google saying the token is invalid.
      if (!isGoogleNotConfiguredError(err) && googleErrorStatus(err) === 400) return;
      throw err;
    }
  }

  /** Class and HTTP status only: provider messages can echo credentials. */
  private errorLabel(err: unknown): string {
    const status = googleErrorStatus(err);
    return status ? `google_${status}` : redactSecrets((err as Error)?.name ?? 'Error');
  }
}
