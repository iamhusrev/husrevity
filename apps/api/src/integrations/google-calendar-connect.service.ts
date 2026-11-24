import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { CryptoService } from '../crypto/crypto.service';
import { ApiException } from '../common/api.exception';
import { parseCookieHeader } from '../auth/cookie.util';
import { sha256Hex } from '../auth/google-id-token.verifier';
import { OAuthFlow } from '../auth/oauth-flow.entity';
import { GoogleCalendarConfig } from './google-calendar.config';
import { CALENDAR_APP_CREATED_SCOPE } from './google-calendar-v2.util';

/** Name of the flow-specific cookie; distinct from the sign-in flow cookie. */
export const CALENDAR_FLOW_COOKIE = 'hv_gc_flow';

/** Scopes of the regular (legacy-compatible) connect; unchanged. */
export const CALENDAR_CONNECT_SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Scopes of the deliberate "narrow permissions" consent: read-only calendar
 * list and events. `calendar.app.created` is requested only when write is
 * enabled (see CALENDAR_WRITE_SCOPES), never here.
 */
export const CALENDAR_NARROW_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

/**
 * Scopes of the consent that turns optional write on: the read-only pair plus
 * `calendar.app.created`. The full `calendar` scope is never requested.
 */
export const CALENDAR_WRITE_SCOPES = [...CALENDAR_NARROW_SCOPES, CALENDAR_APP_CREATED_SCOPE];

/** The start ticket is handed to the browser right away, so it lives briefly. */
const TICKET_TTL_MS = 2 * 60 * 1000;
/** Time the user has to finish the Google consent screen. */
const FLOW_TTL_MS = 10 * 60 * 1000;
/** The handoff code in the web URL fragment is redeemed immediately, so it lives briefly. */
const HANDOFF_TTL_MS = 60 * 1000;

const MSG_BAD_REQUEST = 'Invalid or expired connect request';
const MSG_BAD_CODE = 'Invalid or expired connect code';

/** What the consent flow was begun for. Stored in front of the PKCE challenge (`<kind>.<challenge>`). */
export type CalendarFlowKind = 'connect' | 'narrow' | 'write';
const KINDS: readonly CalendarFlowKind[] = ['connect', 'narrow', 'write'];

export interface CalendarStartResult {
  authUrl: string;
  cookieValue: string;
}

export interface CalendarHandoffResult {
  /** Always the flow's user, which the exchange proved equals the Bearer user. */
  ownerId: string;
  kind: CalendarFlowKind;
  /** The Google authorization code, decrypted; it is wiped from the flow row before this returns. */
  googleCode: string;
}

/**
 * Browser-bound Google Calendar consent flow on top of `oauth_flow`
 * (purpose `calendar_connect`), the same shape as the Google login link flow.
 *
 * 1. begin(): the authenticated user gets a single-use, short-lived start ticket
 *    and the flow row keeps the PKCE challenge of the verifier the web holds.
 * 2. start(): the browser navigation redeems the ticket; the flow row gets a
 *    random state and a cookie secret, the cookie goes to that browser.
 * 3. handleCallback(): state AND cookie AND an open flow must match. NO token is
 *    requested or stored here: the Google code is kept encrypted on the flow row
 *    and the browser is sent to the web with a single-use handoff code in the
 *    URL fragment.
 * 4. redeemHandoff(): a Bearer-authenticated XHR. Matches only when the handoff
 *    code is unspent and unexpired, the web-held verifier hashes to the stored
 *    challenge AND the Bearer user is the flow's user. Anything else matches no
 *    row and writes nothing, so an attacker's start link finished in a victim's
 *    browser can never bind the victim's Google account to the attacker.
 *
 * The owner always comes from the flow row, never from anything in a URL.
 */
@Injectable()
export class GoogleCalendarConnectService {
  constructor(
    @InjectRepository(OAuthFlow) private readonly flows: Repository<OAuthFlow>,
    private readonly config: GoogleCalendarConfig,
    private readonly crypto: CryptoService,
  ) {}

  cookieOptions(): { path: string; secure: boolean } {
    return { path: this.config.cookiePath, secure: this.config.cookieSecure };
  }

  /** Public browser entry URL for a ticket. */
  startUrlFor(ticket: string): string {
    return `${this.config.startUrl}?ticket=${encodeURIComponent(ticket)}`;
  }

  async begin(
    userId: string,
    codeChallenge: string,
    opts: { narrow?: boolean; write?: boolean } = {},
  ): Promise<{ ticket: string }> {
    if (!this.config.isConfigured()) {
      throw ApiException.badRequest('Google Calendar integration is not configured');
    }
    if (!codeChallenge) throw ApiException.badRequest('codeChallenge is required');
    const kind: CalendarFlowKind = opts.write ? 'write' : opts.narrow ? 'narrow' : 'connect';
    const ticket = randomToken();
    await this.flows.insert({
      purpose: 'calendar_connect',
      userId,
      startTicketHash: sha256Hex(ticket),
      codeChallenge: `${kind}.${codeChallenge}`,
      expiresAt: new Date(Date.now() + TICKET_TTL_MS),
    });
    return { ticket };
  }

