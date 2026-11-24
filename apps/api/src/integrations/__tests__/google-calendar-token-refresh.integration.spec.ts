import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auth, google } from 'googleapis';
import { DataSource } from 'typeorm';
import { CryptoService } from '../../crypto/crypto.service';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { User } from '../../user/user.entity';
import { GoogleCalendarConfig } from '../google-calendar.config';
import { GoogleCalendarService } from '../google-calendar.service';
import { IntegrationAccount } from '../integration-account.entity';
import { IntegrationAccountService } from '../integration-account.service';

/**
 * Refreshed Google access tokens are persisted (encrypted) through the OAuth2
 * client's `tokens` event. A real OAuth2 client runs the refresh; only its HTTP
 * transport is replaced, so no network and no real Google. Disposable Postgres.
 */
jest.setTimeout(240_000);

const BROAD = 'https://www.googleapis.com/auth/calendar';

describe('Google Calendar refreshed token persistence (integration)', () => {
  let h: MigrationHarness;
  let ds: DataSource;
  let crypto: CryptoService;
  let accounts: IntegrationAccountService;
  let service: GoogleCalendarService;
  let client: Auth.OAuth2Client;
  let seq = 0;

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => ds.query(sql, params);
  const row = async (ownerId: string) =>
    (await q(`SELECT * FROM integration_account WHERE owner_id = $1`, [ownerId]))[0] as Record<string, any>;

  /** Connected owner with stored tokens, and an OAuth2 client built from them whose refresh answers `response`. */
  const connectedClient = async (response: Record<string, unknown>) => {
    const ownerId = String(
      (await q<{ id: string }>(`INSERT INTO app_user (email, password_hash) VALUES ($1, 'x') RETURNING id`, [
        `refresh-${++seq}@example.test`,
      ]))[0].id,
    );
    await accounts.save(ownerId, 'google_calendar', { accessToken: 'old-access', refreshToken: 'old-refresh' }, [BROAD]);
    await service.getCalendarClient(ownerId);
    // Real refresh logic, fake transport: the stored token has no expiry, so force one.
    (client as unknown as { transporter: unknown }).transporter = { request: async () => ({ data: { ...response } }) };
    client.setCredentials({ access_token: 'old-access', refresh_token: 'old-refresh', expiry_date: 1 });
    return ownerId;
  };
  const refreshNow = async (): Promise<void> => {
    await client.getAccessToken();
    // The handler persists in the background: let it finish.
    await new Promise((r) => setTimeout(r, 400));
  };

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    const env = { HUSREVITY_CRYPTO_KEY: randomBytes(32).toString('base64') };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: h.container.getConnectionUri(),
          entities: [User, IntegrationAccount],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([IntegrationAccount]),
      ],
      providers: [CryptoService, IntegrationAccountService],
    }).compile();
    await moduleRef.init();
    ds = moduleRef.get(DataSource);
    crypto = moduleRef.get(CryptoService);
    accounts = moduleRef.get(IntegrationAccountService);

    const cfg = new GoogleCalendarConfig(moduleRef.get(ConfigService));
    cfg.isConfigured = () => true;
    cfg.createOAuth2Client = () => {
      client = new google.auth.OAuth2('client-id.example.test', 'client-secret-placeholder', 'https://api.example.test/cb');
      return client;
    };
    service = new GoogleCalendarService(cfg, accounts, {} as never, {} as never);
  });

  afterAll(async () => {
    await h?.close();
  });

  afterEach(() => jest.restoreAllMocks());

  it('persists a refreshed access token encrypted and keeps the stored refresh token', async () => {
    const ownerId = await connectedClient({ access_token: 'refreshed-access', expires_in: 3600 });
    const before = await row(ownerId);

    await refreshNow();

    const after = await row(ownerId);
    expect(after.status).toBe('connected');
    expect(crypto.decrypt(after.encrypted_access_token)).toBe('refreshed-access');
    expect(after.encrypted_access_token).not.toContain('refreshed-access');
    expect(after.encrypted_refresh_token).toBe(before.encrypted_refresh_token);
    expect(crypto.decrypt(after.encrypted_refresh_token)).toBe('old-refresh');
  });

  it('replaces the refresh token only when Google returned a new one', async () => {
    const ownerId = await connectedClient({ access_token: 'refreshed-access-2', refresh_token: 'rotated-refresh', expires_in: 3600 });

    await refreshNow();

    const after = await row(ownerId);
    expect(crypto.decrypt(after.encrypted_access_token)).toBe('refreshed-access-2');
    expect(crypto.decrypt(after.encrypted_refresh_token)).toBe('rotated-refresh');
  });

  it('never restores a token after a disconnect: a late refresh leaves the tokenless row untouched', async () => {
    const ownerId = await connectedClient({ access_token: 'late-access', refresh_token: 'late-refresh', expires_in: 3600 });
    // Disconnect (as the lifecycle does for a legacy owner): tokens removed, row kept tokenless.
    await q(
      `UPDATE integration_account
          SET status = 'disconnected', encrypted_access_token = '', encrypted_refresh_token = NULL, scopes = '[]'::jsonb,
              calendar_id = 'cal@example.test'
        WHERE owner_id = $1`,
      [ownerId],
    );
    const before = await row(ownerId);

    await refreshNow();

    expect(await row(ownerId)).toEqual(before);
    const after = await row(ownerId);
    expect(after.encrypted_access_token).toBe('');
    expect(after.encrypted_refresh_token).toBeNull();
  });

  it('does not break the Google call or log any token when the write fails', async () => {
    const ownerId = await connectedClient({ access_token: 'refreshed-access-3', expires_in: 3600 });
    jest
      .spyOn(IntegrationAccountService.prototype, 'updateRefreshedTokens')
      .mockRejectedValue(new Error('db down ya29.SECRET-ACCESS 1//SECRET-REFRESH refreshed-access-3'));
    const logged: string[] = [];
    for (const m of ['warn', 'error', 'log', 'debug'] as const) {
      jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }

    await expect(client.getAccessToken()).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 400));

    const after = await row(ownerId);
    expect(crypto.decrypt(after.encrypted_access_token)).toBe('old-access');
    for (const line of logged) {
      for (const secret of ['SECRET', 'refreshed-access-3', 'old-access', 'old-refresh']) expect(line).not.toContain(secret);
    }
  });
});
