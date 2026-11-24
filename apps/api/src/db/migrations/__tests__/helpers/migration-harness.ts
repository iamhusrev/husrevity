import 'reflect-metadata';
import { readdirSync } from 'fs';
import { join } from 'path';
import { DataSource, MigrationInterface } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Shared harness for Testcontainers migration specs. Starts a disposable
 * postgres:16-alpine (never a shared database) and drives migrations one at a
 * time: up to a timestamp, revert N, revert down to a timestamp, and a
 * normalised schema snapshot to compare states.
 */

export const MIGRATIONS_DIR = join(__dirname, '..', '..');

export interface MigrationFile {
  timestamp: number;
  file: string;
  ctor: new () => MigrationInterface;
}

/** All migration classes on disk, sorted by timestamp. */
export function loadMigrationFiles(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{13}-.+\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
    .map((file) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(join(MIGRATIONS_DIR, file)) as Record<string, new () => MigrationInterface>;
      const ctor = Object.values(mod).find((v) => typeof v === 'function')!;
      return { timestamp: Number(file.slice(0, 13)), file, ctor };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Pure helper: files with a timestamp strictly greater than `after`. */
export function migrationsAfter(files: MigrationFile[], after: number): MigrationFile[] {
  return files.filter((f) => f.timestamp > after);
}

export interface MigrationHarness {
  container: StartedPostgreSqlContainer;
  dataSource: DataSource;
  files: MigrationFile[];
  /** Applies pending migrations with timestamp <= `timestamp` (all when omitted). */
  migrateUpTo(timestamp?: number): Promise<void>;
  /** Reverts the last `count` executed migrations. */
  revert(count: number): Promise<void>;
  /** Reverts executed migrations until the newest executed one is <= `timestamp`. */
  revertDownTo(timestamp: number): Promise<number>;
  /** Timestamps of executed migrations, ascending. */
  executed(): Promise<number[]>;
  /** Normalised schema (columns, indexes, constraints) excluding the migrations table. */
  schemaSnapshot(): Promise<string[]>;
  close(): Promise<void>;
}

export async function startMigrationHarness(): Promise<MigrationHarness> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const files = loadMigrationFiles();

  // `migrations` is mutated per step so the same DataSource can stop at any timestamp.
  const dataSource = new DataSource({
    type: 'postgres',
    url: container.getConnectionUri(),
    entities: [],
    migrations: files.map((f) => f.ctor),
    synchronize: false,
  });
  await dataSource.initialize();

  const executed = async (): Promise<number[]> => {
    const exists = await dataSource.query(`SELECT to_regclass('public.migrations') AS t`);
    if (!exists[0].t) return [];
    const rows = await dataSource.query(`SELECT timestamp FROM migrations ORDER BY timestamp`);
    return rows.map((r: { timestamp: string }) => Number(r.timestamp));
  };

  const revert = async (count: number): Promise<void> => {
    for (let i = 0; i < count; i++) await dataSource.undoLastMigration({ transaction: 'each' });
  };

  return {
    container,
    dataSource,
    files,
    async migrateUpTo(timestamp = Number.MAX_SAFE_INTEGER) {
      // TypeORM runs every pending migration, so narrow the list for this call.
      const original = dataSource.migrations;
      const wanted = files.filter((f) => f.timestamp <= timestamp).map((f) => new f.ctor());
      (dataSource as unknown as { migrations: MigrationInterface[] }).migrations = wanted;
      try {
        await dataSource.runMigrations({ transaction: 'each' });
      } finally {
        (dataSource as unknown as { migrations: MigrationInterface[] }).migrations = original;
      }
    },
    revert,
    async revertDownTo(timestamp) {
      let reverted = 0;
      for (;;) {
        const done = await executed();
        if (done.length === 0 || done[done.length - 1] <= timestamp) return reverted;
        await revert(1);
        reverted++;
      }
    },
    executed,
    async schemaSnapshot() {
      const columns = await dataSource.query(`
        SELECT 'col ' || table_name || '.' || column_name || ' ' || data_type || ' ' ||
               is_nullable || ' ' || coalesce(column_default, '-') || ' ' ||
               coalesce(character_maximum_length::text, '-') AS line
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name <> 'migrations'`);
      const indexes = await dataSource.query(`
        SELECT 'idx ' || tablename || ' ' || indexdef AS line
        FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'migrations'`);
      const constraints = await dataSource.query(`
        SELECT 'con ' || c.conrelid::regclass::text || ' ' || c.conname || ' ' ||
               pg_get_constraintdef(c.oid) AS line
        FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public' AND c.conrelid::regclass::text <> 'migrations'`);
      return [...columns, ...indexes, ...constraints].map((r: { line: string }) => r.line).sort();
    },
    async close() {
      await dataSource.destroy();
      await container.stop();
    },
  };
}