  async start(ticket: string | undefined): Promise<CalendarStartResult> {
    if (!ticket) throw ApiException.badRequest(MSG_BAD_REQUEST);
    const client = this.config.createOAuth2Client();
    const state = randomToken();
    const cookieSecret = randomToken();

    // Redeem the ticket exactly once; the row then waits for the callback.
    const res = await this.flows
      .createQueryBuilder()
      .update(OAuthFlow)
      .set({
        stateHash: sha256Hex(state),
        cookieSecretHash: sha256Hex(cookieSecret),
        expiresAt: () => `now() + interval '${FLOW_TTL_MS / 1000} seconds'`,
      })
      .where(
        `start_ticket_hash = :t AND purpose = 'calendar_connect' AND state_hash IS NULL ` +
          `AND consumed_at IS NULL AND expires_at > now()`,
        { t: sha256Hex(ticket) },
      )
      .returning('id, code_challenge')
      .execute();
    const row = (res.raw as Array<{ id: string; code_challenge: string }>)[0];
    if (!row) throw ApiException.badRequest(MSG_BAD_REQUEST);

    // `include_granted_scopes` is deliberately never set: a narrowing consent
    // must not inherit the grants Google accumulated for this project.
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.scopesFor(kindOf(row.code_challenge)),
      state,
    });
    return { authUrl, cookieValue: `${row.id}.${cookieSecret}` };
  }

  /**
   * Validates state + cookie + flow lifetime. Stores the (encrypted) Google
   * code and a fresh handoff code on the flow row and returns the web URL to
   * redirect to. Requests and stores NO token. A denied or empty consent burns
   * the flow and redirects with an error fragment.
   */
  async handleCallback(
    query: { code?: string; state?: string; error?: string },
    cookieHeader: string | undefined,
  ): Promise<{ redirectUrl: string }> {
    const cookie = parseCookieHeader(cookieHeader)[CALENDAR_FLOW_COOKIE];
    if (!query.state || !cookie) throw ApiException.badRequest(MSG_BAD_REQUEST);
    const dot = cookie.indexOf('.');
    if (dot < 1) throw ApiException.badRequest(MSG_BAD_REQUEST);
    const flowId = cookie.slice(0, dot);
    const secret = cookie.slice(dot + 1);
    if (!UUID_RE.test(flowId)) throw ApiException.badRequest(MSG_BAD_REQUEST);

    const open =
      `id = :id AND state_hash = :s AND cookie_secret_hash = :c AND purpose = 'calendar_connect' ` +
      `AND user_id IS NOT NULL AND callback_at IS NULL AND consumed_at IS NULL AND expires_at > now()`;
    const params = { id: flowId, s: sha256Hex(query.state), c: sha256Hex(secret) };
    const page = this.config.callbackPageUrl;

    if (query.error || !query.code) {
      const burned = await this.flows
        .createQueryBuilder()
        .update(OAuthFlow)
        .set({ consumedAt: () => 'now()', callbackAt: () => 'now()' })
        .where(open, params)
        .execute();
      if (!burned.affected) throw ApiException.badRequest(MSG_BAD_REQUEST);
      return { redirectUrl: `${page}#error=google_denied` };
    }

    const handoff = randomToken();
    const res = await this.flows
      .createQueryBuilder()
      .update(OAuthFlow)
      .set({
        encryptedGoogleCode: this.crypto.encrypt(query.code),
        handoffCodeHash: sha256Hex(handoff),
        handoffExpiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
        callbackAt: () => 'now()',
      })
      .where(open, params)
      .execute();
    if (!res.affected) throw ApiException.badRequest(MSG_BAD_REQUEST);
    return { redirectUrl: `${page}#code=${handoff}` };
  }

  /**
   * One atomic statement: single use, unexpired, verifier bound to the stored
   * challenge, and the caller must be the flow's user. No match writes nothing.
   */
  async redeemHandoff(bearerUserId: string, code: string, verifier: string): Promise<CalendarHandoffResult> {
    const res = await this.flows
      .createQueryBuilder()
      .update(OAuthFlow)
      .set({ consumedAt: () => 'now()' })
      .where(
        `handoff_code_hash = :h AND split_part(code_challenge, '.', 2) = :c AND consumed_at IS NULL ` +
          `AND handoff_expires_at > now() AND expires_at > now() AND purpose = 'calendar_connect' ` +
          `AND user_id IS NOT NULL AND user_id = :bearer`,
        { h: sha256Hex(code), c: base64urlSha256(verifier), bearer: bearerUserId },
      )
      .returning('id, user_id, code_challenge, encrypted_google_code')
      .execute();
    const row = (res.raw as Array<{
      id: string;
      user_id: string;
      code_challenge: string;
      encrypted_google_code: string | null;
    }>)[0];
    if (!row) throw ApiException.badRequest(MSG_BAD_CODE);

    // The Google code is spent either way; do not keep it around.
    await this.flows
      .update({ id: row.id }, { encryptedGoogleCode: null })
      .catch(() => undefined);
    const googleCode = this.crypto.decrypt(row.encrypted_google_code);
    if (!googleCode) throw ApiException.badRequest(MSG_BAD_CODE);
    return { ownerId: String(row.user_id), kind: kindOf(row.code_challenge), googleCode };
  }

  /** The regular connect asks for the read-only pair under the new model, the legacy scope otherwise. */
  private scopesFor(kind: CalendarFlowKind): string[] {
    if (kind === 'write') return CALENDAR_WRITE_SCOPES;
    if (kind === 'narrow') return CALENDAR_NARROW_SCOPES;
    return this.config.v2Enabled ? CALENDAR_NARROW_SCOPES : CALENDAR_CONNECT_SCOPES;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kindOf(storedChallenge: string): CalendarFlowKind {
  const kind = storedChallenge.split('.')[0] as CalendarFlowKind;
  return KINDS.includes(kind) ? kind : 'connect';
}

function base64urlSha256(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}
