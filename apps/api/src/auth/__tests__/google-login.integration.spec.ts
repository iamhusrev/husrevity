import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ValidationError } from 'class-validator';
import { AdminService } from '../../admin/admin.service';
import { UserInvite } from '../../admin/user-invite.entity';
import { ApiException } from '../../common/api.exception';
import { GlobalExceptionFilter } from '../../common/global-exception.filter';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { CryptoService } from '../../crypto/crypto.service';
import { FakeGoogleGateway } from '../../integrations/testing/fake-google-gateway';
import { MigrationHarness, startMigrationHarness } from '../../db/migrations/__tests__/helpers/migration-harness';
import { MailerService } from '../../notification/mailer.service';
import { User } from '../../user/user.entity';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { GoogleIdTokenVerifier } from '../google-id-token.verifier';
import { GoogleLoginConfig } from '../google-login.config';
import { GoogleLoginController } from '../google-login.controller';
import { GOOGLE_LOGIN_GATEWAY } from '../google-login.gateway';
import { GoogleLoginService } from '../google-login.service';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { JwtStrategy } from '../jwt.strategy';
import { OAuthFlow } from '../oauth-flow.entity';
import { RefreshToken } from '../refresh-token.entity';
import { UserIdentity } from '../user-identity.entity';

/**
 * Integration tests 12-21 of the Google sign-in plan plus the envelope
 * contract of the new JSON endpoints. ONE disposable Postgres container for
 * the whole file, a real Nest app (guards, pipes, filters as in main.ts) and
 * the scripted FakeGoogleGateway: no network, no real Google.
 */
jest.setTimeout(300_000);

const CLIENT_ID = 'client-id.example.test';
const REDIRECT = 'https://api.example.test/api/auth/google/callback';
const WEB = 'https://app.example.test';
const JWT_SECRET = 'integration-test-jwt-secret-at-least-32-bytes!!';

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');
const sha256B64Url = (s: string) => createHash('sha256').update(s).digest('base64url');

