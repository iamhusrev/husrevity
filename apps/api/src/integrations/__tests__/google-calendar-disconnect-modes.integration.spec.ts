import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { google } from 'googleapis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationError } from 'class-validator';
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
import { ExternalLink } from '../external-link.entity';
import { GoogleCalendarSyncService } from '../google-calendar-sync.service';
import { Item } from '../../item/item.entity';
import { ItemOccurrence } from '../../item/item-occurrence.entity';
import { IntegrationAccount } from '../integration-account.entity';
import { IntegrationAccountService } from '../integration-account.service';
import { FakeGoogleGateway } from '../testing/fake-google-gateway';
import { fakeGateway, fakeReader } from '../testing/google-calendar-sync-fixtures';
import { CALENDAR_BASE, finishConsent, newPkce } from '../testing/calendar-consent-flow';

/**
 * Defects 2a, 3 and 10 over HTTP. A disconnect works in EVERY mode (v2 flag on
 * or off): it stops the channels including the legacy watch channel kept on
 * `integration_account`, revokes the Google grant and removes the stored tokens,
 * and it never deletes the user's existing `items` copies without the explicit
 * `deleteLegacyCopies=true`. After the revoke retries are exhausted a tombstone
 * connection row remembers that the grant may still be active (`revokeFailed`).
 * ONE disposable Postgres container, two real Nest apps (one per flag value) and
 * the scripted fake gateway: no network, no real Google.
 */
jest.setTimeout(300_000);

const JWT_SECRET = 'integration-test-jwt-secret-at-least-32-bytes!!';
const CAL_LIST_RO = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const EVENTS_RO = 'https://www.googleapis.com/auth/calendar.events.readonly';
const BROAD = 'https://www.googleapis.com/auth/calendar';

interface TestApp {
  app: INestApplication;
  lifecycle: GoogleCalendarLifecycleService;
  engine: GoogleCalendarEngineService;
}

