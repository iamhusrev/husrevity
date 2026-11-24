import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiException } from '../common/api.exception';
import { CryptoService } from '../crypto/crypto.service';
import { User } from '../user/user.entity';
import { UserInvite } from '../admin/user-invite.entity';
import { AuthService } from './auth.service';
import { OAuthFlow, OAuthFlowPurpose } from './oauth-flow.entity';
import { UserIdentity } from './user-identity.entity';
import { GoogleLoginConfig } from './google-login.config';
import { GOOGLE_LOGIN_GATEWAY, GoogleLoginGateway } from './google-login.gateway';
import { GoogleIdTokenVerifier, VerifiedGoogleIdentity, sha256Hex } from './google-id-token.verifier';
import { parseCookieHeader } from './cookie.util';
import {
  GoogleExchangeRequestDto,
  GoogleExchangeResponseDto,
  GoogleIdentityStatusDto,
} from './dto/google-login-dtos';

export const GOOGLE_FLOW_COOKIE = 'hv_gl_flow';
const PROVIDER = 'google';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
/** Login sign-in asks for identity only, never any API scope. */
const LOGIN_SCOPES = ['openid', 'email', 'profile'];
const FLOW_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 60 * 1000;

const MSG_EXISTING_EMAIL =
  'An account with this email already exists. Sign in with your password, then link Google from Settings.';
const MSG_LIVE_INVITE =
  'This email has a pending invitation. Use the invitation link to create your account.';
const MSG_BAD_CODE = 'Invalid or expired sign-in code';
const MSG_BAD_REQUEST = 'Invalid or expired sign-in request';

export interface StartResult {
  authUrl: string;
  cookieValue: string;
}

export interface CallbackResult {
  redirectUrl: string;
}

/**
 * Sign-in with Google (authorization code + PKCE with a server-side flow
 * record). Browser leg: start -> Google -> callback -> web fragment handoff.
 * XHR leg: exchange (single-use handoff code + web-held PKCE verifier).
 * No Google token is stored for sign-in: online access, ID token only.
 */
@Injectable()
export class GoogleLoginService {
  private readonly logger = new Logger(GoogleLoginService.name);

