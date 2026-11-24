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
import { GoogleCalendarLifecycleService } from '../google-calendar-lifecycle.service';
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
import { finishConsent, newPkce } from '../testing/calendar-consent-flow';
import { fakeGateway, fakeReader } from '../testing/google-calendar-sync-fixtures';

/**
 * Slice 10 over HTTP: the opt-in consent flow of the optional write-back, the
 * status field and the "move to new calendar" endpoint. ONE disposable Postgres container,
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
const APP_CREATED = 'https://www.googleapis.com/auth/calendar.app.created';
const NARROW = [CAL_LIST_RO, EVENTS_RO];
const WRITE = [...NARROW, APP_CREATED];
const WORK = { id: 'work@example.test', summary: 'Work', accessRole: 'writer' as const };
const HOLIDAYS = { id: 'holidays@example.test', summary: 'Holidays', accessRole: 'reader' as const };

describe('google calendar optional write (integration)', () => {
  let h: MigrationHarness;
  let app: INestApplication;
  let ds: DataSource;
  let fake: FakeGoogleGateway;
  let jwt: JwtService;
  let crypto: CryptoService;
  let seq = 0;

  const server = () => app.getHttpServer();
  const next = () => ++seq;
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => ds.query(sql, params);

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    fake = new FakeGoogleGateway();

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
        { provide: GOOGLE_CALENDAR_GATEWAY, useValue: fakeGateway(fake) },
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
  });

  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  beforeEach(() => {
    fake.setCalendars([{ ...WORK }, { ...HOLIDAYS }]);
    fake.calls.length = 0;
  });

  // ---- helpers ---------------------------------------------------------

  interface TestUser {
    id: string;
    bearer: string;
  }

  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.bearer}` });
  const base = '/api/integrations/google-calendar';
  const cookieOf = (res: request.Response): string =>
    (([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '').split(';')[0];

  /** A user whose Google connection is already narrowed to the read-only scopes (the precondition for write). */
  const narrowedUser = async (scopes: string[] = NARROW): Promise<TestUser> => {
    const user = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        email: `write-${next()}@example.test`,
        passwordHash: 'not-a-real-hash',
        enabled: true,
        role: 'user',
      }),
    );
    const bearer = await jwt.signAsync(
      { sub: user.id, email: user.email, role: 'user' },
      { expiresIn: '10m', issuer: 'husrevity-nest' },
    );
    const account = await app
      .get(IntegrationAccountService)
      .save(String(user.id), 'google_calendar', { accessToken: `access-${next()}`, refreshToken: `refresh-${next()}` }, scopes);
    await q(
      `INSERT INTO google_calendar_connection (owner_id, integration_account_id, status, granted_scopes)
       VALUES ($1, $2, 'active', $3::jsonb)`,
      [user.id, account.id, JSON.stringify(scopes)],
    );
    return { id: String(user.id), bearer };
  };

  const startFrom = (url: string) => {
    const parsed = new URL(url);
    return request(server()).get(`${parsed.pathname}${parsed.search}`);
  };
  const callback = (u: TestUser, c: { state: string; cookie: string; verifier: string }, query: Record<string, string>) =>
    finishConsent(server(), { bearer: u.bearer, state: c.state, cookie: c.cookie, verifier: c.verifier, query });
  const putWrite = (u: TestUser, enabled: unknown, challenge: string | undefined = newPkce().challenge) =>
    request(server()).put(`${base}/write`).set(auth(u)).send({ enabled, ...(challenge ? { codeChallenge: challenge } : {}) });
  const statusOf = async (u: TestUser) => (await request(server()).get(`${base}/status`).set(auth(u))).body.data;
  const connRow = async (ownerId: string) =>
    (await q(`SELECT * FROM google_calendar_connection WHERE owner_id = $1`, [ownerId]))[0] as Record<string, any>;
  const accountRow = async (ownerId: string) =>
    (await q(`SELECT * FROM integration_account WHERE owner_id = $1`, [ownerId]))[0] as Record<string, any>;

  /** Requests write, follows the ticket to the Google redirect. */
  const writeToConsent = async (u: TestUser) => {
    const { verifier, challenge } = newPkce();
    const res = await putWrite(u, true, challenge);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ enabled: false });
    const start = await startFrom(res.body.data.consentUrl);
    expect(start.status).toBe(302);
    return {
      verifier,
      authUrl: new URL(start.headers.location),
      state: new URL(start.headers.location).searchParams.get('state')!,
      cookie: cookieOf(start),
    };
  };
  const registerCode = (scope: string[], opts: { refresh?: boolean } = {}) => {
    const code = `write-code-${next()}`;
    fake.registerAuthCode(code, { scope: scope.join(' '), ...(opts.refresh === false ? { refresh_token: undefined } : {}) });
    return code;
  };

  // ---- tests -----------------------------------------------------------

  describe('status', () => {
    it('reports writeEnabled false by default and true after the opt-in', async () => {
      const u = await narrowedUser([...NARROW, APP_CREATED]);
      expect((await statusOf(u)).writeEnabled).toBe(false);

      expect((await putWrite(u, true)).body.data).toEqual({ enabled: true, consentUrl: null });
      expect((await statusOf(u)).writeEnabled).toBe(true);
    });
  });

  describe('opt-in consent', () => {
    it('asks only for the three narrow scopes, without include_granted_scopes, and enables write after a valid grant', async () => {
      const u = await narrowedUser();
      const flow = await writeToConsent(u);
      const { authUrl } = flow;

      expect(authUrl.searchParams.get('scope')!.split(' ').sort()).toEqual([...WRITE].sort());
      expect(authUrl.searchParams.get('scope')).not.toContain(BROAD + ' ');
      expect(authUrl.searchParams.has('include_granted_scopes')).toBe(false);
      expect(authUrl.searchParams.get('access_type')).toBe('offline');
      expect(authUrl.searchParams.get('prompt')).toBe('consent');
      expect((await connRow(u.id)).write_enabled).toBe(false); // nothing flips before the callback

      const done = await callback(u, flow, { code: registerCode(WRITE) });

      expect(done.connected).toBe(true);
      const conn = await connRow(u.id);
      expect(conn.write_enabled).toBe(true);
      expect([...conn.granted_scopes].sort()).toEqual([...WRITE].sort());
      expect([...(await accountRow(u.id)).scopes].sort()).toEqual([...WRITE].sort());
      expect(await statusOf(u)).toMatchObject({ writeEnabled: true, mode: 'narrowed' });
    });

    it.each([
      ['the full calendar scope comes back too', [...WRITE, BROAD], true],
      ['an unrelated restricted scope comes back', [...WRITE, 'https://www.googleapis.com/auth/gmail.readonly'], true],
      ['the user unchecked the write permission', NARROW, true],
      ['Google sends no refresh token', WRITE, false],
    ])('stores nothing and keeps write off when %s', async (_name, scopes, refresh) => {
      const u = await narrowedUser();
      const beforeAccount = await accountRow(u.id);
      const flow = await writeToConsent(u);
      const code = registerCode(scopes as string[], { refresh: refresh as boolean });

      const done = await callback(u, flow, { code });

      expect(done.connected).toBe(false);
      const conn = await connRow(u.id);
      expect(conn.write_enabled).toBe(false);
      expect(conn.status).toBe('active');
      expect([...conn.granted_scopes].sort()).toEqual([...NARROW].sort());
      const afterAccount = await accountRow(u.id);
      expect(afterAccount.encrypted_refresh_token).toBe(beforeAccount.encrypted_refresh_token);
      expect(fake.revokedTokens.length).toBeGreaterThan(0); // what Google just issued is revoked
    });

    it('keeps write off when the user denies consent', async () => {
      const u = await narrowedUser();
      const flow = await writeToConsent(u);

      const done = await callback(u, flow, { error: 'access_denied' });

      expect(done.exchange).toBeNull(); // denied: no handoff code, nothing to exchange
      expect(done.callback.headers.location).toContain('#error=google_denied');
      expect((await connRow(u.id)).write_enabled).toBe(false);
    });

    it('binds the consent to the browser: another cookie cannot complete it', async () => {
      const a = await narrowedUser();
      const b = await narrowedUser();
      const flowA = await writeToConsent(a);
      const flowB = await writeToConsent(b);

      const done = await callback(a, { ...flowA, cookie: flowB.cookie }, { code: registerCode(WRITE) });

      expect(done.connected).toBe(false);
      expect(done.callback.headers.location).toContain('#error=google_failed');
      expect((await connRow(a.id)).write_enabled).toBe(false);
      expect((await connRow(b.id)).write_enabled).toBe(false);
    });

    it('refuses to enable write while the broad permission is still granted, or without a connection', async () => {
      const broad = await narrowedUser([BROAD]);
      expect((await putWrite(broad, true)).status).toBe(409);

      const stranger = await ds.getRepository(User).save(
        ds.getRepository(User).create({ email: `nowrite-${next()}@example.test`, passwordHash: 'x', enabled: true, role: 'user' }),
      );
      const bearer = await jwt.signAsync({ sub: stranger.id, email: stranger.email, role: 'user' }, { expiresIn: '10m', issuer: 'husrevity-nest' });
      expect((await putWrite({ id: String(stranger.id), bearer }, true)).status).toBe(404);
      expect((await request(server()).put(`${base}/write`).send({ enabled: true })).status).toBe(401);
    });

    it('requires a PKCE challenge when the consent is needed, before any ticket is created', async () => {
      const u = await narrowedUser();
      expect((await putWrite(u, true, '')).status).toBe(400);
      expect(await q(`SELECT 1 FROM oauth_flow WHERE user_id = $1`, [u.id])).toHaveLength(0);
    });

    it('rejects a non-boolean body', async () => {
      const u = await narrowedUser();
      expect((await putWrite(u, 'yes')).status).toBe(400);
    });
  });

  describe('turning write off', () => {
    it('stops publishing and queues the removal of every published copy (the job deletes them later)', async () => {
      const u = await narrowedUser(WRITE);
      await putWrite(u, true);
      const itemId = (
        await q<{ id: string }>(
          `INSERT INTO items (owner_id, kind, title, scheduled_at, source) VALUES ($1, 'event', 'Kept', now(), 'web') RETURNING id::text AS id`,
          [u.id],
        )
      )[0].id;
      const publisher = app.get(GoogleCalendarPublishService);
      await publisher.publishItem({ id: itemId, ownerId: u.id, kind: 'event', source: 'web', title: 'Kept', scheduledAt: new Date(), durationMin: 30 });
      const created = fake.createdCalendarIds().at(-1)!;
      expect(fake.storedEvents(created)).toHaveLength(1);

      expect((await putWrite(u, false)).body.data).toEqual({ enabled: false, consentUrl: null });

      expect((await statusOf(u)).writeEnabled).toBe(false);
      expect(await publisher.isHandling(u.id)).toBe(false);
      expect(fake.storedEvents(created)).toHaveLength(1);
      expect(fake.callsTo('events.delete')).toHaveLength(0);
      const queued = await q<{ delete_pending_at: Date | null }>(
        `SELECT delete_pending_at FROM google_calendar_publication WHERE owner_id = $1`,
        [u.id],
      );
      expect(queued).toHaveLength(1);
      expect(queued[0].delete_pending_at).not.toBeNull();

      await publisher.sweepPendingDeletes();

      expect(fake.storedEvents(created)).toHaveLength(0);
      expect(await q(`SELECT 1 FROM google_calendar_publication WHERE owner_id = $1`, [u.id])).toHaveLength(0);
    });
  });

  describe('POST /write/migrate-legacy', () => {
    it('publishes the existing personal events once, on explicit request only', async () => {
      const u = await narrowedUser(WRITE);
      for (const [title, source] of [['One', 'web'], ['Two', 'ios'], ['From Google', 'gcal']]) {
        await q(`INSERT INTO items (owner_id, kind, title, scheduled_at, source) VALUES ($1, 'event', $2, now(), $3)`, [u.id, title, source]);
      }
      await putWrite(u, true);
      // Enabling write alone never copies anything.
      expect(fake.callsTo('events.insert')).toHaveLength(0);

      const first = await request(server()).post(`${base}/write/migrate-legacy`).set(auth(u));
      expect(first.status).toBe(200);
      expect(first.body.data).toEqual({ published: 2, skipped: 0, failed: 0, remaining: 0 });

      const second = await request(server()).post(`${base}/write/migrate-legacy`).set(auth(u));
      expect(second.body.data).toEqual({ published: 0, skipped: 2, failed: 0, remaining: 0 });
      expect(fake.callsTo('events.insert')).toHaveLength(2);
    });

    it('answers 409 while write is off and 401 without a Bearer token', async () => {
      const u = await narrowedUser(WRITE);
      expect((await request(server()).post(`${base}/write/migrate-legacy`).set(auth(u))).status).toBe(409);
      expect((await request(server()).post(`${base}/write/migrate-legacy`)).status).toBe(401);
    });
  });
});