describe('google calendar disconnect in every mode (integration)', () => {
  let h: MigrationHarness;
  let ds: DataSource;
  let fake: FakeGoogleGateway;
  let jwt: JwtService;
  let crypto: CryptoService;
  let seq = 0;
  const apps: Record<string, TestApp> = {};

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => ds.query(sql, params);

  const buildApp = async (flag: 'true' | 'false'): Promise<TestApp> => {
    const env = {
      GOOGLE_CALENDAR_CLIENT_ID: 'client-id.example.test',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret-placeholder',
      GOOGLE_CALENDAR_REDIRECT_URI: 'https://api.example.test/api/integrations/google-calendar/callback',
      GOOGLE_CALENDAR_WEBHOOK_URL: 'https://hooks.example.test/hooks/gcal',
      GOOGLE_CALENDAR_V2_ENABLED: flag,
      HUSREVITY_WEB_URL: 'https://app.example.test',
      HUSREVITY_JWT_SECRET: JWT_SECRET,
      HUSREVITY_CRYPTO_KEY: Buffer.from('k'.repeat(32)).toString('base64'),
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
        GoogleCalendarPublishService,
        GoogleCalendarWriteService,
        GoogleCalendarEngineService,
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
            // Real OAuth2 client, but the code exchange goes to the scripted fake: no network.
            cfg.createOAuth2Client = () => {
              const client = new google.auth.OAuth2(
                'client-id.example.test',
                'client-secret-placeholder',
                'https://api.example.test/api/integrations/google-calendar/callback',
              );
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
          useValue: { ensureHusrevityCalendar: jest.fn(), registerWatchChannel: jest.fn() },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
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
    return {
      app,
      lifecycle: moduleRef.get(GoogleCalendarLifecycleService),
      engine: moduleRef.get(GoogleCalendarEngineService),
    };
  };

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    fake = new FakeGoogleGateway();
    apps.on = await buildApp('true');
    apps.off = await buildApp('false');
  });
  afterAll(async () => {
    await apps.on?.app.close();
    await apps.off?.app.close();
    await h?.close();
  });

  interface LegacyOwner {
    id: string;
    bearer: string;
    refresh: string;
    access: string;
    channelId: string;
  }

  /** An owner as the legacy engine leaves them: tokens, a legacy watch channel on the account row, gcal copies. */
  const legacyOwner = async (
    opts: { v2Connection?: boolean; scopes?: string[]; calendarId?: string } = {},
  ): Promise<LegacyOwner> => {
    const n = ++seq;
    const user = await ds.getRepository(User).save(
      ds.getRepository(User).create({ email: `modes-${n}@example.test`, passwordHash: 'x', enabled: true, role: 'user' }),
    );
    const bearer = await jwt.signAsync(
      { sub: user.id, email: user.email, role: 'user' },
      { expiresIn: '10m', issuer: 'husrevity-nest' },
    );
    const id = String(user.id);
    const refresh = `refresh-modes-${n}`;
    const access = `access-modes-${n}`;
    const accounts = apps.on.app.get(IntegrationAccountService);
    const account = await accounts.save(id, 'google_calendar', { accessToken: access, refreshToken: refresh }, opts.scopes ?? [BROAD]);
    if (opts.calendarId) await accounts.updateCalendarId(id, 'google_calendar', opts.calendarId);
    const channelId = `husrevity-gcal-${id}-${n}`;
    await accounts.updateWatchChannel(id, 'google_calendar', channelId, `resource-legacy-${n}`, new Date(Date.now() + 86_400_000), 'tok');
    fake.activeChannels.set(channelId, { resourceId: `resource-legacy-${n}`, calendarId: 'husrevity-cal' });
    if (opts.v2Connection) {
      await q(
        `INSERT INTO google_calendar_connection (owner_id, integration_account_id, status, granted_scopes)
         VALUES ($1, $2, 'active', $3::jsonb)`,
        [id, account.id, JSON.stringify([CAL_LIST_RO, EVENTS_RO])],
      );
    }
    return { id, bearer, refresh, access, channelId };
  };

  /** An owner whose purge is allowed: on the v2 engine (flag on) or paused with a narrowed grant (flag off). */
  const purgeableOwner = (key: string): Promise<LegacyOwner> =>
    key === 'on' ? legacyOwner({ v2Connection: true }) : legacyOwner({ scopes: [CAL_LIST_RO, EVENTS_RO] });

  const addItem = async (ownerId: string, source: string) =>
    (
      await q<{ id: string }>(
        `INSERT INTO items (owner_id, kind, title, scheduled_at, source) VALUES ($1, 'event', $2, now(), $3) RETURNING id`,
        [ownerId, `${source}-${++seq}`, source],
      )
    )[0].id;
  const itemRows = (ownerId: string) => q(`SELECT id, source, deleted_at FROM items WHERE owner_id = $1 ORDER BY id`, [ownerId]);
  const accountRow = async (ownerId: string) =>
    (await q(`SELECT * FROM integration_account WHERE owner_id = $1`, [ownerId]))[0] as Record<string, any> | undefined;
  const connRow = async (ownerId: string) =>
    (await q(`SELECT * FROM google_calendar_connection WHERE owner_id = $1`, [ownerId]))[0] as Record<string, any> | undefined;
  const auth = (o: LegacyOwner) => ({ Authorization: `Bearer ${o.bearer}` });
  const del = (mode: TestApp, o: LegacyOwner, query = '') =>
    request(mode.app.getHttpServer()).delete(`/api/integrations/google-calendar${query}`).set(auth(o));
  const statusOf = async (mode: TestApp, o: LegacyOwner) =>
    (await request(mode.app.getHttpServer()).get('/api/integrations/google-calendar/status').set(auth(o))).body.data;

  beforeEach(() => {
    fake.calls.length = 0;
  });

  describe.each([
    ['flag on', 'on'],
    ['flag off', 'off'],
  ])('disconnect with the v2 %s', (_label, key) => {
    const mode = () => apps[key];

    it('stops the legacy watch channel, revokes the grant, removes the tokens and keeps the existing event copies', async () => {
      const o = await legacyOwner();
      await addItem(o.id, 'gcal');
      await addItem(o.id, 'gcal');
      await addItem(o.id, 'web');
      const before = await itemRows(o.id);

      const res = await del(mode(), o);

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(fake.callsTo('channels.stop').map((c) => JSON.stringify(c.args))).toEqual(
        expect.arrayContaining([expect.stringContaining(o.channelId)]),
      );
      expect(fake.activeChannels.has(o.channelId)).toBe(false);
      expect(fake.revokedTokens).toContain(o.refresh);
      expect(await accountRow(o.id)).toBeUndefined();
      expect(await itemRows(o.id)).toEqual(before);
      expect(await statusOf(mode(), o)).toMatchObject({ connected: false });
    });

    it('deletes only the legacy gcal copies and only with deleteLegacyCopies=true', async () => {
      const o = await legacyOwner();
      await addItem(o.id, 'gcal');
      await addItem(o.id, 'web');
      await addItem(o.id, 'ios');

      expect((await del(mode(), o, '?deleteLegacyCopies=true')).status).toBe(204);

      const rows = (await itemRows(o.id)) as { source: string }[];
      expect(rows.map((r) => r.source).sort()).toEqual(['ios', 'web']);
      expect(await accountRow(o.id)).toBeUndefined();
    });

    it('keeps the encrypted token only for the revoke retry: channel stopped, items untouched, then everything gone', async () => {
      const o = await legacyOwner();
      await addItem(o.id, 'gcal');
      const before = await itemRows(o.id);
      fake.injectFailure('oauth.revoke', { status: 503 });

      expect((await del(mode(), o)).status).toBe(204);

      expect(fake.activeChannels.has(o.channelId)).toBe(false);
      const pending = (await accountRow(o.id))!;
      expect(pending.status).toBe('disconnected');
      expect(pending.channel_id).toBeNull();
      expect(pending.resource_id).toBeNull();
      expect(crypto.decrypt(pending.encrypted_refresh_token)).toBe(o.refresh);
      expect((await connRow(o.id))!.revoke_pending_at).not.toBeNull();
      expect(await itemRows(o.id)).toEqual(before);

      await mode().lifecycle.retryPendingRevokes();

      expect(fake.revokedTokens).toContain(o.refresh);
      expect(await accountRow(o.id)).toBeUndefined();
      expect(await connRow(o.id)).toBeUndefined();
      expect(await itemRows(o.id)).toEqual(before);
    });

    it('abandoned revokes leave a tombstone: tokens removed, revokeFailed reported, never an active connection', async () => {
      const o = await legacyOwner();
      const before = await itemRows(o.id);
      fake.injectFailure('oauth.revoke', { status: 503, times: MAX_REVOKE_ATTEMPTS });

      await del(mode(), o);
      for (let i = 1; i < MAX_REVOKE_ATTEMPTS; i++) await mode().lifecycle.retryPendingRevokes();

      expect(await accountRow(o.id)).toBeUndefined();
      const tomb = (await connRow(o.id))!;
      expect(tomb.status).toBe('disconnected');
      expect(tomb.revoke_pending_at).toBeNull();
      expect(tomb.revoke_attempts).toBeGreaterThanOrEqual(MAX_REVOKE_ATTEMPTS);
      expect(await itemRows(o.id)).toEqual(before);
      const status = await statusOf(mode(), o);
      expect(status).toMatchObject({ connected: false, revokeFailed: true });
      expect(await mode().engine.ownerUsesV2Engine(o.id)).toBe(false);
      // The tombstone is not the retry record: nothing is retried again.
      fake.calls.length = 0;
      await mode().lifecycle.retryPendingRevokes();
      expect(fake.callsTo('oauth.revoke')).toHaveLength(0);
    });

    it('a reconnect clears the tombstone so the notice goes away', async () => {
      const o = await legacyOwner();
      fake.injectFailure('oauth.revoke', { status: 503, times: MAX_REVOKE_ATTEMPTS });
      await del(mode(), o);
      for (let i = 1; i < MAX_REVOKE_ATTEMPTS; i++) await mode().lifecycle.retryPendingRevokes();
      expect(await statusOf(mode(), o)).toMatchObject({ revokeFailed: true });

      await apps.on.app
        .get(IntegrationAccountService)
        .save(o.id, 'google_calendar', { accessToken: 'new-access', refreshToken: 'new-refresh' }, [CAL_LIST_RO, EVENTS_RO]);
      await mode().lifecycle.markReconnected(o.id, [CAL_LIST_RO, EVENTS_RO]);

      expect(await statusOf(mode(), o)).toMatchObject({ connected: true, revokeFailed: false });
      expect((await connRow(o.id))!.revoke_attempts).toBe(0);
    });

    it('a real reconnect over a revoke-failed tombstone is not wedged: fresh token kept, notice cleared, right engine, disconnect works again', async () => {
      const o = await legacyOwner();
      fake.injectFailure('oauth.revoke', { status: 503, times: MAX_REVOKE_ATTEMPTS });
      await del(mode(), o);
      for (let i = 1; i < MAX_REVOKE_ATTEMPTS; i++) await mode().lifecycle.retryPendingRevokes();
      expect((await connRow(o.id))!.status).toBe('disconnected');
      expect(await statusOf(mode(), o)).toMatchObject({ connected: false, revokeFailed: true });

      // The regular connect, driven exactly like the browser: connect-url, start, Google, callback, exchange.
      const server = mode().app.getHttpServer();
      const { verifier, challenge } = newPkce();
      const begin = await request(server).get(`${CALENDAR_BASE}/connect-url`).query({ codeChallenge: challenge }).set(auth(o));
      expect(begin.status).toBe(200);
      const startUrl = new URL(begin.body.data.url);
      const start = await request(server).get(`${startUrl.pathname}${startUrl.search}`);
      const authUrl = new URL(start.headers.location);
      const cookie = (([] as string[]).concat(start.headers['set-cookie'] ?? [])[0] ?? '').split(';')[0];
      const code = `tomb-reconnect-${++seq}`;
      fake.registerAuthCode(code, {
        scope: key === 'on' ? [CAL_LIST_RO, EVENTS_RO].join(' ') : BROAD,
      });
      const done = await finishConsent(server, {
        bearer: o.bearer,
        state: authUrl.searchParams.get('state')!,
        cookie,
        verifier,
        query: { code },
      });
      expect(done.connected).toBe(true);

      // The retry job must neither revoke nor purge the fresh token.
      fake.calls.length = 0;
      await mode().lifecycle.retryPendingRevokes();
      expect(fake.callsTo('oauth.revoke')).toHaveLength(0);
      expect(fake.revokedTokens).not.toContain(`refresh-${code}`);
      expect(fake.revokedTokens).not.toContain(`access-${code}`);
      const acc = (await accountRow(o.id))!;
      expect(acc.status).toBe('connected');
      expect(crypto.decrypt(acc.encrypted_refresh_token)).toBe(`refresh-${code}`);

      expect(await statusOf(mode(), o)).toMatchObject({ connected: true, revokeFailed: false });
      const conn = (await connRow(o.id))!;
      expect(conn.revoke_pending_at).toBeNull();
      // v2 on: the owner is now on the v2 engine. v2 off: the legacy engine owns the account.
      if (key === 'on') {
        expect(conn.status).toBe('active');
        expect(await mode().engine.ownerUsesV2Engine(o.id)).toBe(true);
      } else {
        expect(await mode().engine.ownerUsesV2Engine(o.id)).toBe(false);
      }

      // Not wedged: a new disconnect works and revokes the fresh token.
      expect((await del(mode(), o)).status).toBe(204);
      expect(fake.revokedTokens).toContain(`refresh-${code}`);
      expect(await accountRow(o.id)).toBeUndefined();
    });

    it('reports revokeFailed false for a connected owner and for one who never had a failed revoke', async () => {
      const o = await legacyOwner();
      expect(await statusOf(mode(), o)).toMatchObject({ connected: true, revokeFailed: false });
      await del(mode(), o);
      expect(await statusOf(mode(), o)).toMatchObject({ connected: false, revokeFailed: false });
    });

    it('answers 404 when nothing is connected', async () => {
      const o = await legacyOwner();
      await del(mode(), o);
      expect((await del(mode(), o)).status).toBe(404);
    });
  });

  // -------------------------------------------------------------------
  // Final defect round: legacy copy purge, legacy reconnect, flag-off rollback, fresh v2 connect
  // -------------------------------------------------------------------

  const linkItem = async (itemId: string, externalId: string) =>
    q(`INSERT INTO external_link (item_id, provider, external_id) VALUES ($1, 'google_calendar', $2)`, [itemId, externalId]);
  const linkCount = async (itemId: string) =>
    (await q<{ c: number }>(`SELECT count(*)::int AS c FROM external_link WHERE item_id = $1`, [itemId]))[0].c;
  const purge = (mode: TestApp, o: LegacyOwner | null, body?: unknown) => {
    const req = request(mode.app.getHttpServer()).post(`${CALENDAR_BASE}/legacy-copies/purge`);
    return (o ? req.set(auth(o)) : req).send(body as object);
  };
  const preview = (mode: TestApp, o: LegacyOwner) =>
    request(mode.app.getHttpServer()).get(`${CALENDAR_BASE}/legacy-copies`).set(auth(o));

  describe.each([
    ['flag on', 'on'],
    ['flag off', 'off'],
  ])('legacy copy purge with the v2 %s', (_label, key) => {
    const mode = () => apps[key];

    it('hard-deletes only the caller gcal copies and their links; other owners, other sources and non-gcal links stay', async () => {
      const o = await purgeableOwner(key);
      const other = await purgeableOwner(key);
      const g1 = await addItem(o.id, 'gcal');
      const g2 = await addItem(o.id, 'gcal');
      const web = await addItem(o.id, 'web');
      const ios = await addItem(o.id, 'ios');
      const otherGcal = await addItem(other.id, 'gcal');
      for (const [item, ext] of [[g1, 'e1'], [g2, 'e2'], [web, 'e3'], [otherGcal, 'e4']] as const) await linkItem(item, ext);

      const res = await purge(mode(), o, { confirm: true });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: 2 });
      expect(((await itemRows(o.id)) as { source: string }[]).map((r) => r.source).sort()).toEqual(['ios', 'web']);
      expect(await q(`SELECT 1 FROM items WHERE id = ANY($1::bigint[])`, [[g1, g2]])).toHaveLength(0);
      expect(await linkCount(g1)).toBe(0);
      expect(await linkCount(g2)).toBe(0);
      // Husrevity-origin links, other owners and their links are untouched.
      expect(await linkCount(web)).toBe(1);
      expect(await linkCount(otherGcal)).toBe(1);
      expect(await itemRows(other.id)).toHaveLength(1);
      expect(ios).toBeDefined();
      // The purge is not a disconnect: the account stays.
      expect(await accountRow(o.id)).toBeDefined();
    });

    it('also removes already soft-deleted gcal copies (hard delete)', async () => {
      const o = await purgeableOwner(key);
      const g = await addItem(o.id, 'gcal');
      await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [g]);
      const res = await purge(mode(), o, { confirm: true });
      expect(res.body.data).toEqual({ deleted: 1 });
      expect(await q(`SELECT 1 FROM items WHERE id = $1`, [g])).toHaveLength(0);
    });

    it.each([
      ['no body', undefined],
      ['empty body', {}],
      ['confirm false', { confirm: false }],
      ['confirm as a string', { confirm: 'true' }],
    ])('answers 400 and deletes nothing with %s', async (_name, body) => {
      const o = await purgeableOwner(key);
      const g = await addItem(o.id, 'gcal');
      await linkItem(g, 'ex-1');

      const res = await purge(mode(), o, body);

      expect(res.status).toBe(400);
      expect(await itemRows(o.id)).toHaveLength(1);
      expect(await linkCount(g)).toBe(1);
    });

    it('answers 401 without a Bearer token and deletes nothing', async () => {
      const o = await purgeableOwner(key);
      await addItem(o.id, 'gcal');
      const res = await purge(mode(), null, { confirm: true });
      expect(res.status).toBe(401);
      expect(await itemRows(o.id)).toHaveLength(1);
    });

    it('works after a disconnect that kept the copies (no integration account needed)', async () => {
      const o = await purgeableOwner(key);
      await addItem(o.id, 'gcal');
      await addItem(o.id, 'web');
      expect((await del(mode(), o)).status).toBe(204);
      expect(await itemRows(o.id)).toHaveLength(2);
      expect(await accountRow(o.id)).toBeUndefined();

      expect((await preview(mode(), o)).body.data).toEqual({ legacyCopyCount: 1 });
      const res = await purge(mode(), o, { confirm: true });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: 1 });
      expect(((await itemRows(o.id)) as { source: string }[]).map((r) => r.source)).toEqual(['web']);
    });

    it('preview reports the caller count only, works in every mode and is read-only', async () => {
      const o = await purgeableOwner(key);
      const other = await purgeableOwner(key);
      await addItem(o.id, 'gcal');
      await addItem(o.id, 'gcal');
      await addItem(o.id, 'web');
      await addItem(other.id, 'gcal');

      const res = await preview(mode(), o);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ legacyCopyCount: 2 });
      expect(await itemRows(o.id)).toHaveLength(3);
    });

    it('a plain disconnect never deletes the copies, with or without the deleteLegacyCopies=false query', async () => {
      const o = await purgeableOwner(key);
      const g = await addItem(o.id, 'gcal');
      await linkItem(g, 'keep-1');
      expect((await del(mode(), o, '?deleteLegacyCopies=false')).status).toBe(204);
      expect(await itemRows(o.id)).toHaveLength(1);
      expect(await linkCount(g)).toBe(1);
    });
  });

  describe('purge while the legacy engine is active', () => {
    const withCursor = (o: LegacyOwner) =>
      q(`UPDATE integration_account SET sync_token = 'st-keep', last_sync_at = now() WHERE owner_id = $1`, [o.id]);

    it.each([
      ['flag on', 'on'],
      ['flag off', 'off'],
    ])('answers 409 and deletes nothing for a connected legacy owner (%s)', async (_label, key) => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      const g = await addItem(o.id, 'gcal');
      await linkItem(g, 'keep-ev');

      const res = await purge(apps[key], o, { confirm: true });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(await itemRows(o.id)).toHaveLength(1);
      expect(await linkCount(g)).toBe(1);
      const acc = (await accountRow(o.id))!;
      expect(acc.status).toBe('connected');
      expect(acc.sync_token).toBe('st-keep');
      expect(acc.last_sync_at).not.toBeNull();
      expect((await preview(apps[key], o)).body.data).toEqual({ legacyCopyCount: 1 });
    });

    it('is allowed after a disconnect and clears the retained cursor', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      await addItem(o.id, 'gcal');
      expect((await purge(apps.on, o, { confirm: true })).status).toBe(409);
      expect((await del(apps.on, o)).status).toBe(204);

      const res = await purge(apps.on, o, { confirm: true });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: 1 });
      expect((await accountRow(o.id))!.sync_token).toBeNull();
    });

    it('is allowed for an owner on the v2 engine (flag on, live connection)', async () => {
      const o = await legacyOwner({ v2Connection: true });
      await addItem(o.id, 'gcal');
      const res = await purge(apps.on, o, { confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: 1 });
    });

    it('is allowed for a paused narrowed owner (flag off, narrowed grant)', async () => {
      const o = await legacyOwner({ scopes: [CAL_LIST_RO, EVENTS_RO] });
      await addItem(o.id, 'gcal');
      expect(await apps.off.engine.legacyEngineAllowed(o.id)).toBe(false);
      const res = await purge(apps.off, o, { confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: 1 });
    });

    it('a disconnect with deleteLegacyCopies=true still deletes the copies of a connected legacy owner', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      const g = await addItem(o.id, 'gcal');
      await linkItem(g, 'gone-ev');
      expect((await del(apps.off, o, '?deleteLegacyCopies=true')).status).toBe(204);
      expect(await itemRows(o.id)).toHaveLength(0);
      expect(await linkCount(g)).toBe(0);
      expect((await accountRow(o.id))!.sync_token).toBeNull();
    });
  });

  describe('effective mode and the calendar picker for a legacy user with the flag on', () => {
    it('reports mode legacy without a connection row, v2_read once the connection is live', async () => {
      const legacy = await legacyOwner();
      const live = await legacyOwner({ v2Connection: true });
      expect(await statusOf(apps.on, legacy)).toMatchObject({ connected: true, v2Enabled: true, mode: 'legacy', paused: false });
      await q(`UPDATE google_calendar_connection SET granted_scopes = $2::jsonb WHERE owner_id = $1`, [live.id, JSON.stringify([BROAD])]);
      expect(await statusOf(apps.on, live)).toMatchObject({ v2Enabled: true, mode: 'v2_read' });
      await q(`UPDATE google_calendar_connection SET status = 'needs_reconnect' WHERE owner_id = $1`, [live.id]);
      expect(await statusOf(apps.on, live)).toMatchObject({ mode: 'v2_read', needsReconnect: true });
    });

    it('lets the legacy user list calendars and pick one, which creates the connection row and moves them to v2', async () => {
      fake.setCalendars([
        { id: 'cal-primary', summary: 'Primary', accessRole: 'owner', primary: true },
        { id: 'cal-work', summary: 'Work', accessRole: 'writer' },
      ]);
      const o = await legacyOwner();
      expect(await connRow(o.id)).toBeUndefined();
      const server = apps.on.app.getHttpServer();

      const list = await request(server).get(`${CALENDAR_BASE}/calendars`).set(auth(o));
      expect(list.status).toBe(200);
      expect(list.body.data.map((c: { id: string }) => c.id)).toEqual(['cal-primary', 'cal-work']);

      const put = await request(server).put(`${CALENDAR_BASE}/calendars/selection`).set(auth(o)).send({ selected: ['cal-work'] });
      expect(put.status).toBe(200);
      expect((await connRow(o.id))!.status).toBe('active');
      expect(await statusOf(apps.on, o)).toMatchObject({ mode: 'v2_read', selectedCount: 1 });
    });
  });

  describe('legacy disconnect then reconnect keeps the legacy calendar (no second calendar, links keep working)', () => {
    const mode = () => apps.off;
    const itemShape = (ownerId: string) => ({ id: '4242', ownerId, kind: 'event', source: 'web', title: 'Planning' });

    it('retains only a tokenless disconnected row with the calendar id; a reconnect reuses it', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await ds.query(`UPDATE integration_account SET sync_token = 'st-1', last_sync_at = now() WHERE owner_id = $1`, [o.id]);
      const accounts = mode().app.get(IntegrationAccountService);
      const beforeId = (await accountRow(o.id))!.id;

      expect((await del(mode(), o)).status).toBe(204);

      const kept = (await accountRow(o.id))!;
      expect(kept.id).toBe(beforeId);
      expect(kept.status).toBe('disconnected');
      expect(kept.encrypted_access_token).toBe('');
      expect(kept.encrypted_refresh_token).toBeNull();
      expect(kept.scopes).toEqual([]);
      expect(kept.calendar_id).toBe('legacy-cal-1');
      // The sync token is a cursor, not a credential: it stays so a reconnect does not turn into a full pull.
      expect(kept.sync_token).toBe('st-1');
      expect(kept.last_sync_at).not.toBeNull();
      expect(kept.channel_id).toBeNull();
      expect(fake.revokedTokens).toContain(o.refresh);
      // Every reader sees "not connected".
      expect(await accounts.get(o.id, 'google_calendar')).toBeNull();
      expect(await statusOf(mode(), o)).toMatchObject({ connected: false });
      expect(await mode().engine.legacyEngineAllowed(o.id)).toBe(true);
      // A second disconnect finds nothing to disconnect (and never tries to decrypt the empty token).
      expect((await del(mode(), o)).status).toBe(404);
      await mode().lifecycle.retryPendingRevokes();

      const again = await accounts.save(o.id, 'google_calendar', { accessToken: 'a-2', refreshToken: 'r-2' }, [BROAD]);
      expect(again.id).toBe(beforeId);
      expect(await q(`SELECT 1 FROM integration_account WHERE owner_id = $1`, [o.id])).toHaveLength(1);
      const reread = (await accounts.get(o.id, 'google_calendar'))!;
      expect(reread.account.calendarId).toBe('legacy-cal-1');
      expect(reread.refreshToken).toBe('r-2');
    });

    it('disconnect then reconnect: the item update goes to the SAME calendar and event, with no calendars.insert; a 404 inserts into the same calendar and updates the same link', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      const accounts = mode().app.get(IntegrationAccountService);
      await del(mode(), o);
      await accounts.save(o.id, 'google_calendar', { accessToken: 'a-2', refreshToken: 'r-2' }, [BROAD]);

      const calendar = {
        calendars: { insert: jest.fn() },
        channels: { stop: jest.fn() },
        events: {
          get: jest.fn().mockResolvedValue({ data: { etag: '"e"' } }),
          insert: jest.fn().mockResolvedValue({ data: { id: 'new-event', etag: '"n"' } }),
          update: jest.fn().mockResolvedValue({ data: { etag: '"u"' } }),
          watch: jest.fn(),
        },
      };
      const spy = jest.spyOn(google, 'calendar').mockReturnValue(calendar as never);
      const link = { itemId: '4242', provider: 'google_calendar', externalId: 'old-event', etag: '"e"' } as unknown as ExternalLink;
      const repo = {
        findOne: jest.fn().mockResolvedValue(link),
        create: jest.fn((v: unknown) => v),
        save: jest.fn((v: unknown) => Promise.resolve(v)),
      };
      const svc = new GoogleCalendarService(
        mode().app.get(GoogleCalendarConfig),
        accounts,
        repo as never,
        { syncIncremental: jest.fn() } as never,
        mode().engine,
      );
      try {
        await svc.syncItemToGoogleCalendar(itemShape(o.id));
        expect(calendar.events.update).toHaveBeenCalledWith(
          expect.objectContaining({ calendarId: 'legacy-cal-1', eventId: 'old-event' }),
        );
        expect(calendar.calendars.insert).not.toHaveBeenCalled();
        expect(calendar.events.insert).not.toHaveBeenCalled();

        calendar.events.update.mockRejectedValueOnce({ code: 404 });
        await svc.syncItemToGoogleCalendar(itemShape(o.id));
        expect(calendar.events.insert).toHaveBeenCalledTimes(1);
        expect(calendar.events.insert).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'legacy-cal-1' }));
        expect(calendar.calendars.insert).not.toHaveBeenCalled();
        expect(link.externalId).toBe('new-event');
        expect(repo.create).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('a failed revoke keeps the token for the retry, a reconnect keeps the calendar id and the retry never touches the fresh token', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-2' });
      const accounts = mode().app.get(IntegrationAccountService);
      fake.injectFailure('oauth.revoke', { status: 503 });
      await del(mode(), o);
      const pending = (await accountRow(o.id))!;
      expect(crypto.decrypt(pending.encrypted_refresh_token)).toBe(o.refresh);
      expect(pending.calendar_id).toBe('legacy-cal-2');

      await accounts.save(o.id, 'google_calendar', { accessToken: 'fresh-a', refreshToken: 'fresh-r' }, [BROAD]);
      fake.calls.length = 0;
      await mode().lifecycle.retryPendingRevokes();

      expect(fake.callsTo('oauth.revoke')).toHaveLength(0);
      const acc = (await accounts.get(o.id, 'google_calendar'))!;
      expect(acc.account.calendarId).toBe('legacy-cal-2');
      expect(acc.refreshToken).toBe('fresh-r');
    });

    it('a retried revoke that finally succeeds leaves the tokenless row (calendar id kept), and the abandoned path does too', async () => {
      const ok = await legacyOwner({ calendarId: 'legacy-cal-3' });
      fake.injectFailure('oauth.revoke', { status: 503 });
      await del(mode(), ok);
      await mode().lifecycle.retryPendingRevokes();
      const kept = (await accountRow(ok.id))!;
      expect(kept.status).toBe('disconnected');
      expect(kept.encrypted_access_token).toBe('');
      expect(kept.encrypted_refresh_token).toBeNull();
      expect(kept.calendar_id).toBe('legacy-cal-3');
      expect(await connRow(ok.id)).toBeUndefined();

      const gaveUp = await legacyOwner({ calendarId: 'legacy-cal-4' });
      fake.injectFailure('oauth.revoke', { status: 503, times: MAX_REVOKE_ATTEMPTS });
      await del(mode(), gaveUp);
      for (let i = 1; i < MAX_REVOKE_ATTEMPTS; i++) await mode().lifecycle.retryPendingRevokes();
      const tomb = (await accountRow(gaveUp.id))!;
      expect(tomb.encrypted_access_token).toBe('');
      expect(tomb.calendar_id).toBe('legacy-cal-4');
      expect((await connRow(gaveUp.id))!.revoke_attempts).toBeGreaterThanOrEqual(MAX_REVOKE_ATTEMPTS);
      expect(await statusOf(mode(), gaveUp)).toMatchObject({ connected: false, revokeFailed: true });
    });
  });

  describe('flag-off rollback and the legacy engine helper', () => {
    it('flag off: a narrowed grant is paused (no legacy call), a broad grant resumes; status reports it', async () => {
      const narrow = await legacyOwner({ scopes: [CAL_LIST_RO, EVENTS_RO] });
      const broad = await legacyOwner({ v2Connection: true });
      const engine = apps.off.engine;

      expect(await engine.ownerUsesV2Engine(narrow.id)).toBe(false);
      expect(await engine.legacyEngineAllowed(narrow.id)).toBe(false);
      expect(await statusOf(apps.off, narrow)).toMatchObject({ connected: true, v2Enabled: false, mode: 'legacy', paused: true });
      // Even with a leftover live v2 row the flag-off rollback hands the owner back to the legacy engine.
      expect(await engine.ownerUsesV2Engine(broad.id)).toBe(false);
      expect(await engine.legacyEngineAllowed(broad.id)).toBe(true);
      expect(await statusOf(apps.off, broad)).toMatchObject({ paused: false });
    });

    it('flag on: a live v2 connection blocks the legacy engine, a legacy owner without one keeps it, never paused', async () => {
      const live = await legacyOwner({ v2Connection: true });
      const legacy = await legacyOwner();
      const engine = apps.on.engine;

      expect(await engine.ownerUsesV2Engine(live.id)).toBe(true);
      expect(await engine.legacyEngineAllowed(live.id)).toBe(false);
      expect(await engine.legacyEngineAllowed(legacy.id)).toBe(true);
      expect(await statusOf(apps.on, live)).toMatchObject({ paused: false });
      expect(await statusOf(apps.on, legacy)).toMatchObject({ paused: false });
    });
  });

  describe('a fresh v2 connect (flag on)', () => {
    it('upserts an active connection row, puts the owner on the v2 engine and makes no legacy Google call before calendars are picked', async () => {
      const n = ++seq;
      const user = await ds.getRepository(User).save(
        ds.getRepository(User).create({ email: `fresh-${n}@example.test`, passwordHash: 'x', enabled: true, role: 'user' }),
      );
      const id = String(user.id);
      const bearer = await jwt.signAsync({ sub: user.id, email: user.email, role: 'user' }, { expiresIn: '10m', issuer: 'husrevity-nest' });
      const o = { id, bearer } as LegacyOwner;
      const legacySvc = apps.on.app.get(GoogleCalendarService) as unknown as {
        ensureHusrevityCalendar: jest.Mock;
        registerWatchChannel: jest.Mock;
      };
      legacySvc.ensureHusrevityCalendar.mockClear();
      legacySvc.registerWatchChannel.mockClear();
      expect(await connRow(id)).toBeUndefined();

      const server = apps.on.app.getHttpServer();
      const { verifier, challenge } = newPkce();
      const begin = await request(server).get(`${CALENDAR_BASE}/connect-url`).query({ codeChallenge: challenge }).set(auth(o));
      const startUrl = new URL(begin.body.data.url);
      const start = await request(server).get(`${startUrl.pathname}${startUrl.search}`);
      const authUrl = new URL(start.headers.location);
      const cookie = (([] as string[]).concat(start.headers['set-cookie'] ?? [])[0] ?? '').split(';')[0];
      const code = `fresh-v2-${n}`;
      fake.registerAuthCode(code, { scope: [CAL_LIST_RO, EVENTS_RO].join(' ') });
      fake.calls.length = 0;

      const done = await finishConsent(server, {
        bearer,
        state: authUrl.searchParams.get('state')!,
        cookie,
        verifier,
        query: { code },
      });

      expect(done.connected).toBe(true);
      const conn = (await connRow(id))!;
      const acc = (await accountRow(id))!;
      expect(conn.status).toBe('active');
      expect(String(conn.integration_account_id)).toBe(String(acc.id));
      expect(conn.granted_scopes).toEqual([CAL_LIST_RO, EVENTS_RO]);
      expect(conn.revoke_pending_at).toBeNull();
      expect(await apps.on.engine.ownerUsesV2Engine(id)).toBe(true);
      expect(await apps.on.engine.legacyEngineAllowed(id)).toBe(false);
      expect(fake.callsTo('calendars.insert')).toHaveLength(0);
      expect(fake.callsTo('events.watch')).toHaveLength(0);
      expect(fake.callsTo('events.list')).toHaveLength(0);
      expect(fake.calls.filter((c) => c.method !== 'oauth.exchangeCode')).toHaveLength(0);
      expect(legacySvc.ensureHusrevityCalendar).not.toHaveBeenCalled();
      expect(legacySvc.registerWatchChannel).not.toHaveBeenCalled();
      expect(await statusOf(apps.on, o)).toMatchObject({ connected: true, v2Enabled: true, mode: 'narrowed', paused: false });
    });
  });

  // -------------------------------------------------------------------
  // Legacy sync cursor, local edits/deletes and the exact copy count
  // -------------------------------------------------------------------

  describe('legacy cursor survives a disconnect; pulls respect local edits and deletes; preview equals purge', () => {
    let repoDs: DataSource;
    beforeAll(async () => {
      repoDs = new DataSource({
        type: 'postgres',
        url: h.container.getConnectionUri(),
        entities: [Item, ItemOccurrence, ExternalLink],
        synchronize: false,
      });
      await repoDs.initialize();
    });
    afterAll(async () => {
      if (repoDs?.isInitialized) await repoDs.destroy();
    });

    const OLD = '2020-01-01T00:00:00.000Z';
    const gEvent = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      summary: `Google ${id}`,
      status: 'confirmed',
      updated: OLD,
      start: { dateTime: '2026-10-01T10:00:00.000Z' },
      end: { dateTime: '2026-10-01T11:00:00.000Z' },
      etag: `"${id}"`,
      ...extra,
    });
    /** The legacy pull service on the real database; Google answers from `events` and records the list params. */
    const pullWith = (events: unknown[], listCalls: Record<string, unknown>[] = []) => {
      const calendar = {
        events: {
          list: jest.fn(async (params: Record<string, unknown>) => {
            listCalls.push(params);
            // An expired cursor forces the full resync; a full listing returns every event.
            if (params.syncToken) throw Object.assign(new Error('gone'), { code: 410 });
            return { data: { items: events, nextSyncToken: 'st-new' } };
          }),
        },
      };
      return new GoogleCalendarSyncService(
        {
          getCalendarClient: jest.fn().mockResolvedValue({ calendar, calendarId: 'cal' }),
          ensureHusrevityCalendar: jest.fn().mockResolvedValue('cal'),
          getHusrevityIdFromEvent: jest.fn().mockReturnValue(null),
        } as never,
        apps.off.app.get(IntegrationAccountService),
        repoDs.getRepository(ExternalLink),
        repoDs.getRepository(Item),
        apps.off.engine,
      );
    };
    const reconnect = (o: LegacyOwner) =>
      apps.off.app
        .get(IntegrationAccountService)
        .save(o.id, 'google_calendar', { accessToken: `${o.access}-2`, refreshToken: `${o.refresh}-2` }, [BROAD]);
    const withCursor = async (o: LegacyOwner) =>
      q(`UPDATE integration_account SET sync_token = 'st-1', last_sync_at = now() WHERE owner_id = $1`, [o.id]);
    const itemOf = async (id: string) =>
      (await q<{ title: string; source: string; deleted_at: Date | null }>(`SELECT title, source, deleted_at FROM items WHERE id = $1`, [id]))[0];
    const liveGcal = async (ownerId: string) =>
      (await q<{ c: number }>(`SELECT count(*)::int AS c FROM items WHERE owner_id = $1 AND source = 'gcal' AND deleted_at IS NULL`, [ownerId]))[0].c;

    it('(a) disconnect keeps the cursor, a local edit made while disconnected survives the reconnect pull', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      const web = await addItem(o.id, 'web');
      await linkItem(web, 'ev-web');

      expect((await del(apps.off, o)).status).toBe(204);
      const kept = (await accountRow(o.id))!;
      expect(kept.sync_token).toBe('st-1');
      expect(kept.last_sync_at).not.toBeNull();
      await q(`UPDATE items SET title = 'Edited locally', updated_at = now() WHERE id = $1`, [web]);
      await reconnect(o);

      const calls: Record<string, unknown>[] = [];
      await pullWith([gEvent('ev-web')], calls).syncIncremental(o.id);

      // The retained cursor made it an incremental pull first (then the 410 full resync).
      expect(calls[0].syncToken).toBe('st-1');
      expect(calls[1].syncToken).toBeUndefined();
      expect((await itemOf(web)).title).toBe('Edited locally');
      expect(await linkCount(web)).toBe(1);
    });

    it('(b) an item deleted while disconnected is not resurrected: gcal copy and Husrevity-origin item with a link', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      const gcalCopy = await addItem(o.id, 'gcal');
      const web = await addItem(o.id, 'web');
      await linkItem(gcalCopy, 'ev-g');
      await linkItem(web, 'ev-w');
      await del(apps.off, o);
      await q(`UPDATE items SET deleted_at = now() WHERE id = ANY($1::bigint[])`, [[gcalCopy, web]]);
      await reconnect(o);

      await pullWith([gEvent('ev-g'), gEvent('ev-w')]).syncIncremental(o.id);

      expect((await itemOf(gcalCopy)).deleted_at).not.toBeNull();
      expect((await itemOf(web)).deleted_at).not.toBeNull();
      expect((await itemOf(web)).title).not.toBe('Google ev-w');
      expect(await q(`SELECT 1 FROM items WHERE owner_id = $1`, [o.id])).toHaveLength(2);
    });

    it('(c) after a purge the retained cursor is cleared and a later reconnect re-imports the Google events as gcal copies', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      const g = await addItem(o.id, 'gcal');
      await linkItem(g, 'ev-1');
      await del(apps.off, o);
      expect((await accountRow(o.id))!.sync_token).toBe('st-1');

      expect((await purge(apps.off, o, { confirm: true })).body.data).toEqual({ deleted: 1 });
      const after = (await accountRow(o.id))!;
      expect(after.sync_token).toBeNull();
      expect(after.last_sync_at).toBeNull();
      expect(after.calendar_id).toBe('legacy-cal-1');
      await reconnect(o);

      const calls: Record<string, unknown>[] = [];
      await pullWith([gEvent('ev-1'), gEvent('ev-2')], calls).syncIncremental(o.id);

      expect(calls).toHaveLength(1);
      expect(calls[0].syncToken).toBeUndefined();
      expect(await liveGcal(o.id)).toBe(2);
    });

    it('(c2) a disconnect with deleteLegacyCopies=true clears the cursor as well', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      await addItem(o.id, 'gcal');
      await del(apps.off, o, '?deleteLegacyCopies=true');
      const row = (await accountRow(o.id))!;
      expect(row.sync_token).toBeNull();
      expect(row.last_sync_at).toBeNull();
    });

    it('(d) Husrevity-origin items and links are untouched by disconnect, purge and the pulls (older Google events do not overwrite them)', async () => {
      const o = await legacyOwner({ calendarId: 'legacy-cal-1' });
      await withCursor(o);
      const web = await addItem(o.id, 'web');
      const ios = await addItem(o.id, 'ios');
      await linkItem(web, 'ev-web');
      await linkItem(ios, 'ev-ios');
      const snapshot = async () => q(`SELECT id, title, source, deleted_at, updated_at FROM items WHERE owner_id = $1 ORDER BY id`, [o.id]);
      const before = await snapshot();

      await del(apps.off, o);
      await purge(apps.off, o, { confirm: true });
      expect(await snapshot()).toEqual(before);
      await reconnect(o);
      await pullWith([gEvent('ev-web'), gEvent('ev-ios')]).syncIncremental(o.id);

      expect(await snapshot()).toEqual(before);
      expect(await linkCount(web)).toBe(1);
      expect(await linkCount(ios)).toBe(1);
    });

    describe.each([
      ['flag on', 'on'],
      ['flag off', 'off'],
    ])('preview equals purge with the v2 %s', (_label, key) => {
      it('counts live and soft-deleted gcal copies exactly like the purge deletes them, leaving other owners and sources alone', async () => {
        const o = await purgeableOwner(key);
        const other = await purgeableOwner(key);
        const live = await addItem(o.id, 'gcal');
        const dead = await addItem(o.id, 'gcal');
        await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [dead]);
        await addItem(o.id, 'web');
        const deadWeb = await addItem(o.id, 'ios');
        await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [deadWeb]);
        await addItem(other.id, 'gcal');
        await addItem(other.id, 'web');
        await linkItem(live, `pv-${live}`);

        const pre = await preview(apps[key], o);
        const dis = await request(apps[key].app.getHttpServer())
          .get(`${CALENDAR_BASE}/disconnect-preview`)
          .set(auth(o));
        const res = await purge(apps[key], o, { confirm: true });

        expect(pre.body.data).toEqual({ legacyCopyCount: 2 });
        if (key === 'on') {
          expect(dis.status).toBe(200);
          expect(dis.body.data).toEqual({ legacyCopyCount: 2 });
        }
        expect(res.body.data.deleted).toBe(pre.body.data.legacyCopyCount);
        expect(await itemRows(o.id)).toHaveLength(2);
        expect(await itemRows(other.id)).toHaveLength(2);
        expect((await preview(apps[key], other)).body.data).toEqual({ legacyCopyCount: 1 });
      });
    });
  });

  describe('ownerUsesV2Engine', () => {
    it('is true for a live connection row, false without one, and false for a disconnected row', async () => {
      const none = await legacyOwner();
      const live = await legacyOwner({ v2Connection: true });
      const gone = await legacyOwner({ v2Connection: true });
      await q(`UPDATE google_calendar_connection SET status = 'disconnected' WHERE owner_id = $1`, [gone.id]);
      const reconnect = await legacyOwner({ v2Connection: true });
      await q(`UPDATE google_calendar_connection SET status = 'needs_reconnect' WHERE owner_id = $1`, [reconnect.id]);
      const engine = apps.on.engine;

      expect(await engine.ownerUsesV2Engine(none.id)).toBe(false);
      expect(await engine.ownerUsesV2Engine(live.id)).toBe(true);
      expect(await engine.ownerUsesV2Engine(gone.id)).toBe(false);
      expect(await engine.ownerUsesV2Engine(reconnect.id)).toBe(true);
    });
  });
});
