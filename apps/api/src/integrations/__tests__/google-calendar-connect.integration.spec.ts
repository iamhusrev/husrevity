import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { google } from 'googleapis';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ValidationError } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { OAuthFlow } from '../../auth/oauth-flow.entity';
import { ApiException } from '../../common/api.exception';
import { GlobalExceptionFilter } from '../../common/global-exception.filter';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { CryptoService } from '../../crypto/crypto.service';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { User } from '../../user/user.entity';
import { GoogleCalendarConfig } from '../google-calendar.config';
import { GoogleCalendarConnectService } from '../google-calendar-connect.service';
import { GoogleCalendarWriteService } from '../google-calendar-write.service';
import { GoogleCalendarLifecycleService } from '../google-calendar-lifecycle.service';
import { GoogleCalendarSelectionService } from '../google-calendar-selection.service';
import { GoogleCalendarController } from '../google-calendar.controller';
import { GoogleCalendarService } from '../google-calendar.service';
import { IntegrationAccount } from '../integration-account.entity';
import { IntegrationAccountService } from '../integration-account.service';
import { FakeGoogleGateway } from '../testing/fake-google-gateway';
import { exchange, finishConsent, fragmentOf, newPkce } from '../testing/calendar-consent-flow';

/**
 * Secure calendar connect (plan section 5, slice 5) with the handoff exchange that binds the
 * Google tokens to the Bearer user holding the PKCE verifier. ONE disposable Postgres
 * container, a real Nest app (guards, pipes, filters as in main.ts) and the
 * scripted FakeGoogleGateway behind the OAuth2 client: no network, no real Google.
 */
jest.setTimeout(300_000);

const CLIENT_ID = 'client-id.example.test';
const API = 'https://api.example.test';
const REDIRECT = `${API}/api/integrations/google-calendar/callback`;
const WEB = 'https://app.example.test';
const JWT_SECRET = 'integration-test-jwt-secret-at-least-32-bytes!!';
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar';
const COOKIE = 'hv_gc_flow';

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

