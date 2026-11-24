import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { GOOGLE_CALENDAR_GATEWAY, GoogleCalendarGateway } from './google-calendar-gateway';
import { CALENDAR_WRITE_SCOPES, GoogleCalendarConnectService } from './google-calendar-connect.service';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { CALENDAR_APP_CREATED_SCOPE, deriveMode } from './google-calendar-v2.util';
import { googleErrorStatus } from './google-events-reader';
import { redactSecrets } from './log-redaction';

/** Result of `PUT /integrations/google-calendar/write`. */
export interface WriteSettingResult {
  /** Whether write is on after this call. */
  enabled: boolean;
  /** API start URL of the consent flow when the extra permission is still missing, else null. */
  consentUrl: string | null;
}

/** The only scopes the write consent may come back with: the read-only pair plus app-created. */
const WRITE_ALLOW_LIST = new Set(CALENDAR_WRITE_SCOPES);

/**
 * Per-user opt-in of the optional write-back (plan slice 10). Turning write on
 * is an explicit action: when `calendar.app.created` is not granted yet it
 * starts the existing ticket/cookie consent flow (never `include_granted_scopes`,
 * never the full `calendar` scope) and only the callback flips `write_enabled`.
 * Turning it off stops publishing and queues the removal of every published copy
 * (the publisher job deletes them from the Husrevity Planner calendar).
 * Every statement is bound to the caller's owner id. Tokens are never logged.
 */
@Injectable()
export class GoogleCalendarWriteService {
  private readonly logger = new Logger(GoogleCalendarWriteService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly connect: GoogleCalendarConnectService,
    private readonly calendarConfig: GoogleCalendarConfig,
    private readonly accounts: IntegrationAccountService,
    @Inject(GOOGLE_CALENDAR_GATEWAY) private readonly gateway: GoogleCalendarGateway,
  ) {}

  async setWriteEnabled(ownerId: string, enabled: boolean, codeChallenge?: string): Promise<WriteSettingResult> {
    if (!enabled) {
      // Turning write off removes the published copies: they are queued durably
      // and the publisher job deletes them from the Husrevity Planner calendar.
      await this.dataSource.transaction(async (m) => {
        await m.query(
          `UPDATE google_calendar_connection SET write_enabled = false, updated_at = now() WHERE owner_id = $1`,
          [ownerId],
        );
        await m.query(
          `UPDATE google_calendar_publication SET delete_pending_at = COALESCE(delete_pending_at, now()), updated_at = now()
            WHERE owner_id = $1`,
          [ownerId],
        );
      });
      return { enabled: false, consentUrl: null };
    }

    const conn = (await this.dataSource.query(
      `SELECT c.status, c.granted_scopes AS "connScopes", a.scopes AS "accountScopes"
         FROM google_calendar_connection c
         LEFT JOIN integration_account a ON a.id = c.integration_account_id AND a.owner_id = c.owner_id
        WHERE c.owner_id = $1`,
      [ownerId],
    )) as { status: string; connScopes: string[] | null; accountScopes: string[] | null }[];
    if (!conn[0]) throw ApiException.notFound('Google Calendar is not connected');
    if (conn[0].status !== 'active') {
      throw ApiException.conflict('Google Calendar must be reconnected before write can be enabled');
    }
    const scopes = conn[0].connScopes?.length ? conn[0].connScopes : (conn[0].accountScopes ?? []);
    if (deriveMode(true, scopes) !== 'narrowed') {
      throw ApiException.conflict('Narrow the Google permissions before enabling write');
    }

    if (scopes.includes(CALENDAR_APP_CREATED_SCOPE)) {
      await this.dataSource.query(
        `UPDATE google_calendar_connection SET write_enabled = true, updated_at = now() WHERE owner_id = $1`,
        [ownerId],
      );
      return { enabled: true, consentUrl: null };
    }
    if (!codeChallenge) throw ApiException.badRequest('codeChallenge is required');
    const { ticket } = await this.connect.begin(ownerId, codeChallenge, { write: true });
    return { enabled: false, consentUrl: this.connect.startUrlFor(ticket) };
  }

  /**
   * Callback of the write consent. Returns true when the token was stored and
   * write switched on. Anything else stores nothing, revokes what Google just
   * issued (best effort) and leaves the existing connection exactly as it was.
   */
  async completeWrite(ownerId: string, code: string): Promise<boolean> {
    const account = await this.findAccountId(ownerId);
    if (!account) return false;

    let tokens: { access_token?: string | null; refresh_token?: string | null; scope?: string | null };
    try {
      tokens = (await this.calendarConfig.createOAuth2Client().getToken(code)).tokens;
    } catch (err) {
      this.logger.warn(`Google code exchange failed while enabling write: ${this.errorLabel(err)}`);
      return false;
    }

    const granted = (tokens.scope ?? '').split(/\s+/).filter(Boolean);
    const valid =
      !!tokens.access_token &&
      !!tokens.refresh_token &&
      granted.length > 0 &&
      granted.every((s) => WRITE_ALLOW_LIST.has(s)) &&
      CALENDAR_WRITE_SCOPES.every((s) => granted.includes(s));
    if (!valid) {
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
      { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token! },
      granted,
    );
    await this.dataSource.query(
      `UPDATE google_calendar_connection
          SET granted_scopes = $2::jsonb, write_enabled = true, status = 'active', last_error = NULL, updated_at = now()
        WHERE owner_id = $1`,
      [ownerId, JSON.stringify(granted)],
    );
    return true;
  }

  private async findAccountId(ownerId: string): Promise<string | null> {
    const rows = (await this.dataSource.query(
      `SELECT id::text AS id FROM integration_account
        WHERE owner_id = $1 AND provider = 'google_calendar' AND deleted_at IS NULL AND status = 'connected'
        ORDER BY id DESC LIMIT 1`,
      [ownerId],
    )) as { id: string }[];
    return rows[0]?.id ?? null;
  }

  /** Class and HTTP status only: provider messages can echo credentials. */
  private errorLabel(err: unknown): string {
    const status = googleErrorStatus(err);
    return status ? `google_${status}` : redactSecrets((err as Error)?.name ?? 'Error');
  }
}
