import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationError } from 'class-validator';
import { google } from 'googleapis';
import request from 'supertest';
import { DataSource } from 'typeorm';
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
import { GOOGLE_CALENDAR_GATEWAY } from '../google-calendar-gateway';
import { GoogleCalendarConfig } from '../google-calendar.config';
import { GoogleCalendarConnectService } from '../google-calendar-connect.service';
import { GoogleCalendarEngineService } from '../google-calendar-engine.service';
import { GoogleCalendarLifecycleService, MAX_REVOKE_ATTEMPTS } from '../google-calendar-lifecycle.service';
import { GoogleCalendarPublishService } from '../google-calendar-publish.service';
import { GoogleCalendarWriteService } from '../google-calendar-write.service';
import { GoogleCalendarReadSyncService } from '../google-calendar-read-sync.service';
import { GoogleCalendarSelectionService } from '../google-calendar-selection.service';
import { GoogleCalendarV2Controller } from '../google-calendar-v2.controller';
import { GoogleCalendarController } from '../google-calendar.controller';
import { GoogleCalendarService } from '../google-calendar.service';
import { IntegrationAccount } from '../integration-account.entity';
import { IntegrationAccountService } from '../integration-account.service';
import { FakeGoogleGateway } from '../testing/fake-google-gateway';
import { fakeGateway, fakeReader } from '../testing/google-calendar-sync-fixtures';
import { finishConsent, newPkce } from '../testing/calendar-consent-flow';

/**
 * Plan section 4, tests 36 and 37 (slice 9). ONE disposable Postgres container,
 * a real Nest app (guards, pipes, filters as in main.ts) and the scripted
 * FakeGoogleGateway behind both the OAuth2 client and the calendar gateway:
 * no network, no real Google.
 */
jest.setTimeout(300_000);

const CLIENT_ID = 'client-id.example.test';
const API = 'https://api.example.test';
const REDIRECT = `${API}/api/integrations/google-calendar/callback`;
const WEB = 'https://app.example.test';
const WEBHOOK = 'https://hooks.example.test/hooks/gcal';
const JWT_SECRET = 'integration-test-jwt-secret-at-least-32-bytes!!';
const BROAD = 'https://www.googleapis.com/auth/calendar';
const CAL_LIST_RO = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const EVENTS_RO = 'https://www.googleapis.com/auth/calendar.events.readonly';
const NARROW = [CAL_LIST_RO, EVENTS_RO];
const WORK = { id: 'work@example.test', summary: 'Work', accessRole: 'writer' as const };
const HOLIDAYS = { id: 'holidays@example.test', summary: 'Holidays', accessRole: 'reader' as const };

