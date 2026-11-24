import { migrationsAfter, MigrationFile } from './helpers/migration-harness';

describe('migrationsAfter', () => {
  const f = (timestamp: number): MigrationFile => ({ timestamp, file: `${timestamp}-X.ts`, ctor: class {} as never });

  it('returns only strictly newer migrations', () => {
    expect(migrationsAfter([f(1), f(2), f(3)], 2).map((m) => m.timestamp)).toEqual([3]);
  });

  it('returns an empty list when nothing is newer', () => {
    expect(migrationsAfter([f(1), f(2)], 2)).toEqual([]);
  });
});
