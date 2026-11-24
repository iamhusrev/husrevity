import { MigrationHarness, migrationsAfter, startMigrationHarness } from './helpers/migration-harness';

/**
 * Test 1 `migrations_up_down_up`: everything after the 042 baseline must be
 * reversible. The set of migrations after 042 is computed from the files on
 * disk, so the spec keeps working when 043-045 land. While that set is empty
 * the up/down/up cycle must be a harmless no-op that leaves the schema equal.
 */
jest.setTimeout(240_000);

const BASELINE = 1715000042000;

describe('migrations_up_down_up', () => {
  let h: MigrationHarness;

  beforeAll(async () => {
    h = await startMigrationHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('restores the schema after reverting every migration newer than 042 and applying them again', async () => {
    const newer = migrationsAfter(h.files, BASELINE);
    // Plan section 3 promises exactly three migrations (043, 044, 045) and a three-step rollback.
    expect(newer.map((f) => f.timestamp)).toEqual([1715000043000, 1715000044000, 1715000045000]);

    await h.migrateUpTo(BASELINE);
    expect((await h.executed()).at(-1)).toBe(BASELINE);
    const atBaseline = await h.schemaSnapshot();

    await h.migrateUpTo();
    expect(await h.executed()).toEqual(h.files.map((f) => f.timestamp));
    const atHead = await h.schemaSnapshot();

    const reverted = await h.revertDownTo(BASELINE);
    expect(reverted).toBe(newer.length);
    expect((await h.executed()).at(-1)).toBe(BASELINE);
    expect(await h.schemaSnapshot()).toEqual(atBaseline);

    await h.migrateUpTo();
    expect(await h.executed()).toEqual(h.files.map((f) => f.timestamp));
    expect(await h.schemaSnapshot()).toEqual(atHead);
  });

  it('is a no-op when no migration is newer than 042', async () => {
    // Holds for any head: reverting down to the current head changes nothing.
    await h.migrateUpTo();
    const before = await h.schemaSnapshot();
    const head = h.files[h.files.length - 1].timestamp;
    expect(await h.revertDownTo(head)).toBe(0);
    expect(await h.schemaSnapshot()).toEqual(before);
    if (migrationsAfter(h.files, BASELINE).length === 0) {
      expect(head).toBe(BASELINE);
    }
  });
});