describe('google calendar lifecycle (integration)', () => {
  let h: MigrationHarness;
  let app: INestApplication;
  let ds: DataSource;
  let fake: FakeGoogleGateway;
  let jwt: JwtService;
  let crypto: CryptoService;
  let lifecycle: GoogleCalendarLifecycleService;
  let accounts: IntegrationAccountService;
  let seq = 0;
  /** Test seams of the revoke call: run something in the middle of it, or make it fail as "not configured". */
  let revokeHook: ((token: string) => Promise<void>) | undefined;
  let revokeNotConfigured = false;

  const server = () => app.getHttpServer();
  const next = () => ++seq;
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => ds.query(sql, params);

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    fake = new FakeGoogleGateway();
    const baseGateway = fakeGateway(fake);

    const env = {
      GOOGLE_CALENDAR_CLIENT_ID: CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret-placeholder',
      GOOGLE_CALENDAR_REDIRECT_URI: REDIRECT,
      GOOGLE_CALENDAR_WEBHOOK_URL: WEBHOOK,
      GOOGLE_CALENDAR_V2_ENABLED: 'true',
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
      controllers: [GoogleCalendarController, GoogleCalendarV2Controller],
      providers: [
        JwtStrategy,
        CryptoService,
        IntegrationAccountService,
        GoogleCalendarConnectService,
        GoogleCalendarSelectionService,
        GoogleCalendarLifecycleService,
        GoogleCalendarEngineService,
        GoogleCalendarPublishService,
        GoogleCalendarWriteService,
        {
          provide: GOOGLE_CALENDAR_GATEWAY,
          useValue: {
            ...baseGateway,
            revokeToken: async (token: string) => {
              if (revokeNotConfigured) throw ApiException.badRequest('Google Calendar integration is not configured');
              await revokeHook?.(token);
              await baseGateway.revokeToken(token);
            },
          },
        },
        {
          provide: GoogleCalendarReadSyncService,
          inject: [DataSource, ConfigService],
          useFactory: (d: DataSource, cs: ConfigService) => new GoogleCalendarReadSyncService(d, cs, fakeReader(fake)),
        },
        {
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
          ApiException.badRequest(`Validation failed: ${errors.map((e) => e.property).join('; ')}`),
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');

    ds = moduleRef.get(DataSource);
    jwt = moduleRef.get(JwtService);
    crypto = moduleRef.get(CryptoService);
    lifecycle = moduleRef.get(GoogleCalendarLifecycleService);
    accounts = moduleRef.get(IntegrationAccountService);
  });

  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  beforeEach(() => {
    fake.setCalendars([{ ...WORK }, { ...HOLIDAYS }]);
  });

  // ---- helpers ---------------------------------------------------------

  interface TestUser {
    id: string;
    bearer: string;
    code: string;
  }

  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.bearer}` });
  const cookieOf = (res: request.Response): string =>
    (([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '').split(';')[0];

  /** A user who connected through the regular flow (broad scope) and selected two calendars. */
  const connectedUser = async (opts: { events?: boolean } = {}): Promise<TestUser> => {
    const user = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        email: `lifecycle-${next()}@example.test`,
        passwordHash: 'not-a-real-hash',
        enabled: true,
        role: 'user',
      }),
    );
    const bearer = await jwt.signAsync(
      { sub: user.id, email: user.email, role: 'user' },
      { expiresIn: '10m', issuer: 'husrevity-nest' },
    );
    const code = `connect-code-${next()}`;
    fake.registerAuthCode(code, { scope: BROAD });
    const u: TestUser = { id: String(user.id), bearer, code };

    const done = await connectConsent(u, code, BROAD);
    expect(done.connected).toBe(true);

    const sel = await request(server())
      .put('/api/integrations/google-calendar/calendars/selection')
      .set(auth(u))
      .send({ selected: [WORK.id, HOLIDAYS.id] });
    expect(sel.status).toBe(200);

    if (opts.events !== false) {
      for (const sub of await q<{ id: string }>(`SELECT id FROM google_calendar_subscription WHERE owner_id = $1`, [u.id])) {
        await q(
          `INSERT INTO google_calendar_event (owner_id, subscription_id, generation, google_event_id, title, all_day, start_at, end_at)
           VALUES ($1, $2, 0, $3, 'Cached', false, now(), now() + interval '1 hour')`,
          [u.id, sub.id, `ev-${sub.id}`],
        );
      }
    }
    return u;
  };

  const startFrom = (url: string) => {
    const parsed = new URL(url);
    return request(server()).get(`${parsed.pathname}${parsed.search}`);
  };

  /** Regular connect: connect-url with the PKCE challenge, browser leg, callback, exchange. Returns the Google consent URL too. */
  const connectConsent = async (u: TestUser, code: string, scope?: string) => {
    const { verifier, challenge } = newPkce();
    const begin = await request(server())
      .get('/api/integrations/google-calendar/connect-url')
      .query({ codeChallenge: challenge })
      .set(auth(u));
    expect(begin.status).toBe(200);
    const start = await startFrom(begin.body.data.url);
    const authUrl = new URL(start.headers.location);
    if (scope) fake.registerAuthCode(code, { scope });
    const done = await finishConsent(server(), {
      bearer: u.bearer,
      state: authUrl.searchParams.get('state')!,
      cookie: cookieOf(start),
      verifier,
      query: { code },
    });
    return { ...done, authUrl };
  };

  const narrowPost = (u: TestUser, challenge = newPkce().challenge) =>
    request(server()).post('/api/integrations/google-calendar/narrow').set(auth(u)).send({ codeChallenge: challenge });
  const callback = (u: TestUser, c: { state: string; cookie: string; verifier: string }, code: string) =>
    finishConsent(server(), { bearer: u.bearer, state: c.state, cookie: c.cookie, verifier: c.verifier, query: { code } });
  const statusOf = async (u: TestUser) =>
    (await request(server()).get('/api/integrations/google-calendar/status').set(auth(u))).body.data;
  const connRow = async (ownerId: string) =>
    (await q(`SELECT * FROM google_calendar_connection WHERE owner_id = $1`, [ownerId]))[0] as Record<string, any> | undefined;
  const accountRow = async (ownerId: string) =>
    (await q(`SELECT * FROM integration_account WHERE owner_id = $1`, [ownerId]))[0] as Record<string, any> | undefined;
  const counts = async (ownerId: string) =>
    (
      await q<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM google_calendar_connection WHERE owner_id = $1) AS connection,
           (SELECT count(*)::int FROM google_calendar_subscription WHERE owner_id = $1) AS subscription,
           (SELECT count(*)::int FROM google_calendar_channel WHERE owner_id = $1) AS channel,
           (SELECT count(*)::int FROM google_calendar_event WHERE owner_id = $1) AS event,
           (SELECT count(*)::int FROM google_calendar_publication WHERE owner_id = $1) AS publication,
           (SELECT count(*)::int FROM integration_account WHERE owner_id = $1) AS account`,
        [ownerId],
      )
    )[0];
  const snapshot = async (ownerId: string) =>
    JSON.stringify({
      counts: await counts(ownerId),
      conn: await connRow(ownerId),
      channels: await q(`SELECT id, stopped_at FROM google_calendar_channel WHERE owner_id = $1 ORDER BY id`, [ownerId]),
      items: await q(`SELECT id, source, deleted_at FROM items WHERE owner_id = $1 ORDER BY id`, [ownerId]),
    });

  /** Runs the narrow endpoint and the browser leg up to the Google redirect. */
  const narrowToConsent = async (u: TestUser) => {
    const { verifier, challenge } = newPkce();
    const res = await narrowPost(u, challenge);
    expect(res.status).toBe(200);
    const start = await startFrom(res.body.data.url);
    expect(start.status).toBe(302);
    return {
      verifier,
      authUrl: new URL(start.headers.location),
      state: new URL(start.headers.location).searchParams.get('state')!,
      cookie: cookieOf(start),
    };
  };

  const registerNarrowCode = (opts: { scope?: string; refresh?: boolean } = {}) => {
    const code = `narrow-code-${next()}`;
    fake.registerAuthCode(code, { scope: opts.scope ?? NARROW.join(' ') });
    if (opts.refresh === false) {
      // Re-register without a refresh token.
      fake.registerAuthCode(code, { scope: opts.scope ?? NARROW.join(' '), refresh_token: undefined });
    }
    return code;
  };

  // ======================================================================
  // 36
  // ======================================================================

  describe('narrow_grant_rejects_broad_scope', () => {
    it('pauses sync, stops the channels, revokes the old grant and asks only for the read-only scopes without include_granted_scopes', async () => {
      const u = await connectedUser();
      const before = await accountRow(u.id);
      const oldRefresh = crypto.decrypt(before!.encrypted_refresh_token)!;
      expect((await q(`SELECT 1 FROM google_calendar_channel WHERE owner_id = $1 AND stopped_at IS NULL`, [u.id])).length).toBe(2);

      const { authUrl } = await narrowToConsent(u);

      expect(fake.revokedTokens).toContain(oldRefresh);
      expect((await q(`SELECT 1 FROM google_calendar_channel WHERE owner_id = $1 AND stopped_at IS NULL`, [u.id])).length).toBe(0);
      const subs = await q<{ needs_sync_at: Date | null }>(
        `SELECT needs_sync_at FROM google_calendar_subscription WHERE owner_id = $1`,
        [u.id],
      );
      expect(subs.every((s) => s.needs_sync_at === null)).toBe(true);
      expect((await connRow(u.id))!.status).toBe('needs_reconnect');
      expect((await counts(u.id)).event).toBe(2); // cache stays

      expect(authUrl.searchParams.get('scope')!.split(' ').sort()).toEqual([...NARROW].sort());
      expect(authUrl.searchParams.has('include_granted_scopes')).toBe(false);
      expect(authUrl.searchParams.get('access_type')).toBe('offline');
      expect(authUrl.searchParams.get('prompt')).toBe('consent');
      expect(authUrl.toString()).not.toContain('calendar.app.created');

      const status = await statusOf(u);
      expect(status).toMatchObject({ needsReconnect: true, mode: 'v2_read', selectedCount: 2 });
    });

    it('stores nothing when Google returns a scope outside the allow-list, revokes it and shows needs_reconnect', async () => {
      const u = await connectedUser();
      const flow = await narrowToConsent(u);
      const stored = await accountRow(u.id);
      const code = registerNarrowCode({ scope: `${NARROW.join(' ')} ${BROAD}` });

      const done = await callback(u, flow, code);

      expect(done.callback.status).toBe(302);
      expect(done.exchange!.status).toBe(200);
      expect(done.connected).toBe(false);
      const after = await accountRow(u.id);
      expect(after!.encrypted_access_token).toBe(stored!.encrypted_access_token);
      expect(after!.encrypted_refresh_token).toBe(stored!.encrypted_refresh_token);
      expect(after!.scopes).toEqual([BROAD]);
      expect(fake.revokedTokens).toContain(`refresh-${code}`);
      const conn = await connRow(u.id);
      expect(conn!.status).toBe('needs_reconnect');
      expect(conn!.granted_scopes).toEqual([BROAD]);
      expect(conn!.last_error).toBeTruthy();
      expect(JSON.stringify(conn)).not.toContain(code);
      expect(await statusOf(u)).toMatchObject({ needsReconnect: true });
    });

    it('rejects the full calendar scope alone, a partial grant and a missing refresh token', async () => {
      for (const variant of [
        { scope: BROAD },
        { scope: CAL_LIST_RO },
        { scope: NARROW.join(' '), refresh: false },
      ]) {
        const u = await connectedUser();
        const flow = await narrowToConsent(u);
        const stored = await accountRow(u.id);
        const code = registerNarrowCode(variant);

        const done = await callback(u, flow, code);

        expect(done.connected).toBe(false);
        expect((await accountRow(u.id))!.encrypted_access_token).toBe(stored!.encrypted_access_token);
        expect((await connRow(u.id))!.status).toBe('needs_reconnect');
      }
    });

    it('stores the read-only token, reports mode narrowed and resumes sync and channels when the grant is inside the allow-list', async () => {
      const u = await connectedUser();
      const flow = await narrowToConsent(u);
      const code = registerNarrowCode();

      const done = await callback(u, flow, code);

      expect(done.connected).toBe(true);
      const acc = await accountRow(u.id);
      expect([...acc!.scopes].sort()).toEqual([...NARROW].sort());
      expect(acc!.status).toBe('connected');
      expect(crypto.decrypt(acc!.encrypted_refresh_token)).toBe(`refresh-${code}`);
      const conn = await connRow(u.id);
      expect(conn!.status).toBe('active');
      expect(conn!.last_error).toBeNull();
      const subs = await q<{ needs_sync_at: Date | null }>(
        `SELECT needs_sync_at FROM google_calendar_subscription WHERE owner_id = $1 AND selected`,
        [u.id],
      );
      expect(subs.every((s) => s.needs_sync_at !== null)).toBe(true);
      expect((await q(`SELECT 1 FROM google_calendar_channel WHERE owner_id = $1 AND stopped_at IS NULL`, [u.id])).length).toBe(2);
      expect(await statusOf(u)).toMatchObject({ mode: 'narrowed', needsReconnect: false, selectedCount: 2 });
    });

    it('answers 502 without a ticket when the revoke fails, and can be retried', async () => {
      const u = await connectedUser();
      fake.injectFailure('oauth.revoke', { status: 500 });

      const failed = await narrowPost(u);

      expect(failed.status).toBe(502);
      expect(await q(`SELECT 1 FROM oauth_flow WHERE user_id = $1 AND code_challenge LIKE 'narrow.%'`, [u.id])).toHaveLength(0);
      expect((await connRow(u.id))!.status).toBe('needs_reconnect');

      const retry = await narrowPost(u);
      expect(retry.status).toBe(200);
    });

    it('treats an already invalid token (Google 400) as revoked', async () => {
      const u = await connectedUser();
      fake.injectFailure('oauth.revoke', { status: 400 });

      expect((await narrowPost(u)).status).toBe(200);
    });

    it('refuses to narrow twice, when not connected, and without a Bearer token', async () => {
      const u = await connectedUser();
      const flow = await narrowToConsent(u);
      expect((await callback(u, flow, registerNarrowCode())).connected).toBe(true);
      expect((await narrowPost(u)).status).toBe(409);

      const stranger = await ds.getRepository(User).save(
        ds.getRepository(User).create({ email: `stranger-${next()}@example.test`, passwordHash: 'x', enabled: true, role: 'user' }),
      );
      const strangerBearer = await jwt.signAsync({ sub: stranger.id, email: stranger.email, role: 'user' }, { expiresIn: '10m', issuer: 'husrevity-nest' });
      expect((await narrowPost({ id: String(stranger.id), bearer: strangerBearer, code: '' })).status).toBe(404);
      expect((await request(server()).post('/api/integrations/google-calendar/narrow').send({ codeChallenge: newPkce().challenge })).status).toBe(401);
      // The challenge is required and validated before anything is revoked or paused.
      expect((await request(server()).post('/api/integrations/google-calendar/narrow').set(auth(u)).send({})).status).toBe(400);
    });

    it('keeps the cached events and needs_reconnect when the user abandons midway, and a regular reconnect recovers', async () => {
      const u = await connectedUser();
      await narrowToConsent(u); // never calls back
      expect((await counts(u.id)).event).toBe(2);
      expect(await statusOf(u)).toMatchObject({ needsReconnect: true });

      // Under the new model the regular connect asks for the read-only pair, never the broad scope.
      const done = await connectConsent(u, `reconnect-${next()}`, NARROW.join(' '));
      expect(done.authUrl.searchParams.get('scope')!.split(' ').sort()).toEqual([...NARROW].sort());
      expect(done.authUrl.searchParams.has('include_granted_scopes')).toBe(false);
      expect(done.connected).toBe(true);

      expect((await connRow(u.id))!.status).toBe('active');
      expect(await statusOf(u)).toMatchObject({ needsReconnect: false });
    });

    it('does not touch another user when one user narrows', async () => {
      const a = await connectedUser();
      const b = await connectedUser();
      const bBefore = await snapshot(b.id);

      await narrowToConsent(a);

      expect(await snapshot(b.id)).toBe(bBefore);
      expect((await connRow(b.id))!.status).toBe('active');
    });
  });

  // ======================================================================
  // first connect under the v2 model
  // ======================================================================

  describe('first_time_connect_under_v2', () => {
    it('asks only for the read-only pair without include_granted_scopes and skips the legacy calendar and watch channel', async () => {
      const calendar = app.get(GoogleCalendarService) as unknown as {
        ensureHusrevityCalendar: jest.Mock;
        registerWatchChannel: jest.Mock;
      };
      calendar.ensureHusrevityCalendar.mockClear();
      calendar.registerWatchChannel.mockClear();
      const user = await ds.getRepository(User).save(
        ds.getRepository(User).create({ email: `first-${next()}@example.test`, passwordHash: 'x', enabled: true, role: 'user' }),
      );
      const bearer = await jwt.signAsync({ sub: user.id, email: user.email, role: 'user' }, { expiresIn: '10m', issuer: 'husrevity-nest' });
      const u: TestUser = { id: String(user.id), bearer, code: '' };

      const done = await connectConsent(u, `first-${next()}`, NARROW.join(' '));

      expect(done.authUrl.searchParams.get('scope')!.split(' ').sort()).toEqual([...NARROW].sort());
      expect(done.authUrl.searchParams.has('include_granted_scopes')).toBe(false);
      expect(done.authUrl.searchParams.get('access_type')).toBe('offline');
      expect(done.authUrl.searchParams.get('prompt')).toBe('consent');
      expect(done.connected).toBe(true);
      expect([...(await accountRow(u.id))!.scopes].sort()).toEqual([...NARROW].sort());
      expect(calendar.ensureHusrevityCalendar).not.toHaveBeenCalled();
      expect(calendar.registerWatchChannel).not.toHaveBeenCalled();
      expect(await statusOf(u)).toMatchObject({ connected: true, mode: 'narrowed' });
    });
  });

  // ======================================================================
  // 37
  // ======================================================================

  describe('disconnect_purges_and_retries_revoke', () => {
    const addItem = async (ownerId: string, source: string, title = 'x') =>
      (
        await q<{ id: string }>(
          `INSERT INTO items (owner_id, kind, title, scheduled_at, source) VALUES ($1, 'event', $2, now(), $3) RETURNING id`,
          [ownerId, title, source],
        )
      )[0].id;
    const itemCount = async (ownerId: string, source: string) =>
      (await q<{ c: number }>(`SELECT count(*)::int AS c FROM items WHERE owner_id = $1 AND source = $2`, [ownerId, source]))[0].c;
    const del = (u: TestUser, query = '') =>
      request(server()).delete(`/api/integrations/google-calendar${query}`).set(auth(u));

    it('stops every channel, revokes the token and permanently deletes the account and all Google rows of the owner', async () => {
      const u = await connectedUser();
      const refresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      const itemId = await addItem(u.id, 'web', 'mine');
      await q(
        `INSERT INTO google_calendar_publication (owner_id, item_id, subscription_id, google_event_id)
         SELECT $1, $2, id, 'pub-1' FROM google_calendar_subscription WHERE owner_id = $1 LIMIT 1`,
        [u.id, itemId],
      );
      const other = await connectedUser();
      const otherBefore = await snapshot(other.id);
      expect(await counts(u.id)).toEqual({ connection: 1, subscription: 2, channel: 2, event: 2, publication: 1, account: 1 });
      const channelIds = (await q<{ id: string }>(`SELECT id FROM google_calendar_channel WHERE owner_id = $1`, [u.id])).map((r) => r.id);
      channelIds.forEach((id) => expect(fake.activeChannels.has(id)).toBe(true));

      const res = await del(u);

      expect(res.status).toBe(204);
      channelIds.forEach((id) => expect(fake.activeChannels.has(id)).toBe(false));
      expect(fake.revokedTokens).toContain(refresh);
      expect(await counts(u.id)).toEqual({ connection: 0, subscription: 0, channel: 0, event: 0, publication: 0, account: 0 });
      expect(await itemCount(u.id, 'web')).toBe(1); // Husrevity-origin records stay
      expect(await snapshot(other.id)).toBe(otherBefore);
      expect(await statusOf(u)).toMatchObject({ connected: false });
    });

    it('reports the legacy copy count and deletes the copies only with the explicit confirmation, never other sources or other users', async () => {
      const u = await connectedUser();
      const other = await connectedUser();
      await addItem(u.id, 'gcal', 'legacy-1');
      await addItem(u.id, 'gcal', 'legacy-2');
      await addItem(u.id, 'web', 'web');
      await addItem(u.id, 'ios', 'ios');
      await addItem(u.id, 'mcp', 'mcp');
      await addItem(other.id, 'gcal', 'other-legacy');
      const otherItems = await q(`SELECT * FROM items WHERE owner_id = $1 ORDER BY id`, [other.id]);

      const preview = await request(server()).get('/api/integrations/google-calendar/disconnect-preview').set(auth(u));
      expect(preview.status).toBe(200);
      expect(preview.body.data).toEqual({ legacyCopyCount: 2 });

      // Plain disconnect leaves the copies alone.
      const second = await connectedUser();
      await addItem(second.id, 'gcal', 'kept');
      expect((await del(second)).status).toBe(204);
      expect(await itemCount(second.id, 'gcal')).toBe(1);

      expect((await del(u, '?deleteLegacyCopies=true')).status).toBe(204);
      expect(await itemCount(u.id, 'gcal')).toBe(0);
      expect(await itemCount(u.id, 'web')).toBe(1);
      expect(await itemCount(u.id, 'ios')).toBe(1);
      expect(await itemCount(u.id, 'mcp')).toBe(1);
      expect(await q(`SELECT * FROM items WHERE owner_id = $1 ORDER BY id`, [other.id])).toEqual(otherItems);
    });

    it('keeps a retry record when the revoke fails, purges the synced data at once and drops everything when the retry succeeds', async () => {
      const u = await connectedUser();
      const other = await connectedUser();
      const otherBefore = await snapshot(other.id);
      const refresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      fake.injectFailure('oauth.revoke', { status: 503 });

      expect((await del(u)).status).toBe(204);

      expect(fake.revokedTokens).not.toContain(refresh);
      expect(await counts(u.id)).toEqual({ connection: 1, subscription: 0, channel: 0, event: 0, publication: 0, account: 1 });
      const conn = await connRow(u.id);
      expect(conn!.status).toBe('disconnected');
      expect(conn!.revoke_pending_at).not.toBeNull();
      expect(conn!.revoke_attempts).toBe(1);
      expect((await accountRow(u.id))!.status).toBe('disconnected');
      expect(await statusOf(u)).toMatchObject({ connected: false });

      // The first retry fails again, the next one succeeds.
      fake.injectFailure('oauth.revoke', { status: 503 });
      expect((await lifecycle.retryPendingRevokes()).failed).toBeGreaterThanOrEqual(1);
      expect((await connRow(u.id))!.revoke_attempts).toBe(2);
      expect(fake.revokedTokens).not.toContain(refresh);

      const done = await lifecycle.retryPendingRevokes();
      expect(done.revoked).toBeGreaterThanOrEqual(1);
      expect(fake.revokedTokens).toContain(refresh);
      expect(await counts(u.id)).toEqual({ connection: 0, subscription: 0, channel: 0, event: 0, publication: 0, account: 0 });
      expect(await snapshot(other.id)).toBe(otherBefore);
    });

    it('reconnect_after_failed_revoke: a reconnect clears the retry record and the retry job never revokes the new token', async () => {
      const u = await connectedUser();
      const oldRefresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      fake.injectFailure('oauth.revoke', { status: 503 });
      expect((await del(u)).status).toBe(204);
      expect((await connRow(u.id))!.revoke_pending_at).not.toBeNull();

      const code = `reconnect-after-revoke-${next()}`;
      const done = await connectConsent(u, code, NARROW.join(' '));
      expect(done.connected).toBe(true);

      const conn = await connRow(u.id);
      expect(conn!.status).toBe('active');
      expect(conn!.revoke_pending_at).toBeNull();
      expect(conn!.revoke_attempts).toBe(0);
      expect((await accountRow(u.id))!.status).toBe('connected');

      await lifecycle.retryPendingRevokes();

      expect(fake.revokedTokens).not.toContain(`refresh-${code}`);
      expect(fake.revokedTokens).not.toContain(`access-${code}`);
      expect(fake.revokedTokens).not.toContain(oldRefresh);
      const acc = await accountRow(u.id);
      expect(acc!.status).toBe('connected');
      expect(crypto.decrypt(acc!.encrypted_refresh_token)).toBe(`refresh-${code}`);
    });

    it('the retry job skips and clears a pending record whose account is connected again', async () => {
      const u = await connectedUser();
      const refresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      await q(
        `UPDATE google_calendar_connection SET revoke_pending_at = now(), revoke_attempts = 2 WHERE owner_id = $1`,
        [u.id],
      );

      await lifecycle.retryPendingRevokes();

      expect(fake.revokedTokens).not.toContain(refresh);
      const conn = await connRow(u.id);
      expect(conn!.revoke_pending_at).toBeNull();
      expect(conn!.revoke_attempts).toBe(0);
      expect((await accountRow(u.id))!.status).toBe('connected');
    });

    it('gives up after the maximum attempts, logs without any token and removes the stored token', async () => {
      const u = await connectedUser();
      const refresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      const access = crypto.decrypt((await accountRow(u.id))!.encrypted_access_token)!;
      const logged: string[] = [];
      const spies = (['warn', 'error', 'log'] as const).map((m) =>
        jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => {
          logged.push(String(args[0]));
        }),
      );
      try {
        fake.injectFailure('oauth.revoke', { status: 503, times: MAX_REVOKE_ATTEMPTS });
        await del(u);
        for (let i = 1; i < MAX_REVOKE_ATTEMPTS; i++) await lifecycle.retryPendingRevokes();
      } finally {
        spies.forEach((s) => s.mockRestore());
      }

      // The token is gone; a tombstone connection row remembers that the grant may still be active.
      expect(await counts(u.id)).toEqual({ connection: 1, subscription: 0, channel: 0, event: 0, publication: 0, account: 0 });
      const tomb = await connRow(u.id);
      expect(tomb!.status).toBe('disconnected');
      expect(tomb!.revoke_pending_at).toBeNull();
      expect(tomb!.revoke_attempts).toBeGreaterThanOrEqual(MAX_REVOKE_ATTEMPTS);
      expect(await statusOf(u)).toMatchObject({ connected: false, revokeFailed: true });
      expect(logged.some((l) => l.includes('Giving up revoking'))).toBe(true);
      for (const line of logged) {
        expect(line).not.toContain(refresh);
        expect(line).not.toContain(access);
      }
    });

    it('retry_race: a reconnect that lands between the status check and the purge keeps the fresh token and clears the retry record', async () => {
      const u = await connectedUser();
      const oldRefresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      fake.injectFailure('oauth.revoke', { status: 503 });
      expect((await del(u)).status).toBe(204);
      expect((await connRow(u.id))!.revoke_pending_at).not.toBeNull();

      // The revoke of the retry is in flight when the user reconnects (after the status check, before the purge).
      revokeHook = async (token) => {
        if (token !== oldRefresh) return;
        revokeHook = undefined;
        await accounts.save(u.id, 'google_calendar', { accessToken: 'fresh-access-token', refreshToken: 'fresh-refresh-token' }, [BROAD]);
      };
      try {
        await lifecycle.retryPendingRevokes();
      } finally {
        revokeHook = undefined;
      }

      const acc = await accountRow(u.id);
      expect(acc!.status).toBe('connected');
      expect(crypto.decrypt(acc!.encrypted_access_token)).toBe('fresh-access-token');
      expect(crypto.decrypt(acc!.encrypted_refresh_token)).toBe('fresh-refresh-token');
      expect(fake.revokedTokens).not.toContain('fresh-refresh-token');
      const conn = await connRow(u.id);
      expect(conn).toBeDefined();
      expect(conn!.revoke_pending_at).toBeNull();
      expect(conn!.revoke_attempts).toBe(0);
    });

    it('not_configured_revoke: does not count as an attempt, keeps the token and resumes once configured again', async () => {
      const u = await connectedUser();
      const refresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      const access = crypto.decrypt((await accountRow(u.id))!.encrypted_access_token)!;
      fake.injectFailure('oauth.revoke', { status: 503 });
      expect((await del(u)).status).toBe(204);
      expect((await connRow(u.id))!.revoke_attempts).toBe(1);

      const logged: string[] = [];
      const spies = (['warn', 'error', 'log'] as const).map((m) =>
        jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => {
          logged.push(String(args[0]));
        }),
      );
      revokeNotConfigured = true;
      try {
        for (let i = 0; i < MAX_REVOKE_ATTEMPTS + 2; i++) await lifecycle.retryPendingRevokes();
      } finally {
        revokeNotConfigured = false;
        spies.forEach((s) => s.mockRestore());
      }

      const conn = await connRow(u.id);
      expect(conn!.revoke_pending_at).not.toBeNull();
      expect(conn!.revoke_attempts).toBe(1);
      expect(conn!.status).toBe('disconnected');
      const acc = await accountRow(u.id);
      expect(acc!.status).toBe('disconnected');
      expect(crypto.decrypt(acc!.encrypted_refresh_token)).toBe(refresh);
      expect(await statusOf(u)).not.toMatchObject({ revokeFailed: true });
      expect(logged.some((l) => l.includes('Giving up'))).toBe(false);
      for (const line of logged) {
        expect(line).not.toContain(refresh);
        expect(line).not.toContain(access);
      }

      const done = await lifecycle.retryPendingRevokes();
      expect(done.revoked).toBeGreaterThanOrEqual(1);
      expect(fake.revokedTokens).toContain(refresh);
      expect(await counts(u.id)).toEqual({ connection: 0, subscription: 0, channel: 0, event: 0, publication: 0, account: 0 });
    });

    it('not_configured_revoke: a disconnect while unconfigured leaves the attempt counter at zero and the token for the retry', async () => {
      const u = await connectedUser();
      const refresh = crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)!;
      revokeNotConfigured = true;
      try {
        expect((await del(u)).status).toBe(204);
      } finally {
        revokeNotConfigured = false;
      }
      const conn = await connRow(u.id);
      expect(conn!.revoke_pending_at).not.toBeNull();
      expect(conn!.revoke_attempts).toBe(0);
      expect(crypto.decrypt((await accountRow(u.id))!.encrypted_refresh_token)).toBe(refresh);

      expect((await lifecycle.retryPendingRevokes()).revoked).toBeGreaterThanOrEqual(1);
      expect(fake.revokedTokens).toContain(refresh);
    });

    it('is owner scoped: 404 when nothing is connected and no effect on a user with a pending retry', async () => {
      const stranger = await ds.getRepository(User).save(
        ds.getRepository(User).create({ email: `nobody-${next()}@example.test`, passwordHash: 'x', enabled: true, role: 'user' }),
      );
      const bearer = await jwt.signAsync({ sub: stranger.id, email: stranger.email, role: 'user' }, { expiresIn: '10m', issuer: 'husrevity-nest' });
      const res = await request(server()).delete('/api/integrations/google-calendar').set({ Authorization: `Bearer ${bearer}` });
      expect(res.status).toBe(404);
      expect((await request(server()).delete('/api/integrations/google-calendar')).status).toBe(401);
      expect((await request(server()).get('/api/integrations/google-calendar/disconnect-preview')).status).toBe(401);
    });
  });
});
