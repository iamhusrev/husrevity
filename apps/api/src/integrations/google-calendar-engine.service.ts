import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BROAD_CALENDAR_SCOPE } from './google-calendar-v2.util';

/**
 * Which Google Calendar engine owns an owner (plan section 2.2 coexistence).
 *
 * An owner "uses the v2 engine" when a `google_calendar_connection` row exists
 * AND it is a live one (`active` or `needs_reconnect`). From then on the legacy
 * pull, the legacy watch renewal and the legacy item write stay silent for that
 * owner, so nothing is read or written by two engines.
 *
 * A `disconnected` row never counts: it is either the retry record of a revoke
 * that is still pending or the tombstone left after the retries were abandoned
 * (`revoke_attempts` at the maximum, see GoogleCalendarLifecycleService). Such an
 * owner has no live v2 connection, so a tombstone must not switch the legacy
 * engine off forever; the legacy engine only ever touches an account that is
 * `connected`, which a disconnected owner does not have.
 *
 * The flag is a real rollback switch. With `GOOGLE_CALENDAR_V2_ENABLED` off no
 * owner is on the v2 engine, whatever rows exist, and the legacy engine takes
 * over again, except for an owner whose stored grant was narrowed: that grant
 * cannot drive the legacy engine (it needs the broad calendar scope), so that
 * owner gets no legacy Google call at all until the flag is on again or the
 * broad scope is granted. Their cached data and sync token stay untouched.
 */
@Injectable()
export class GoogleCalendarEngineService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private flagOn(): boolean {
    return this.config.get<string>('GOOGLE_CALENDAR_V2_ENABLED') === 'true';
  }

  async ownerUsesV2Engine(ownerId: string): Promise<boolean> {
    if (!this.flagOn()) return false;
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM google_calendar_connection WHERE owner_id = $1 AND status IN ('active', 'needs_reconnect') LIMIT 1`,
      [ownerId],
    )) as unknown[];
    return rows.length > 0;
  }

  /**
   * True when the stored integration grant is known and lacks the broad calendar
   * scope. An account without recorded scopes (older rows) counts as broad.
   */
  async hasNarrowedGrant(ownerId: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `SELECT scopes FROM integration_account
        WHERE owner_id = $1 AND provider = 'google_calendar' AND deleted_at IS NULL AND status = 'connected'
        ORDER BY id DESC LIMIT 1`,
      [ownerId],
    )) as { scopes: string[] | null }[];
    const scopes = rows[0]?.scopes ?? [];
    return scopes.length > 0 && !scopes.includes(BROAD_CALENDAR_SCOPE);
  }

  /**
   * May the legacy engine call Google for this owner? No when the v2 engine owns
   * them (flag on and a live connection), and never for a narrowed grant (flag
   * off rollback: sync pauses, no legacy call is made). Every legacy call site
   * (pull, pull job, webhook, watch registration and renewal, item write-back,
   * calendar creation) asks this first.
   */
  async legacyEngineAllowed(ownerId: string): Promise<boolean> {
    if (await this.ownerUsesV2Engine(ownerId)) return false;
    return !(await this.hasNarrowedGrant(ownerId));
  }
}