  constructor(
    @InjectRepository(OAuthFlow) private readonly flows: Repository<OAuthFlow>,
    @InjectRepository(UserIdentity) private readonly identities: Repository<UserIdentity>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly config: GoogleLoginConfig,
    private readonly crypto: CryptoService,
    private readonly verifier: GoogleIdTokenVerifier,
    @Inject(GOOGLE_LOGIN_GATEWAY) private readonly gateway: GoogleLoginGateway,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  // ---- public config ----------------------------------------------------

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Clean 404 while the feature flag is off: the endpoints do not exist yet. */
  assertEnabled(): void {
    if (!this.config.enabled) throw ApiException.notFound('Not found');
    if (!this.config.isConfigured()) throw ApiException.notFound('Not found');
  }

  cookieOptions(): { path: string; secure: boolean } {
    return { path: this.config.cookiePath, secure: this.config.cookieSecure };
  }

  // ---- browser leg ------------------------------------------------------

  /** Authenticated user asks to link Google; returns a single-use start ticket. */
  async beginLink(userId: string, codeChallenge: string): Promise<{ ticket: string }> {
    this.assertEnabled();
    const ticket = randomToken();
    await this.flows.insert({
      purpose: 'link',
      userId,
      startTicketHash: sha256Hex(ticket),
      codeChallenge,
      expiresAt: new Date(Date.now() + FLOW_TTL_MS),
    });
    return { ticket };
  }

  async start(input: { codeChallenge?: string; ticket?: string }): Promise<StartResult> {
    this.assertEnabled();
    const state = randomToken();
    const nonce = randomToken();
    const cookieSecret = randomToken();
    const pkceVerifier = randomToken();
    const secrets = {
      stateHash: sha256Hex(state),
      nonceHash: sha256Hex(nonce),
      cookieSecretHash: sha256Hex(cookieSecret),
      encryptedPkceVerifier: this.crypto.encrypt(pkceVerifier),
      expiresAt: new Date(Date.now() + FLOW_TTL_MS),
    };

    let flowId: string;
    if (input.ticket) {
      // Link: the flow row was created by the authenticated user; redeem the ticket once.
      const res = await this.flows
        .createQueryBuilder()
        .update(OAuthFlow)
        .set(secrets)
        .where(
          `start_ticket_hash = :t AND purpose = 'link' AND state_hash IS NULL ` +
            `AND consumed_at IS NULL AND expires_at > now()`,
          { t: sha256Hex(input.ticket) },
        )
        .returning('id')
        .execute();
      const row = (res.raw as Array<{ id: string }>)[0];
      if (!row) throw ApiException.badRequest(MSG_BAD_REQUEST);
      flowId = row.id;
    } else {
      if (!input.codeChallenge) throw ApiException.badRequest('code_challenge is required');
      const saved = await this.flows.save(
        this.flows.create({ purpose: 'login', codeChallenge: input.codeChallenge, ...secrets }),
      );
      flowId = saved.id;
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId!,
      redirect_uri: this.config.redirectUri!,
      response_type: 'code',
      scope: LOGIN_SCOPES.join(' '),
      access_type: 'online',
      state,
      nonce,
      code_challenge: base64urlSha256(pkceVerifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return {
      authUrl: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
      cookieValue: `${flowId}.${cookieSecret}`,
    };
  }

  async handleCallback(
    query: { code?: string; state?: string; error?: string },
    cookieHeader: string | undefined,
  ): Promise<CallbackResult> {
    this.assertEnabled();
    const cookie = parseCookieHeader(cookieHeader)[GOOGLE_FLOW_COOKIE];
    if (!query.state || !cookie) throw ApiException.badRequest(MSG_BAD_REQUEST);
    const dot = cookie.indexOf('.');
    if (dot < 1) throw ApiException.badRequest(MSG_BAD_REQUEST);
    const cookieFlowId = cookie.slice(0, dot);
    const cookieSecret = cookie.slice(dot + 1);

    const flow = await this.flows.findOneBy({ stateHash: sha256Hex(query.state) });
    const valid =
      flow &&
      flow.id === cookieFlowId &&
      flow.cookieSecretHash !== null &&
      safeEqualHex(flow.cookieSecretHash, sha256Hex(cookieSecret)) &&
      !flow.consumedAt &&
      !flow.callbackAt &&
      flow.expiresAt.getTime() > Date.now();
    if (!valid) throw ApiException.badRequest(MSG_BAD_REQUEST);

    const web = this.config.webUrl;
    if (query.error || !query.code) {
      await this.flows.update({ id: flow.id }, { consumedAt: new Date() });
      return { redirectUrl: `${web}/auth/google/callback#error=google_denied` };
    }

    const handoff = randomToken();
    const res = await this.flows
      .createQueryBuilder()
      .update(OAuthFlow)
      .set({
        encryptedGoogleCode: this.crypto.encrypt(query.code),
        handoffCodeHash: sha256Hex(handoff),
        handoffExpiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
        callbackAt: new Date(),
      })
      .where('id = :id AND callback_at IS NULL AND consumed_at IS NULL AND expires_at > now()', {
        id: flow.id,
      })
      .execute();
    if (!res.affected) throw ApiException.badRequest(MSG_BAD_REQUEST);
    return { redirectUrl: `${web}/auth/google/callback#code=${handoff}` };
  }

  // ---- XHR leg ----------------------------------------------------------

  async exchange(
    dto: GoogleExchangeRequestDto,
    authorizationHeader: string | undefined,
  ): Promise<GoogleExchangeResponseDto> {
    this.assertEnabled();
    const bearerUserId = this.bearerUserId(authorizationHeader);
    const handoffHash = sha256Hex(dto.code);
    const challenge = base64urlSha256(dto.verifier);

    // A live link flow needs a valid session. Without one (missing, invalid or
    // expired Bearer) answer 401 and leave the handoff untouched, so the web
    // can refresh the session and redeem the same code again. The verifier
    // must match, so this reveals nothing to someone holding only the code.
    if (bearerUserId === null && (await this.isLiveLinkHandoff(handoffHash, challenge))) {
      throw ApiException.unauthorized('Sign in again to finish linking Google');
    }

    // One atomic statement: single use, unexpired, verifier bound, and (for
    // link) the caller must be the flow's user. Anything else matches no row
    // and writes nothing, so a stolen handoff code or a mismatched Bearer is inert.
    const res = await this.flows
      .createQueryBuilder()
      .update(OAuthFlow)
      .set({ consumedAt: () => 'now()' })
      .where(
        `handoff_code_hash = :h AND code_challenge = :c AND consumed_at IS NULL ` +
          `AND handoff_expires_at > now() AND expires_at > now() ` +
          `AND purpose IN ('login', 'link') ` +
          `AND (purpose = 'login' OR (user_id IS NOT NULL AND user_id = :bearer))`,
        { h: handoffHash, c: challenge, bearer: bearerUserId },
      )
      .returning('*')
      .execute();
    const row = (res.raw as Array<Record<string, string | null>>)[0];
    if (!row) throw ApiException.badRequest(MSG_BAD_CODE);

    const purpose = row.purpose as OAuthFlowPurpose;
    let identity: VerifiedGoogleIdentity;
    try {
      const googleCode = this.crypto.decrypt(row.encrypted_google_code);
      const pkce = this.crypto.decrypt(row.encrypted_pkce_verifier);
      if (!googleCode) throw new Error('missing code');
      let tokens: { id_token?: string | null };
      try {
        tokens = await this.gateway.exchangeCode(googleCode, {
          redirectUri: this.config.redirectUri,
          codeVerifier: pkce ?? undefined,
        });
      } catch {
        throw ApiException.unauthorized('Google sign-in failed');
      }
      if (!tokens.id_token) throw ApiException.unauthorized('Google sign-in failed');
      identity = await this.verifier.verify(tokens.id_token, {
        clientId: this.config.clientId!,
        nonceHash: row.nonce_hash ?? '',
      });
    } finally {
      // The Google code is spent either way; do not keep it around.
      await this.flows
        .update({ id: row.id as string }, { encryptedGoogleCode: null, encryptedPkceVerifier: null })
        .catch(() => undefined);
    }

    if (purpose === 'link') {
      return this.linkIdentity(row.user_id as string, identity);
    }
    return this.resolveLogin(identity);
  }

  private isLiveLinkHandoff(handoffHash: string, challenge: string): Promise<boolean> {
    return this.flows
      .createQueryBuilder('f')
      .where(
        `f.handoff_code_hash = :h AND f.code_challenge = :c AND f.purpose = 'link' ` +
          `AND f.consumed_at IS NULL AND f.handoff_expires_at > now() AND f.expires_at > now()`,
        { h: handoffHash, c: challenge },
      )
      .getExists();
  }

  // ---- account resolution ----------------------------------------------

  private async resolveLogin(identity: VerifiedGoogleIdentity): Promise<GoogleExchangeResponseDto> {
    const existing = await this.identities.findOneBy({
      provider: PROVIDER,
      providerSubject: identity.sub,
    });
    const user = existing ? await this.requireUsableUser(existing.userId) : await this.signUp(identity);
    const session = await this.auth.issueTokensFor(user);
    return { purpose: 'login', ...session };
  }

  /** Re-checked on every exchange: a disabled or soft-deleted account never gets a session. */
  private async requireUsableUser(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.enabled) throw ApiException.forbidden('This account is disabled');
    return user;
  }

  /**
   * New Google user. Never auto-links by e-mail (the e-mail of an existing
   * account may have been registered by someone else) and never activates
   * project invites. Check + insert run in one transaction under an advisory
   * lock on the e-mail, with the unique constraints as the final backstop.
   */
  private async signUp(identity: VerifiedGoogleIdentity): Promise<User> {
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    try {
      const outcome = await this.dataSource.transaction(async (em) => {
        await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`google-signup:${identity.email}`]);

        const known = await em.findOneBy(UserIdentity, {
          provider: PROVIDER,
          providerSubject: identity.sub,
        });
        if (known) return { userId: known.userId as string };

        const liveInvite = await em
          .getRepository(UserInvite)
          .createQueryBuilder('i')
          .where('LOWER(i.email) = :email AND i.accepted_at IS NULL AND i.expires_at > now()', {
            email: identity.email,
          })
          .getExists();
        if (liveInvite) throw ApiException.conflict(MSG_LIVE_INVITE);

        const taken = await em
          .getRepository(User)
          .createQueryBuilder('u')
          .where('LOWER(u.email) = :email', { email: identity.email })
          .getExists();
        if (taken) throw ApiException.conflict(MSG_EXISTING_EMAIL);

        const user = await em.save(
          em.create(User, {
            email: identity.email,
            passwordHash,
            firstName: identity.givenName,
            lastName: identity.familyName,
            enabled: true,
            role: 'user',
            passwordLoginEnabled: false,
          }),
        );
        await em.insert(UserIdentity, {
          userId: user.id,
          provider: PROVIDER,
          providerSubject: identity.sub,
          email: identity.email,
        });
        return { user };
      });
      if ('user' in outcome && outcome.user) return outcome.user;
      return this.requireUsableUser(outcome.userId as string);
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Lost a race against another signup or an invite acceptance; the
        // transaction rolled back, so nothing is left behind.
        const winner = await this.identities.findOneBy({
          provider: PROVIDER,
          providerSubject: identity.sub,
        });
        if (winner) return this.requireUsableUser(winner.userId);
        throw ApiException.conflict(MSG_EXISTING_EMAIL);
      }
      throw e;
    }
  }

  private async linkIdentity(
    userId: string,
    identity: VerifiedGoogleIdentity,
  ): Promise<GoogleExchangeResponseDto> {
    await this.requireUsableUser(userId);
    const bySub = await this.identities.findOneBy({
      provider: PROVIDER,
      providerSubject: identity.sub,
    });
    if (bySub) {
      if (bySub.userId === userId) return { purpose: 'link', linked: true, email: bySub.email ?? undefined };
      throw ApiException.conflict('This Google account is already linked to another user');
    }
    const mine = await this.identities.findOneBy({ userId, provider: PROVIDER });
    if (mine) throw ApiException.conflict('A different Google account is already linked');
    try {
      await this.identities.insert({
        userId,
        provider: PROVIDER,
        providerSubject: identity.sub,
        email: identity.email,
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw ApiException.conflict('This Google account is already linked');
      }
      throw e;
    }
    return { purpose: 'link', linked: true, email: identity.email };
  }

  // ---- settings ---------------------------------------------------------

  async status(userId: string): Promise<GoogleIdentityStatusDto> {
    const user = await this.requireUsableUser(userId);
    const identity = await this.identities.findOneBy({ userId, provider: PROVIDER });
    return {
      linked: !!identity,
      email: identity?.email ?? null,
      passwordLoginEnabled: user.passwordLoginEnabled,
    };
  }

  async unlink(userId: string): Promise<void> {
    const user = await this.requireUsableUser(userId);
    const all = await this.identities.findBy({ userId });
    const google = all.find((i) => i.provider === PROVIDER);
    if (!google) throw ApiException.notFound('No Google account is linked');
    if (!user.passwordLoginEnabled && all.length <= 1) {
      throw ApiException.badRequest('Cannot remove your only sign-in method');
    }
    await this.identities.delete({ id: google.id });
  }

  // ---- housekeeping -----------------------------------------------------

  @Cron(CronExpression.EVERY_HOUR, { name: 'oauth-flow-cleanup' })
  async cleanupExpiredFlows(): Promise<void> {
    const res = await this.flows
      .createQueryBuilder()
      .delete()
      .from(OAuthFlow)
      .where(`expires_at < now() - interval '1 day'`)
      .execute();
    if (res.affected) this.logger.log(`Cleaned up ${res.affected} expired OAuth flow(s)`);
  }

  // ---- helpers ----------------------------------------------------------

  /** Optional Bearer on the public exchange route; an invalid/expired one counts as absent. */
  private bearerUserId(header: string | undefined): string | null {
    const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
    if (!m) return null;
    try {
      const payload = this.jwt.verify<{ sub?: string | number }>(m[1], {
        issuer: this.config.jwtIssuer,
      });
      return payload?.sub !== undefined ? String(payload.sub) : null;
    } catch {
      return null;
    }
  }
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function base64urlSha256(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof QueryFailedError && (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505';
}
