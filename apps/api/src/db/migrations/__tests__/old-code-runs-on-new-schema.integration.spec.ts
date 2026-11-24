import { join } from 'path';
import { DataSource } from 'typeorm';
import { MigrationHarness, startMigrationHarness } from './helpers/migration-harness';
import { User } from '../../../user/user.entity';
import { Item } from '../../../item/item.entity';
import { ExternalLink } from '../../../integrations/external-link.entity';
import { IntegrationAccount } from '../../../integrations/integration-account.entity';

/**
 * Test 2 `old_code_runs_on_new_schema`: with every migration applied, the
 * entities of the current (old) image must still insert and select. The old
 * entities know none of the columns or tables added later, so any new NOT NULL
 * column without a default, or a renamed/dropped column, fails here.
 */
jest.setTimeout(240_000);

describe('old_code_runs_on_new_schema', () => {
  let h: MigrationHarness;
  let app: DataSource;

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    // Old-image view: entity metadata only, same query builder the app uses.
    app = new DataSource({
      type: 'postgres',
      url: h.container.getConnectionUri(),
      entities: [join(__dirname, '..', '..', '..', '**', '*.entity.{ts,js}')],
      synchronize: false,
    });
    await app.initialize();
  });

  afterAll(async () => {
    await app?.destroy();
    await h.close();
  });

  it('inserts and selects app_user without any new column', async () => {
    const repo = app.getRepository(User);
    const saved = await repo.save(repo.create({ email: 'old-code@example.test', passwordHash: 'x' }));
    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.email).toBe('old-code@example.test');
    expect(found.enabled).toBe(true);
  });

  it('inserts and selects items, external_link and integration_account as the services do', async () => {
    const user = await app
      .getRepository(User)
      .save({ email: 'old-code-2@example.test', passwordHash: 'x' } as User);

    const items = app.getRepository(Item);
    const item = await items.save(
      items.create({ ownerId: user.id, kind: 'event', title: 'Old image event', source: 'gcal' } as Item),
    );
    expect((await items.findOneByOrFail({ id: item.id })).title).toBe('Old image event');

    const links = app.getRepository(ExternalLink);
    const link = await links.save(
      links.create({ itemId: item.id, provider: 'google_calendar', externalId: 'evt-1', etag: 'e1' }),
    );
    expect(
      (await links.findOneByOrFail({ provider: 'google_calendar', externalId: 'evt-1' })).id,
    ).toBe(link.id);

    const accounts = app.getRepository(IntegrationAccount);
    const account = await accounts.save(
      accounts.create({
        ownerId: user.id,
        provider: 'google_calendar',
        encryptedAccessToken: 'enc-access',
        encryptedRefreshToken: 'enc-refresh',
        scopes: ['openid'],
        status: 'connected',
        connectedAt: new Date(),
      }),
    );
    account.syncToken = 'tok';
    account.channelId = 'ch';
    await accounts.save(account);
    const loaded = await accounts.findOneByOrFail({ ownerId: user.id, provider: 'google_calendar' });
    expect(loaded.syncToken).toBe('tok');
    expect(loaded.scopes).toEqual(['openid']);
  });
});