describe('google calendar connect (integration)', () => {
  let h: MigrationHarness;
  let app: INestApplication;
  let ds: DataSource;
  let fake: FakeGoogleGateway;
  let jwt: JwtService;
  let seq = 0;

  const server = () => app.getHttpServer();
  const next = () => ++seq;

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    fake = new FakeGoogleGateway();

    const env = {
      GOOGLE_CALENDAR_CLIENT_ID: CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret-placeholder',
      GOOGLE_CALENDAR_REDIRECT_URI: REDIRECT,
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
          entities: [User, OAuthFlow, IntegrationAccount],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([User, OAuthFlow, IntegrationAccount]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [GoogleCalendarController],
      providers: [
        JwtStrategy,
        CryptoService,
        IntegrationAccountService,
        GoogleCalendarConnectService,
        {
          // Real URL building, but the code exchange goes to the scripted fake.
          provide: GoogleCalendarConfig,
          inject: [ConfigService],
          useFactory: (cs: ConfigService) => {
            const cfg = new GoogleCalendarConfig(cs);
            cfg.createOAuth2Client = () => {
              const client = new google.auth.OAuth2(CLIENT_ID, 'client-secret-placeholder', REDIRECT);
              (client as unknown as { getToken: unknown }).getToken = async (code: string) => ({
                tokens: await fake.exchangeCode(code),
              });
              return client;
            };
            return cfg;
          },
        },
        {
          provide: GoogleCalendarService,
          useValue: {
            ensureHusrevityCalendar: jest.fn().mockResolvedValue('cal-1'),
            registerWatchChannel: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          // GOOGLE_CALENDAR_V2_ENABLED is unset here, so only the legacy-shaped status extras are used.
          provide: GoogleCalendarSelectionService,
          inject: [ConfigService],
          useFactory: (cs: ConfigService) =>
            new GoogleCalendarSelectionService(null as never, cs, null as never, null as never, null as never),
        },
        // GOOGLE_CALENDAR_V2_ENABLED is unset: the controller never reaches the lifecycle.
        { provide: GoogleCalendarLifecycleService, useValue: {} },
        { provide: GoogleCalendarWriteService, useValue: {} },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) =>
          ApiException.badRequest(
            `Validation failed: ${errors.map((e) => e.property).join('; ')}`,
          ),
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');

    ds = moduleRef.get(DataSource);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  // ---- helpers ---------------------------------------------------------

  interface TestUser {
    id: string;
    bearer: string;
  }

  const createUser = async (label: string): Promise<TestUser> => {
    const user = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        email: `${label}-${next()}@example.test`,
        passwordHash: 'not-a-real-hash',
        enabled: true,
        role: 'user',
      }),
    );
    const bearer = await jwt.signAsync(
      { sub: user.id, email: user.email, role: 'user' },
      { expiresIn: '10m', issuer: 'husrevity-nest' },
    );
    return { id: String(user.id), bearer };
  };

  /** What the web does first: send the PKCE challenge, receive the API start URL. */
  const connectUrl = (u: TestUser, challenge = newPkce().challenge) =>
    request(server())
      .get('/api/integrations/google-calendar/connect-url')
      .query(challenge ? { codeChallenge: challenge } : {})
      .set({ Authorization: `Bearer ${u.bearer}` });

  /** What a browser does with the returned URL: a top-level navigation to the start route. */
  const startFrom = (url: string, headers: Record<string, string> = {}) => {
    const parsed = new URL(url);
    return request(server()).get(`${parsed.pathname}${parsed.search}`).set(headers);
  };

  const cookieOf = (res: request.Response): string => {
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '';
    return raw.split(';')[0];
  };

  const stateOf = (res: request.Response): string =>
    new URL(res.headers.location).searchParams.get('state')!;

  /** Authenticated user begins the flow (web holds `verifier`); their browser starts it. */
  const beginFlow = async (u: TestUser) => {
    const { verifier, challenge } = newPkce();
    const res = await connectUrl(u, challenge);
    expect(res.status).toBe(200);
    const start = await startFrom(res.body.data.url);
    expect(start.status).toBe(302);
    return { start, state: stateOf(start), cookie: cookieOf(start), url: res.body.data.url as string, verifier };
  };

  const callback = (state: string | undefined, cookie: string | null, code = 'gcal-code') =>
    request(server())
      .get('/api/integrations/google-calendar/callback')
      .query({ ...(state ? { state } : {}), code })
      .set(cookie ? { Cookie: cookie } : {});

  /** Google redirects to the callback and the web exchanges the handoff code. */
  const consent = (u: TestUser, flow: { state: string; cookie: string; verifier: string }, code: string) =>
    finishConsent(server(), { bearer: u.bearer, state: flow.state, cookie: flow.cookie, verifier: flow.verifier, query: { code } });

  const registerCode = (scope = CAL_SCOPE) => {
    const code = `gcal-code-${next()}`;
    fake.registerAuthCode(code, { scope });
    return code;
  };

  const accountRows = (ownerId: string) =>
    ds.query(`SELECT * FROM integration_account WHERE owner_id = $1`, [ownerId]);
  const connectionRows = (ownerId: string) =>
    ds.query(`SELECT * FROM google_calendar_connection WHERE owner_id = $1`, [ownerId]).catch(() => []);
  const exchangedGoogleCodes = (code: string) =>
    fake.callsTo('oauth.exchangeCode').filter((c) => (c.args as { code: string }).code === code);

  const handoffPrefix = `${WEB}/settings/integrations/google-callback#code=`;
  const errorRedirect = `${WEB}/settings/integrations/google-callback#error=google_failed`;

  // ---- tests -----------------------------------------------------------

  describe('happy path', () => {
    it('keeps the Google code encrypted at the callback and stores the encrypted tokens for the flow user only at the exchange', async () => {
      const u = await createUser('happy');
      const flow = await beginFlow(u);

      // Google gets the unchanged scope set (flag off), offline access and forced consent.
      const auth = new URL(flow.start.headers.location);
      expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(auth.searchParams.get('scope')).toBe(CAL_SCOPE);
      expect(auth.searchParams.get('access_type')).toBe('offline');
      expect(auth.searchParams.get('prompt')).toBe('consent');

      // The cookie is flow specific, HttpOnly, SameSite=Lax, Secure on https, scoped to the callback.
      const rawCookie = ([] as string[]).concat(flow.start.headers['set-cookie'])[0];
      expect(rawCookie).toMatch(/HttpOnly/i);
      expect(rawCookie).toMatch(/SameSite=Lax/i);
      expect(rawCookie).toMatch(/Secure/i);
      expect(rawCookie).toContain('Path=/api/integrations/google-calendar/callback');
      expect(flow.cookie.startsWith(`${COOKIE}=`)).toBe(true);
      expect(flow.start.headers['cache-control']).toBe('no-store');

      const code = registerCode();
      const cb = await callback(flow.state, flow.cookie, code);
      expect(cb.status).toBe(302);
      // The handoff code travels in the URL FRAGMENT, never in the query string.
      expect(cb.headers.location.startsWith(handoffPrefix)).toBe(true);
      expect(cb.headers.location).not.toContain('?');
      const handoff = fragmentOf(cb).get('code')!;

      // The callback stored NO token and did not even talk to Google yet.
      expect(await accountRows(u.id)).toHaveLength(0);
      expect(exchangedGoogleCodes(code)).toHaveLength(0);
      const parked = await ds.query(`SELECT * FROM oauth_flow WHERE state_hash = $1`, [sha256Hex(flow.state)]);
      expect(parked[0].consumed_at).toBeNull();
      expect(parked[0].encrypted_google_code).not.toBeNull();
      expect(parked[0].encrypted_google_code).not.toContain(code);
      expect(parked[0].handoff_code_hash).toBe(sha256Hex(handoff));
      expect(JSON.stringify(parked[0])).not.toContain(handoff);

      const ex = await exchange(server(), u.bearer, { code: handoff, verifier: flow.verifier });
      expect(ex.status).toBe(200);
      expect(ex.body.data).toEqual({ kind: 'connect', connected: true });

      const rows = await accountRows(u.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('connected');
      expect(rows[0].scopes).toEqual([CAL_SCOPE]);
      // Tokens are encrypted at rest, never stored as the Google values.
      expect(rows[0].encrypted_access_token).not.toContain(`access-${code}`);
      expect(rows[0].encrypted_refresh_token).not.toContain(`refresh-${code}`);
      const crypto = app.get(CryptoService);
      expect(crypto.decrypt(rows[0].encrypted_access_token)).toBe(`access-${code}`);
      expect(crypto.decrypt(rows[0].encrypted_refresh_token)).toBe(`refresh-${code}`);

      // The flow is spent and the Google code is wiped.
      const spent = await ds.query(`SELECT consumed_at, encrypted_google_code FROM oauth_flow WHERE state_hash = $1`, [
        sha256Hex(flow.state),
      ]);
      expect(spent[0].consumed_at).not.toBeNull();
      expect(spent[0].encrypted_google_code).toBeNull();
    });

    it('keeps GET /status working for the connected user', async () => {
      const u = await createUser('status');
      const before = await request(server())
        .get('/api/integrations/google-calendar/status')
        .set({ Authorization: `Bearer ${u.bearer}` });
      expect(before.body.data).toMatchObject({ configured: true, connected: false, v2Enabled: false, mode: 'legacy' });

      const flow = await beginFlow(u);
      expect((await consent(u, flow, registerCode())).connected).toBe(true);
      const after = await request(server())
        .get('/api/integrations/google-calendar/status')
        .set({ Authorization: `Bearer ${u.bearer}` });
      expect(after.body.data).toMatchObject({ configured: true, connected: true });
    });
  });

  describe('connect-url / start entry', () => {
    it('requires the Bearer token and a PKCE challenge on connect-url and hands out an API start URL, not a Google URL', async () => {
      const anonymous = await request(server())
        .get('/api/integrations/google-calendar/connect-url')
        .query({ codeChallenge: newPkce().challenge });
      expect(anonymous.status).toBe(401);

      const u = await createUser('url');
      expect((await connectUrl(u, '')).status).toBe(400); // no challenge
      expect((await connectUrl(u, 'too-short')).status).toBe(400);

      const { challenge } = newPkce();
      const res = await connectUrl(u, challenge);
      expect(res.status).toBe(200);
      const url = new URL(res.body.data.url);
      expect(url.origin).toBe(API);
      expect(url.pathname).toBe('/api/integrations/google-calendar/start');
      expect(url.searchParams.get('ticket')).toBeTruthy();
      // Only the hash of the ticket is stored, next to the challenge (never a verifier).
      const ticket = url.searchParams.get('ticket')!;
      const rows = await ds.query(
        `SELECT purpose, user_id, code_challenge FROM oauth_flow WHERE start_ticket_hash = $1`,
        [sha256Hex(ticket)],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].purpose).toBe('calendar_connect');
      expect(String(rows[0].user_id)).toBe(u.id);
      expect(rows[0].code_challenge).toBe(`connect.${challenge}`);
      const plain = await ds.query(`SELECT count(*)::int AS c FROM oauth_flow WHERE start_ticket_hash = $1`, [ticket]);
      expect(plain[0].c).toBe(0);
    });

    it('redeems a ticket exactly once and rejects a missing, unknown or expired ticket', async () => {
      const u = await createUser('ticket');
      const { url } = await beginFlow(u);
      expect((await startFrom(url)).status).toBe(400); // replay of the same ticket

      expect((await request(server()).get('/api/integrations/google-calendar/start')).status).toBe(400);
      expect(
        (await request(server()).get('/api/integrations/google-calendar/start').query({ ticket: 'unknown' })).status,
      ).toBe(400);

      const res = await connectUrl(u);
      const ticket = new URL(res.body.data.url).searchParams.get('ticket')!;
      await ds.query(`UPDATE oauth_flow SET expires_at = now() - interval '1 minute' WHERE start_ticket_hash = $1`, [sha256Hex(ticket)]);
      expect((await startFrom(res.body.data.url)).status).toBe(400);
    });

    it('rejects /start when it is not a top-level navigation and leaves the ticket usable', async () => {
      const u = await createUser('nav');
      const res = await connectUrl(u);
      const blocked = await startFrom(res.body.data.url, { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' });
      expect(blocked.status).toBe(400);
      expect((await startFrom(res.body.data.url, { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' })).status).toBe(302);
    });

    it('sends the legacy connect route through the same ticket flow, never straight to Google', async () => {
      const u = await createUser('legacy');
      const res = await request(server())
        .get('/api/integrations/google-calendar/connect')
        .query({ codeChallenge: newPkce().challenge })
        .set({ Authorization: `Bearer ${u.bearer}`, 'Sec-Fetch-Mode': 'navigate' })
        .redirects(0);
      expect(res.status).toBe(302);
      const loc = new URL(res.headers.location);
      expect(loc.origin).toBe(API);
      expect(loc.pathname).toBe('/api/integrations/google-calendar/start');
      expect(loc.searchParams.get('ticket')).toBeTruthy();
    });
  });

  describe('callback binds state AND cookie AND an open flow, and stores no token', () => {
    it('rejects a callback without the flow cookie and writes nothing', async () => {
      const u = await createUser('nocookie');
      const flow = await beginFlow(u);
      const code = registerCode();
      const cb = await callback(flow.state, null, code);
      expect(cb.status).toBe(302);
      expect(cb.headers.location).toBe(errorRedirect);
      expect(await accountRows(u.id)).toHaveLength(0);
      expect(exchangedGoogleCodes(code)).toHaveLength(0);
      const row = await ds.query(`SELECT handoff_code_hash, callback_at FROM oauth_flow WHERE state_hash = $1`, [sha256Hex(flow.state)]);
      expect(row[0].handoff_code_hash).toBeNull();
      expect(row[0].callback_at).toBeNull();
    });

    it('attacker_connect_link_cannot_bind_victim', async () => {
      const attacker = await createUser('attacker');
      const victim = await createUser('victim');

      // The attacker starts a flow for their own account and gets a valid Google consent URL (valid state).
      const attackerFlow = await beginFlow(attacker);

      // The victim is lured into finishing that consent: Google redirects the VICTIM's browser to the
      // callback with the attacker's state and the victim's fresh Google code.
      const victimCode = registerCode();

      // (a) the victim's browser holds no flow cookie at all
      const noCookie = await callback(attackerFlow.state, null, victimCode);
      expect(noCookie.headers.location).toBe(errorRedirect);

      // (b) the victim's browser holds a flow cookie, but of the victim's own, different flow
      const victimFlow = await beginFlow(victim);
      const wrongCookie = await callback(attackerFlow.state, victimFlow.cookie, victimCode);
      expect(wrongCookie.headers.location).toBe(errorRedirect);

      // (c) the attacker's cookie id with a guessed secret
      const forged = `${COOKIE}=${attackerFlow.cookie.slice(COOKIE.length + 1).split('.')[0]}.guessed-secret`;
      const guessed = await callback(attackerFlow.state, forged, victimCode);
      expect(guessed.headers.location).toBe(errorRedirect);

      // Nothing was stored for anyone, and the victim's Google code was never exchanged.
      expect(await accountRows(attacker.id)).toHaveLength(0);
      expect(await accountRows(victim.id)).toHaveLength(0);
      expect(exchangedGoogleCodes(victimCode)).toHaveLength(0);
    });

    it('binds the stored tokens to the flow user only, whatever the callback carries', async () => {
      const owner = await createUser('owner');
      const other = await createUser('bystander');
      const flow = await beginFlow(owner);
      const code = registerCode();
      const cb = await request(server())
        .get('/api/integrations/google-calendar/callback')
        .query({ state: flow.state, code, userId: other.id, ownerId: other.id })
        .set({ Cookie: flow.cookie, Authorization: `Bearer ${other.bearer}` });
      const handoff = fragmentOf(cb).get('code')!;
      expect(handoff).toBeTruthy();
      expect(await accountRows(other.id)).toHaveLength(0);

      // The bystander cannot redeem it with their own Bearer, even holding the right verifier.
      expect((await exchange(server(), other.bearer, { code: handoff, verifier: flow.verifier })).status).toBe(400);
      expect(await accountRows(other.id)).toHaveLength(0);
      expect(await accountRows(owner.id)).toHaveLength(0);

      expect((await exchange(server(), owner.bearer, { code: handoff, verifier: flow.verifier })).body.data.connected).toBe(true);
      expect(await accountRows(owner.id)).toHaveLength(1);
      expect(await accountRows(other.id)).toHaveLength(0);
    });

    it('rejects a replayed callback and exchanges the Google code only once', async () => {
      const u = await createUser('replay');
      const flow = await beginFlow(u);
      const code = registerCode();
      expect((await consent(u, flow, code)).connected).toBe(true);

      const again = registerCode();
      expect((await callback(flow.state, flow.cookie, again)).headers.location).toBe(errorRedirect);
      expect(exchangedGoogleCodes(again)).toHaveLength(0);
    });

    it('lets exactly one of two parallel callbacks win', async () => {
      const u = await createUser('race');
      const flow = await beginFlow(u);
      const results = await Promise.all([
        callback(flow.state, flow.cookie, registerCode()),
        callback(flow.state, flow.cookie, registerCode()),
      ]);
      const winners = results.filter((r) => r.headers.location.startsWith(handoffPrefix));
      expect(winners).toHaveLength(1);
      expect(results.filter((r) => r.headers.location === errorRedirect)).toHaveLength(1);
      const handoff = fragmentOf(winners[0]).get('code')!;
      expect((await exchange(server(), u.bearer, { code: handoff, verifier: flow.verifier })).body.data.connected).toBe(true);
      expect(await accountRows(u.id)).toHaveLength(1);
    });

    it('rejects an expired flow and writes nothing', async () => {
      const u = await createUser('expired');
      const flow = await beginFlow(u);
      await ds.query(`UPDATE oauth_flow SET expires_at = now() - interval '1 minute' WHERE state_hash = $1`, [sha256Hex(flow.state)]);
      const cb = await callback(flow.state, flow.cookie, registerCode());
      expect(cb.headers.location).toBe(errorRedirect);
      expect(await accountRows(u.id)).toHaveLength(0);
    });

    it('rejects a login or link flow state presented to the calendar callback', async () => {
      const u = await createUser('purpose');
      const flow = await beginFlow(u);
      await ds.query(`UPDATE oauth_flow SET purpose = 'link' WHERE state_hash = $1`, [sha256Hex(flow.state)]);
      const cb = await callback(flow.state, flow.cookie, registerCode());
      expect(cb.headers.location).toBe(errorRedirect);
      expect(await accountRows(u.id)).toHaveLength(0);
    });

    it('burns the flow when the user denies consent, so the same state cannot be reused', async () => {
      const u = await createUser('denied');
      const flow = await beginFlow(u);
      const denied = await request(server())
        .get('/api/integrations/google-calendar/callback')
        .query({ state: flow.state, error: 'access_denied' })
        .set({ Cookie: flow.cookie });
      expect(denied.headers.location).toBe(`${WEB}/settings/integrations/google-callback#error=google_denied`);
      expect((await callback(flow.state, flow.cookie, registerCode())).headers.location).toBe(errorRedirect);
      expect(await accountRows(u.id)).toHaveLength(0);
    });

    it('clears the flow cookie on every callback outcome', async () => {
      const u = await createUser('clear');
      const flow = await beginFlow(u);
      const ok = await callback(flow.state, flow.cookie, registerCode());
      expect(([] as string[]).concat(ok.headers['set-cookie'] ?? []).join(';')).toMatch(new RegExp(`${COOKIE}=;`));
      const bad = await callback('forged', null);
      expect(([] as string[]).concat(bad.headers['set-cookie'] ?? []).join(';')).toMatch(new RegExp(`${COOKIE}=;`));
    });
  });

  describe('exchange binds the Bearer user AND the PKCE verifier to the flow', () => {
    it('attacker_start_link_cannot_bind_victim', async () => {
      const attacker = await createUser('attacker');
      const victim = await createUser('victim');

      // The attacker begins a connect flow for their own account (the attacker's web holds the verifier)
      // and sends the victim the /start link.
      const attackerPkce = newPkce();
      const begin = await connectUrl(attacker, attackerPkce.challenge);
      expect(begin.status).toBe(200);

      // The victim opens it: their own browser redeems the ticket, gets the flow cookie and signs in to Google.
      const start = await startFrom(begin.body.data.url);
      expect(start.status).toBe(302);
      const victimCode = registerCode();
      const cb = await callback(stateOf(start), cookieOf(start), victimCode);
      const handoff = fragmentOf(cb).get('code')!;
      expect(handoff).toBeTruthy(); // the callback itself cannot tell; the exchange must refuse

      const victimOwnPkce = newPkce();
      const attempts = [
        // the victim's web holds no verifier for this flow, so it can only send its own
        await exchange(server(), victim.bearer, { code: handoff, verifier: victimOwnPkce.verifier }),
        // even with the attacker's verifier, the Bearer user is not the flow user
        await exchange(server(), victim.bearer, { code: handoff, verifier: attackerPkce.verifier }),
        // wrong verifier with the attacker's own Bearer
        await exchange(server(), attacker.bearer, { code: handoff, verifier: victimOwnPkce.verifier }),
      ];
      expect(attempts.map((r) => r.status)).toEqual([400, 400, 400]);
      // No Bearer at all
      expect((await exchange(server(), null, { code: handoff, verifier: victimOwnPkce.verifier })).status).toBe(401);

      // NOTHING was stored: no account, no connection, no token, and the victim's Google code was never exchanged.
      expect(await accountRows(attacker.id)).toHaveLength(0);
      expect(await accountRows(victim.id)).toHaveLength(0);
      expect(await connectionRows(attacker.id)).toHaveLength(0);
      expect(await connectionRows(victim.id)).toHaveLength(0);
      expect(exchangedGoogleCodes(victimCode)).toHaveLength(0);
      expect(fake.callsTo('oauth.exchangeCode').filter((c) => (c.args as { code: string }).code === victimCode)).toHaveLength(0);
    });

    it('rejects a malformed body and a missing handoff before touching anything', async () => {
      const u = await createUser('malformed');
      const post = (body: unknown) =>
        request(server()).post('/api/integrations/google-calendar/exchange').set({ Authorization: `Bearer ${u.bearer}` }).send(body as object);
      expect((await post({})).status).toBe(400);
      expect((await post({ code: 'x', verifier: 'short' })).status).toBe(400);
      expect((await post({ code: 'unknown-handoff', verifier: newPkce().verifier })).status).toBe(400);
    });

    it('is single use: a replayed exchange is rejected and stores nothing new', async () => {
      const u = await createUser('once');
      const flow = await beginFlow(u);
      const code = registerCode();
      const handoff = fragmentOf(await callback(flow.state, flow.cookie, code)).get('code')!;
      expect((await exchange(server(), u.bearer, { code: handoff, verifier: flow.verifier })).body.data.connected).toBe(true);
      const before = (await accountRows(u.id))[0].encrypted_access_token;

      expect((await exchange(server(), u.bearer, { code: handoff, verifier: flow.verifier })).status).toBe(400);
      expect((await accountRows(u.id))[0].encrypted_access_token).toBe(before);
      expect(exchangedGoogleCodes(code)).toHaveLength(1);
    });

    it('rejects an expired handoff code and an expired flow, storing nothing', async () => {
      const u = await createUser('expiry');
      const flow = await beginFlow(u);
      const code = registerCode();
      const handoff = fragmentOf(await callback(flow.state, flow.cookie, code)).get('code')!;
      await ds.query(`UPDATE oauth_flow SET handoff_expires_at = now() - interval '1 second' WHERE state_hash = $1`, [sha256Hex(flow.state)]);
      expect((await exchange(server(), u.bearer, { code: handoff, verifier: flow.verifier })).status).toBe(400);

      const flow2 = await beginFlow(u);
      const handoff2 = fragmentOf(await callback(flow2.state, flow2.cookie, registerCode())).get('code')!;
      await ds.query(`UPDATE oauth_flow SET expires_at = now() - interval '1 second' WHERE state_hash = $1`, [sha256Hex(flow2.state)]);
      expect((await exchange(server(), u.bearer, { code: handoff2, verifier: flow2.verifier })).status).toBe(400);

      expect(await accountRows(u.id)).toHaveLength(0);
      expect(exchangedGoogleCodes(code)).toHaveLength(0);
    });

    it('reports connected false and stores nothing when Google rejects the code', async () => {
      const u = await createUser('badcode');
      const flow = await beginFlow(u);
      const handoff = fragmentOf(await callback(flow.state, flow.cookie, 'not-a-registered-google-code')).get('code')!;
      const ex = await exchange(server(), u.bearer, { code: handoff, verifier: flow.verifier });
      expect(ex.status).toBe(200);
      expect(ex.body.data).toEqual({ kind: 'connect', connected: false });
      expect(await accountRows(u.id)).toHaveLength(0);
    });
  });
});