describe('google login (integration)', () => {
  let h: MigrationHarness;
  let app: INestApplication;
  let ds: DataSource;
  let fake: FakeGoogleGateway;
  let config: ConfigService;
  let auth: AuthService;
  let admin: AdminService;
  let seq = 0;

  const server = () => app.getHttpServer();
  const next = () => ++seq;

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    fake = new FakeGoogleGateway();

    const env = {
      GOOGLE_LOGIN_ENABLED: 'true',
      GOOGLE_CALENDAR_CLIENT_ID: CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret-placeholder',
      GOOGLE_LOGIN_REDIRECT_URI: REDIRECT,
      HUSREVITY_WEB_URL: WEB,
      HUSREVITY_JWT_SECRET: JWT_SECRET,
      HUSREVITY_CRYPTO_KEY: randomBytes(32).toString('base64'),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: h.container.getConnectionUri(),
          entities: [User, RefreshToken, UserIdentity, OAuthFlow, UserInvite],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, UserIdentity, OAuthFlow, UserInvite]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [GoogleLoginController, AuthController],
      providers: [
        AuthService,
        AdminService,
        JwtStrategy,
        GoogleLoginService,
        GoogleLoginConfig,
        GoogleIdTokenVerifier,
        CryptoService,
        { provide: GOOGLE_LOGIN_GATEWAY, useValue: fake },
        { provide: MailerService, useValue: {} },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) =>
          ApiException.badRequest(
            `Validation failed: ${errors.map((e) => Object.values(e.constraints ?? {}).join(', ') || e.property).join('; ')}`,
          ),
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    // Listen once: supertest would otherwise bind and close the server per request, which races under Promise.all.
    await app.listen(0, '127.0.0.1');

    ds = moduleRef.get(DataSource);
    config = moduleRef.get(ConfigService);
    auth = moduleRef.get(AuthService);
    admin = moduleRef.get(AdminService);
  });

  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  // ---- helpers ---------------------------------------------------------

  const pkce = () => {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: sha256B64Url(verifier) };
  };

  const startLogin = (challenge: string, headers: Record<string, string> = {}) =>
    request(server()).get('/api/auth/google/start').query({ code_challenge: challenge }).set(headers);

  const cookieOf = (res: request.Response): string => {
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '';
    return raw.split(';')[0];
  };

  const authUrlOf = (res: request.Response): URL => new URL(res.headers.location);

  const callback = (state: string, cookie: string | null, code = 'google-code') =>
    request(server())
      .get('/api/auth/google/callback')
      .query({ state, code })
      .set(cookie ? { Cookie: cookie } : {});

  const handoffOf = (res: request.Response): string => {
    const loc = String(res.headers.location);
    return new URL(loc).hash.replace(/^#code=/, '');
  };

  const exchange = (code: string, verifier: string, bearer?: string) =>
    request(server())
      .post('/api/auth/google/exchange')
      .set(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      .send({ code, verifier });

  interface Prepared {
    handoff: string;
    verifier: string;
    state: string;
    cookie: string;
  }

  /** Runs start + callback with a scripted Google answer; returns what the web would hold. */
  const prepareLogin = async (
    claims: { sub: string; email: string } & Record<string, unknown>,
    opts: { ticket?: string; verifier?: string } = {},
  ): Promise<Prepared> => {
    const p = opts.verifier
      ? { verifier: opts.verifier, challenge: sha256B64Url(opts.verifier) }
      : pkce();
    const startRes = opts.ticket
      ? await request(server()).get('/api/auth/google/start').query({ ticket: opts.ticket })
      : await startLogin(p.challenge);
    expect([startRes.status, startRes.body]).toEqual([302, expect.anything()]);
    const url = authUrlOf(startRes);
    const state = url.searchParams.get('state')!;
    const nonce = url.searchParams.get('nonce')!;
    const n = next();
    const authCode = `google-code-${n}`;
    const idToken = `id-token-${n}`;
    fake.registerAuthCode(authCode, { id_token: idToken });
    fake.registerIdToken(idToken, {
      email_verified: true,
      aud: CLIENT_ID,
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce,
      ...claims,
    } as never);
    const cookie = cookieOf(startRes);
    const cb = await callback(state, cookie, authCode);
    expect(cb.status).toBe(302);
    return { handoff: handoffOf(cb), verifier: p.verifier, state, cookie };
  };

  const googleLogin = async (claims: { sub: string; email: string }) => {
    const p = await prepareLogin(claims);
    return exchange(p.handoff, p.verifier);
  };

  const uniqueEmail = (label: string) => `${label}-${next()}@example.test`;

  const createPasswordUser = async (email: string, password = 'correct-horse-battery') => {
    const res = await request(server()).post('/api/auth/login').send({ email, password });
    if (res.status === 200) return res.body.data;
    await auth.register({ email, password } as never);
    return (await request(server()).post('/api/auth/login').send({ email, password })).body.data;
  };

  const countRows = async (sql: string, params: unknown[] = []): Promise<number> =>
    Number((await ds.query(sql, params))[0].count);

  const userCount = (email: string) =>
    countRows(`SELECT count(*)::int AS count FROM app_user WHERE email = $1`, [email]);

  const identityCountFor = (sub: string) =>
    countRows(`SELECT count(*)::int AS count FROM user_identity WHERE provider_subject = $1`, [sub]);

  // ---- feature flag -----------------------------------------------------

  describe('feature flag', () => {
    it('answers 404 on every flow endpoint while GOOGLE_LOGIN_ENABLED is not literally true', async () => {
      const p = pkce();
      for (const v of ['false', '', '1', 'TRUE', 'yes']) {
        config.set('GOOGLE_LOGIN_ENABLED', v);
        expect((await startLogin(p.challenge)).status).toBe(404);
        expect((await callback('s', 'c=1')).status).toBe(404);
        expect((await exchange('x', p.verifier)).status).toBe(404);
        const cfg = await request(server()).get('/api/auth/google/config');
        expect(cfg.body.data).toEqual({ enabled: false });
      }
      config.set('GOOGLE_LOGIN_ENABLED', 'true');
      expect((await request(server()).get('/api/auth/google/config')).body.data).toEqual({ enabled: true });
    });
  });

  // ---- 12 ---------------------------------------------------------------

  describe('callback_requires_cookie_and_state', () => {
    it('sends Google exactly the identity scopes, online access, state, nonce and PKCE; sets a locked-down cookie', async () => {
      const res = await startLogin(pkce().challenge);
      expect(res.status).toBe(302);
      const url = authUrlOf(res);
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('access_type')).toBe('online');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
      expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('nonce')).toBeTruthy();
      expect(url.searchParams.has('include_granted_scopes')).toBe(false);

      const setCookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
      expect(setCookie).toMatch(/^hv_gl_flow=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(setCookie).toMatch(/Secure/i);
      expect(setCookie).toMatch(/Path=\/api\/auth\/google\/callback/i);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('rejects /start that is not a top-level navigation or lacks a valid challenge', async () => {
      const { challenge } = pkce();
      expect((await startLogin(challenge, { 'Sec-Fetch-Mode': 'cors' })).status).toBe(400);
      expect((await startLogin(challenge, { 'Sec-Fetch-Dest': 'iframe' })).status).toBe(400);
      expect((await startLogin(challenge, { 'Sec-Fetch-Site': 'bogus' })).status).toBe(400);
      expect(
        (await startLogin(challenge, { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'cross-site' })).status,
      ).toBe(302);
      expect((await request(server()).get('/api/auth/google/start')).status).toBe(400);
      expect((await request(server()).get('/api/auth/google/start').query({ code_challenge: 'short' })).status).toBe(400);
    });

    it('rejects a callback without the flow cookie, with a forged state, or with another browser\'s cookie', async () => {
      const mine = await startLogin(pkce().challenge);
      const attacker = await startLogin(pkce().challenge);
      const myState = authUrlOf(mine).searchParams.get('state')!;
      const attackerCookie = cookieOf(attacker);

      expect((await callback(myState, null)).status).toBe(400);
      expect((await callback('forged-state-value', cookieOf(mine))).status).toBe(400);
      expect((await callback(myState, attackerCookie)).status).toBe(400);
      expect((await callback(myState, 'hv_gl_flow=garbage')).status).toBe(400);
      expect((await callback(myState, `hv_gl_flow=${cookieOf(mine).split('=')[1].split('.')[0]}.wrong-secret`)).status).toBe(400);

      const rows = await ds.query(`SELECT handoff_code_hash, encrypted_google_code FROM oauth_flow WHERE state_hash = $1`, [sha256Hex(myState)]);
      expect(rows[0]).toEqual({ handoff_code_hash: null, encrypted_google_code: null });
    });

    it('hands the code over in the URL fragment, encrypts the Google code, and refuses a callback replay', async () => {
      const startRes = await startLogin(pkce().challenge);
      const state = authUrlOf(startRes).searchParams.get('state')!;
      const cookie = cookieOf(startRes);
      const cb = await callback(state, cookie, 'plain-google-code-value');
      expect(cb.status).toBe(302);
      const loc = new URL(cb.headers.location);
      expect(loc.origin).toBe(WEB);
      expect(loc.pathname).toBe('/auth/google/callback');
      expect(loc.search).toBe('');
      expect(loc.hash).toMatch(/^#code=.{20,}$/);
      expect(([] as string[]).concat(cb.headers['set-cookie'])[0]).toMatch(/^hv_gl_flow=;/);

      const [row] = await ds.query(`SELECT encrypted_google_code, handoff_code_hash FROM oauth_flow WHERE state_hash = $1`, [sha256Hex(state)]);
      expect(row.encrypted_google_code).toBeTruthy();
      expect(row.encrypted_google_code).not.toContain('plain-google-code-value');
      expect(row.handoff_code_hash).toBe(sha256Hex(loc.hash.replace('#code=', '')));

      expect((await callback(state, cookie, 'another-code')).status).toBe(400);
    });

    it('redirects a user-cancelled Google round trip to the web with an error fragment and burns the flow', async () => {
      const startRes = await startLogin(pkce().challenge);
      const state = authUrlOf(startRes).searchParams.get('state')!;
      const cookie = cookieOf(startRes);
      const cb = await request(server())
        .get('/api/auth/google/callback')
        .query({ state, error: 'access_denied' })
        .set({ Cookie: cookie });
      expect(cb.status).toBe(302);
      expect(new URL(cb.headers.location).hash).toBe('#error=google_denied');
      expect((await callback(state, cookie)).status).toBe(400);
    });

    it('rejects an expired flow', async () => {
      const startRes = await startLogin(pkce().challenge);
      const state = authUrlOf(startRes).searchParams.get('state')!;
      await ds.query(`UPDATE oauth_flow SET expires_at = now() - interval '1 minute' WHERE state_hash = $1`, [sha256Hex(state)]);
      expect((await callback(state, cookieOf(startRes))).status).toBe(400);
    });
  });

  // ---- 13 ---------------------------------------------------------------

  describe('exchange_single_use_under_race', () => {
    it('lets exactly one of two parallel exchanges win', async () => {
      const sub = `sub-race-${next()}`;
      const email = uniqueEmail('race');
      const p = await prepareLogin({ sub, email });

      const results = await Promise.all([exchange(p.handoff, p.verifier), exchange(p.handoff, p.verifier)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 400]);

      expect(await userCount(email)).toBe(1);
      expect(await identityCountFor(sub)).toBe(1);
      expect(fake.callsTo('oauth.exchangeCode').filter((c) => (c.args as { code: string }).code.startsWith('google-code-')).length)
        .toBeGreaterThanOrEqual(1);
      // The same handoff code never works a third time either.
      expect((await exchange(p.handoff, p.verifier)).status).toBe(400);
    });

    it('rejects an expired handoff code', async () => {
      const p = await prepareLogin({ sub: `sub-exp-${next()}`, email: uniqueEmail('exp') });
      await ds.query(`UPDATE oauth_flow SET handoff_expires_at = now() - interval '1 second' WHERE handoff_code_hash = $1`, [sha256Hex(p.handoff)]);
      expect((await exchange(p.handoff, p.verifier)).status).toBe(400);
    });
  });

  // ---- 14 ---------------------------------------------------------------

  describe('exchange_requires_verifier', () => {
    it('does not work with a stolen handoff code alone, and the legitimate holder can still finish', async () => {
      const sub = `sub-verifier-${next()}`;
      const email = uniqueEmail('verifier');
      const p = await prepareLogin({ sub, email });
      const callsBefore = fake.callsTo('oauth.exchangeCode').length;

      expect((await exchange(p.handoff, randomBytes(32).toString('base64url'))).status).toBe(400);
      expect((await exchange(p.handoff, 'x'.repeat(10))).status).toBe(400);
      expect((await request(server()).post('/api/auth/google/exchange').send({ code: p.handoff })).status).toBe(400);
      expect(fake.callsTo('oauth.exchangeCode').length).toBe(callsBefore);
      expect(await userCount(email)).toBe(0);

      const ok = await exchange(p.handoff, p.verifier);
      expect(ok.status).toBe(200);
      expect(ok.body.data.user.email).toBe(email);
    });
  });

  // ---- 15 ---------------------------------------------------------------

  describe('attacker_flow_cannot_bind_victim', () => {
    it('writes nothing when the Bearer user is not the user the link flow belongs to', async () => {
      const victim = await createPasswordUser(uniqueEmail('victim'));
      const attacker = await createPasswordUser(uniqueEmail('attacker'));
      const sub = `sub-victim-google-${next()}`;
      const challenge = pkce();

      // The attacker opens a link flow under their own session...
      const linkStart = await request(server())
        .post('/api/auth/google/link/start')
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .send({ codeChallenge: challenge.challenge });
      expect(linkStart.status).toBe(200);
      const ticket = linkStart.body.data.ticket as string;

      // ...and the victim's browser completes it with the victim's Google account.
      const p = await prepareLogin({ sub, email: uniqueEmail('victim-google') }, { ticket, verifier: challenge.verifier });

      // Even with the verifier leaked, the victim's session or no session cannot consume it.
      expect((await exchange(p.handoff, p.verifier, victim.accessToken)).status).toBe(400);
      expect((await exchange(p.handoff, p.verifier)).status).toBe(401);
      expect((await exchange(p.handoff, p.verifier, 'not-a-jwt')).status).toBe(401);
      expect(await identityCountFor(sub)).toBe(0);
      expect(await countRows(`SELECT count(*)::int AS count FROM user_identity WHERE user_id IN ($1, $2)`, [victim.user.id, attacker.user.id])).toBe(0);

      // Only the flow's own user can finish it.
      const ok = await exchange(p.handoff, p.verifier, attacker.accessToken);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ purpose: 'link', linked: true });
      expect(await identityCountFor(sub)).toBe(1);
    });

    it('does not let a login flow carry a link, and a start ticket is single use', async () => {
      const user = await createPasswordUser(uniqueEmail('ticket'));
      const c = pkce();
      const ls = await request(server())
        .post('/api/auth/google/link/start')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ codeChallenge: c.challenge });
      const ticket = ls.body.data.ticket as string;
      expect((await request(server()).get('/api/auth/google/start').query({ ticket })).status).toBe(302);
      expect((await request(server()).get('/api/auth/google/start').query({ ticket })).status).toBe(400);
      expect((await request(server()).get('/api/auth/google/start').query({ ticket: 'unknown' })).status).toBe(400);
    });

    it('links a signed-in user, is idempotent for the same Google account and refuses cross-user or second accounts', async () => {
      const u1 = await createPasswordUser(uniqueEmail('link1'));
      const u2 = await createPasswordUser(uniqueEmail('link2'));
      const sub = `sub-link-${next()}`;
      const link = async (user: { accessToken: string }, claimSub: string) => {
        const c = pkce();
        const ls = await request(server())
          .post('/api/auth/google/link/start')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({ codeChallenge: c.challenge });
        if (!ls.body.data) throw new Error(JSON.stringify([ls.status, ls.body]));
        const p = await prepareLogin({ sub: claimSub, email: uniqueEmail('g') }, { ticket: ls.body.data.ticket, verifier: c.verifier });
        return exchange(p.handoff, p.verifier, user.accessToken);
      };

      expect((await link(u1, sub)).status).toBe(200);
      expect((await link(u1, sub)).status).toBe(200);
      expect((await link(u2, sub)).status).toBe(409);
      expect((await link(u1, `${sub}-other`)).status).toBe(409);
      expect(await identityCountFor(sub)).toBe(1);

      const status = await request(server()).get('/api/auth/google/identity').set('Authorization', `Bearer ${u1.accessToken}`);
      expect(status.body.data).toMatchObject({ linked: true, passwordLoginEnabled: true });
    });

    it('refuses to link for a disabled user', async () => {
      const user = await createPasswordUser(uniqueEmail('linkdis'));
      const c = pkce();
      const ls = await request(server())
        .post('/api/auth/google/link/start')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ codeChallenge: c.challenge });
      const sub = `sub-linkdis-${next()}`;
      const p = await prepareLogin({ sub, email: uniqueEmail('g') }, { ticket: ls.body.data.ticket, verifier: c.verifier });
      await ds.query(`UPDATE app_user SET enabled = false WHERE id = $1`, [user.user.id]);
      expect((await exchange(p.handoff, p.verifier, user.accessToken)).status).toBe(403);
      expect(await identityCountFor(sub)).toBe(0);
    });
  });

  // ---- 16 ---------------------------------------------------------------

  describe('link_exchange_with_missing_or_expired_bearer', () => {
    it('answers 401 without consuming the handoff, which stays redeemable with a valid Bearer', async () => {
      const user = await createPasswordUser(uniqueEmail('linkexp'));
      const c = pkce();
      const ls = await request(server())
        .post('/api/auth/google/link/start')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ codeChallenge: c.challenge });
      const sub = `sub-linkexp-${next()}`;
      const p = await prepareLogin(
        { sub, email: uniqueEmail('linkexp-google') },
        { ticket: ls.body.data.ticket as string, verifier: c.verifier },
      );
      const expired = await app
        .get(JwtService)
        .signAsync({ sub: user.user.id }, { issuer: 'husrevity-nest', expiresIn: -10 });

      expect((await exchange(p.handoff, p.verifier)).status).toBe(401);
      expect((await exchange(p.handoff, p.verifier, expired)).status).toBe(401);
      expect(
        await countRows(`SELECT count(*)::int AS count FROM oauth_flow WHERE consumed_at IS NOT NULL AND user_id = $1`, [user.user.id]),
      ).toBe(0);

      const ok = await exchange(p.handoff, p.verifier, user.accessToken);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ purpose: 'link', linked: true });
    });

    it('leaves a login flow unaffected by an expired or missing Bearer', async () => {
      const expired = await app.get(JwtService).signAsync({ sub: '1' }, { issuer: 'husrevity-nest', expiresIn: -10 });
      const p = await prepareLogin({ sub: `sub-loginexp-${next()}`, email: uniqueEmail('loginexp') });
      const res = await exchange(p.handoff, p.verifier, expired);
      expect(res.status).toBe(200);
      expect(res.body.data.purpose).toBe('login');
    });
  });

  describe('existing_email_never_autolinks', () => {
    it('rejects a Google sign-in whose e-mail belongs to an existing account and writes nothing', async () => {
      const email = uniqueEmail('existing');
      const owner = await createPasswordUser(email);
      const [before] = await ds.query(`SELECT password_hash FROM app_user WHERE id = $1`, [owner.user.id]);
      const tokensBefore = await countRows(`SELECT count(*)::int AS count FROM refresh_token WHERE user_id = $1`, [owner.user.id]);
      const sub = `sub-existing-${next()}`;

      const res = await googleLogin({ sub, email });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/sign in with your password/i);
      expect(res.body.data).toBeNull();
      expect(await identityCountFor(sub)).toBe(0);
      expect(await userCount(email)).toBe(1);
      expect(await countRows(`SELECT count(*)::int AS count FROM refresh_token WHERE user_id = $1`, [owner.user.id])).toBe(tokensBefore);
      const [after] = await ds.query(`SELECT password_hash, password_login_enabled FROM app_user WHERE id = $1`, [owner.user.id]);
      expect(after.password_hash).toBe(before.password_hash);
      expect(after.password_login_enabled).toBe(true);
    });

    it('treats the e-mail case-insensitively', async () => {
      const email = uniqueEmail('casey');
      await createPasswordUser(email);
      const sub = `sub-case-${next()}`;
      const res = await googleLogin({ sub, email: email.toUpperCase() });
      expect(res.status).toBe(409);
      expect(await identityCountFor(sub)).toBe(0);
    });

    it('rejects an unverified Google e-mail', async () => {
      const sub = `sub-unverified-${next()}`;
      const email = uniqueEmail('unverified');
      const res = await googleLogin({ sub, email, email_verified: false } as never);
      expect(res.status).toBe(401);
      expect(await userCount(email)).toBe(0);
      expect(await identityCountFor(sub)).toBe(0);
    });
  });

  // ---- 17 ---------------------------------------------------------------

  describe('signup_race_with_invite', () => {
    it('two parallel first-time sign-ins of the same Google account create one user and no 500', async () => {
      const sub = `sub-dup-${next()}`;
      const email = uniqueEmail('dup');
      const [a, b] = await Promise.all([prepareLogin({ sub, email }), prepareLogin({ sub, email })]);
      const results = await Promise.all([exchange(a.handoff, a.verifier), exchange(b.handoff, b.verifier)]);
      for (const r of results) expect([200, 409]).toContain(r.status);
      expect(results.some((r) => r.status === 200)).toBe(true);
      expect(await userCount(email)).toBe(1);
      expect(await identityCountFor(sub)).toBe(1);
    });

    it('never lets Google sign-up steal an invited e-mail while the invite is accepted in parallel', async () => {
      for (let i = 0; i < 4; i++) {
        const email = uniqueEmail('inv-race');
        const sub = `sub-inv-race-${next()}`;
        const inviter = await createPasswordUser(uniqueEmail('inviter'));
        const token = randomBytes(24).toString('base64url');
        await ds.query(
          `INSERT INTO user_invite (invited_by_id, email, token_hash, role, expires_at)
           VALUES ($1, $2, $3, 'user', now() + interval '1 day')`,
          [inviter.user.id, email, sha256Hex(token)],
        );
        const p = await prepareLogin({ sub, email });

        const [google, accepted] = await Promise.all([
          exchange(p.handoff, p.verifier),
          admin.acceptInvite(token, { password: 'a-long-enough-password' } as never).then(
            () => 'ok' as const,
            (e: { status?: number }) => e.status ?? 500,
          ),
        ]);

        expect(google.status).toBe(409);
        expect(accepted).toBe('ok');
        expect(await userCount(email)).toBe(1);
        expect(await identityCountFor(sub)).toBe(0);
        const [u] = await ds.query(`SELECT password_login_enabled FROM app_user WHERE email = $1`, [email]);
        expect(u.password_login_enabled).toBe(true);
      }
    });

    it('stays consistent when a Google sign-up races a password registration for the same e-mail', async () => {
      for (let i = 0; i < 4; i++) {
        const email = uniqueEmail('reg-race');
        const sub = `sub-reg-race-${next()}`;
        const p = await prepareLogin({ sub, email });
        const [google] = await Promise.all([
          exchange(p.handoff, p.verifier),
          auth.register({ email, password: 'a-long-enough-password' } as never).catch(() => null),
        ]);
        expect([200, 409]).toContain(google.status);
        expect(await userCount(email)).toBe(1);
        // An identity row exists if and only if Google created the account.
        expect(await identityCountFor(sub)).toBe(google.status === 200 ? 1 : 0);
        const [u] = await ds.query(`SELECT password_login_enabled FROM app_user WHERE email = $1`, [email]);
        expect(u.password_login_enabled).toBe(google.status !== 200);
      }
    });
  });

  // ---- 18 ---------------------------------------------------------------

  describe('live_invite_blocks_google_signup', () => {
    const insertInvite = async (email: string, sql: string) => {
      const inviter = await createPasswordUser(uniqueEmail('inviter'));
      await ds.query(
        `INSERT INTO user_invite (invited_by_id, email, token_hash, role, expires_at, accepted_at)
         VALUES ($1, $2, $3, 'admin', ${sql})`,
        [inviter.user.id, email, sha256Hex(randomBytes(8).toString('hex'))],
      );
    };

    it('refuses with a message pointing to the invite link and creates nothing', async () => {
      const email = uniqueEmail('invited');
      await insertInvite(email, `now() + interval '1 day', NULL`);
      const sub = `sub-invited-${next()}`;
      const res = await googleLogin({ sub, email: email.toUpperCase() });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/invitation link/i);
      expect(await userCount(email)).toBe(0);
      expect(await identityCountFor(sub)).toBe(0);
    });

    it('does not block on an expired invite, and the new user never inherits the invite role', async () => {
      const email = uniqueEmail('expired-invite');
      await insertInvite(email, `now() - interval '1 day', NULL`);
      const res = await googleLogin({ sub: `sub-expinv-${next()}`, email });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('user');
    });
  });

  // ---- 19 ---------------------------------------------------------------

  describe('google_signup_skips_invite_activation', () => {
    it('creates the user without joining the project or accepting the project invite', async () => {
      const owner = await createPasswordUser(uniqueEmail('proj-owner'));
      const email = uniqueEmail('proj-invitee');
      const [project] = await ds.query(
        `INSERT INTO project (owner_id, code, name) VALUES ($1, $2, 'P') RETURNING id`,
        [owner.user.id, `P${next()}`],
      );
      await ds.query(`INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [project.id, owner.user.id]);
      await ds.query(
        `INSERT INTO project_invite (project_id, invited_by_id, email, token_hash, role, expires_at)
         VALUES ($1, $2, $3, $4, 'EDITOR', now() + interval '1 day')`,
        [project.id, owner.user.id, email, sha256Hex(randomBytes(8).toString('hex'))],
      );

      const res = await googleLogin({ sub: `sub-proj-${next()}`, email });
      expect(res.status).toBe(200);
      const userId = res.body.data.user.id;

      expect(await countRows(`SELECT count(*)::int AS count FROM project_member WHERE user_id = $1`, [userId])).toBe(0);
      const [invite] = await ds.query(`SELECT accepted_at, accepted_user_id FROM project_invite WHERE email = $1`, [email]);
      expect(invite).toEqual({ accepted_at: null, accepted_user_id: null });
    });
  });

  // ---- 20 ---------------------------------------------------------------

  describe('disabled_or_deleted_user_refused', () => {
    it('re-checks the account at exchange for disabled and soft-deleted users, and allows it again once restored', async () => {
      const sub = `sub-dis-${next()}`;
      const email = uniqueEmail('dis');
      const first = await googleLogin({ sub, email });
      expect(first.status).toBe(200);
      const userId = first.body.data.user.id;
      const tokens = () => countRows(`SELECT count(*)::int AS count FROM refresh_token WHERE user_id = $1`, [userId]);
      const base = await tokens();

      await ds.query(`UPDATE app_user SET enabled = false WHERE id = $1`, [userId]);
      const disabled = await googleLogin({ sub, email });
      expect(disabled.status).toBe(403);
      expect(disabled.body.data).toBeNull();
      expect(await tokens()).toBe(base);

      await ds.query(`UPDATE app_user SET enabled = true, deleted_at = now() WHERE id = $1`, [userId]);
      expect((await googleLogin({ sub, email })).status).toBe(403);
      expect(await tokens()).toBe(base);
      // A deleted account's identity must not be silently re-registered as a new user either.
      expect(await countRows(`SELECT count(*)::int AS count FROM app_user WHERE deleted_at IS NULL AND email = $1`, [email])).toBe(0);

      await ds.query(`UPDATE app_user SET deleted_at = NULL WHERE id = $1`, [userId]);
      expect((await googleLogin({ sub, email })).status).toBe(200);
      expect(await tokens()).toBe(base + 1);
    });
  });

  // ---- 21 ---------------------------------------------------------------

  describe('password_login_unchanged', () => {
    it('keeps password login working for an existing user with the same response shape', async () => {
      const email = uniqueEmail('pw');
      await auth.register({ email, password: 'correct-horse-battery' } as never);
      const ok = await request(server()).post('/api/auth/login').send({ email, password: 'correct-horse-battery' });
      expect(ok.status).toBe(200);
      expect(Object.keys(ok.body.data).sort()).toEqual(['accessToken', 'refreshToken', 'user']);
      expect(ok.body.data.user.email).toBe(email);
      expect((await request(server()).post('/api/auth/login').send({ email, password: 'wrong-password' })).status).toBe(401);
      const [row] = await ds.query(`SELECT password_login_enabled FROM app_user WHERE email = $1`, [email]);
      expect(row.password_login_enabled).toBe(true);
    });

    it('gives a Google-created user an unusable random hash that cannot log in', async () => {
      const email = uniqueEmail('gonly');
      const res = await googleLogin({ sub: `sub-gonly-${next()}`, email });
      expect(res.status).toBe(200);
      const [row] = await ds.query(`SELECT password_hash, password_login_enabled FROM app_user WHERE email = $1`, [email]);
      expect(row.password_login_enabled).toBe(false);
      expect(row.password_hash).toMatch(/^\$2[aby]\$/);

      for (const guess of [row.password_hash, email, 'password', 'correct-horse-battery', 'changeme123']) {
        const login = await request(server()).post('/api/auth/login').send({ email, password: guess });
        expect(login.status).toBe(401);
      }
      const other = await googleLogin({ sub: `sub-gonly2-${next()}`, email: uniqueEmail('gonly2') });
      const [row2] = await ds.query(`SELECT password_hash FROM app_user WHERE id = $1`, [other.body.data.user.id]);
      expect(row2.password_hash).not.toBe(row.password_hash);
    });
  });

  // ---- sign-in sessions & unlink ---------------------------------------

  describe('sessions and unlink', () => {
    it('signs a returning Google user into the same account and the session works', async () => {
      const sub = `sub-return-${next()}`;
      const email = uniqueEmail('return');
      const a = await googleLogin({ sub, email });
      const b = await googleLogin({ sub, email: uniqueEmail('changed-email') });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(b.body.data.user.id).toBe(a.body.data.user.id);
      const me = await request(server()).get('/api/auth/google/identity').set('Authorization', `Bearer ${b.body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data).toMatchObject({ linked: true, email, passwordLoginEnabled: false });
    });

    it('stores no Google token and clears the spent code', async () => {
      const sub = `sub-notoken-${next()}`;
      const p = await prepareLogin({ sub, email: uniqueEmail('notoken') });
      expect((await exchange(p.handoff, p.verifier)).status).toBe(200);
      const [flow] = await ds.query(`SELECT encrypted_google_code, encrypted_pkce_verifier, consumed_at FROM oauth_flow WHERE handoff_code_hash = $1`, [sha256Hex(p.handoff)]);
      expect(flow.encrypted_google_code).toBeNull();
      expect(flow.encrypted_pkce_verifier).toBeNull();
      expect(flow.consumed_at).not.toBeNull();
      const tables = await ds.query(`SELECT table_name FROM information_schema.columns WHERE column_name IN ('access_token','refresh_token_google','encrypted_access_token') AND table_name = 'user_identity'`);
      expect(tables).toHaveLength(0);
    });

    it('refuses to remove the only sign-in method of a Google-only user but unlinks a password user', async () => {
      const gonly = await googleLogin({ sub: `sub-unlink1-${next()}`, email: uniqueEmail('unlink1') });
      const refused = await request(server()).delete('/api/auth/google/identity').set('Authorization', `Bearer ${gonly.body.data.accessToken}`);
      expect(refused.status).toBe(400);

      const user = await createPasswordUser(uniqueEmail('unlink2'));
      const c = pkce();
      const ls = await request(server()).post('/api/auth/google/link/start').set('Authorization', `Bearer ${user.accessToken}`).send({ codeChallenge: c.challenge });
      const sub = `sub-unlink2-${next()}`;
      const p = await prepareLogin({ sub, email: uniqueEmail('g') }, { ticket: ls.body.data.ticket, verifier: c.verifier });
      expect((await exchange(p.handoff, p.verifier, user.accessToken)).status).toBe(200);
      expect((await request(server()).delete('/api/auth/google/identity').set('Authorization', `Bearer ${user.accessToken}`)).status).toBe(204);
      expect(await identityCountFor(sub)).toBe(0);
      expect((await request(server()).delete('/api/auth/google/identity').set('Authorization', `Bearer ${user.accessToken}`)).status).toBe(404);
    });
  });

  // ---- contract ---------------------------------------------------------

  describe('contract: envelope and error bodies', () => {
    const envelope = (body: unknown, success: boolean, code: number) => {
      expect(body).toEqual({
        success,
        message: expect.any(String),
        code,
        data: success ? expect.anything() : null,
      });
    };

    it('wraps GET /auth/google/config', async () => {
      const res = await request(server()).get('/api/auth/google/config');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'OK', code: 200, data: { enabled: true } });
    });

    it('wraps a successful login exchange like /auth/login plus the purpose', async () => {
      const res = await googleLogin({ sub: `sub-contract-${next()}`, email: uniqueEmail('contract') });
      envelope(res.body, true, 200);
      expect(Object.keys(res.body.data).sort()).toEqual(['accessToken', 'purpose', 'refreshToken', 'user']);
      expect(res.body.data.purpose).toBe('login');
    });

    it('returns the error envelope for a bad code, a validation failure and a missing Bearer', async () => {
      const bad = await exchange('unknown-code', randomBytes(32).toString('base64url'));
      envelope(bad.body, false, 400);

      const invalid = await request(server()).post('/api/auth/google/exchange').send({});
      envelope(invalid.body, false, 400);
      expect(invalid.body.message).toMatch(/^Validation failed/);

      const noBearer = await request(server()).post('/api/auth/google/link/start').send({ codeChallenge: pkce().challenge });
      envelope(noBearer.body, false, 401);
      envelope((await request(server()).get('/api/auth/google/identity')).body, false, 401);
      envelope((await request(server()).delete('/api/auth/google/identity')).body, false, 401);
    });

    it('wraps link/start and identity for a signed-in user', async () => {
      const user = await createPasswordUser(uniqueEmail('contract-link'));
      const ls = await request(server()).post('/api/auth/google/link/start').set('Authorization', `Bearer ${user.accessToken}`).send({ codeChallenge: pkce().challenge });
      envelope(ls.body, true, 200);
      expect(Object.keys(ls.body.data)).toEqual(['ticket']);
      const st = await request(server()).get('/api/auth/google/identity').set('Authorization', `Bearer ${user.accessToken}`);
      expect(st.body).toEqual({ success: true, message: 'OK', code: 200, data: { linked: false, email: null, passwordLoginEnabled: true } });
    });

    it('returns the error envelope for callback and start failures', async () => {
      envelope((await callback('nope', null)).body, false, 400);
      envelope((await request(server()).get('/api/auth/google/start')).body, false, 400);
    });
  });
});
