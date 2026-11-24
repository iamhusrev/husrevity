import { MigrationHarness, startMigrationHarness } from './helpers/migration-harness';

/**
 * Test 3 `identity_down_refuses_google_only_users`: down() of
 * 1715000043000-AddGoogleIdentity must refuse (not silently lock accounts)
 * while a Google-only user exists, unless ALLOW_GOOGLE_IDENTITY_DROP=1.
 */
jest.setTimeout(240_000);

const T043 = 1715000043000;

describe('identity_down_refuses_google_only_users', () => {
  let h: MigrationHarness;
  let googleOnlyUserId: string;
  const savedEnv = process.env.ALLOW_GOOGLE_IDENTITY_DROP;

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    const [u] = await h.dataSource.query(
      `INSERT INTO app_user (email, password_hash, password_login_enabled)
         VALUES ('google-only@example.test', 'x', false) RETURNING id`,
    );
    googleOnlyUserId = u.id;
    await h.dataSource.query(
      `INSERT INTO user_identity (user_id, provider, provider_subject)
         VALUES ($1, 'google', 'sub-google-only')`,
      [googleOnlyUserId],
    );
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.ALLOW_GOOGLE_IDENTITY_DROP;
    else process.env.ALLOW_GOOGLE_IDENTITY_DROP = savedEnv;
  });

  afterAll(async () => {
    await h?.close();
  });

  it('refuses to revert 043 while a Google-only user exists and changes nothing', async () => {
    delete process.env.ALLOW_GOOGLE_IDENTITY_DROP;
    const before = await h.schemaSnapshot();
    // Only 043 is of interest: revert everything newer first so it is the last one.
    await h.revertDownTo(T043);
    await expect(h.revert(1)).rejects.toThrow();
    expect(await h.executed()).toContain(T043);
    const rows = await h.dataSource.query(`SELECT 1 FROM user_identity WHERE user_id = $1`, [
      googleOnlyUserId,
    ]);
    expect(rows).toHaveLength(1);
    await h.migrateUpTo();
    expect(await h.schemaSnapshot()).toEqual(before);
  });

  it('allows the revert with ALLOW_GOOGLE_IDENTITY_DROP=1', async () => {
    process.env.ALLOW_GOOGLE_IDENTITY_DROP = '1';
    await h.revertDownTo(T043);
    await h.revert(1);
    expect(await h.executed()).not.toContain(T043);
  });
});
