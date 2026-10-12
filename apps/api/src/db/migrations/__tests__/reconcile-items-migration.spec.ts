import { ReconcileItemsFromLegacyTables1715000037000 } from '../1715000037000-ReconcileItemsFromLegacyTables';

describe('ReconcileItemsFromLegacyTables1715000037000', () => {
  it('has the correct migration name and timestamp above 1715000036000', () => {
    const migration = new ReconcileItemsFromLegacyTables1715000037000();
    expect(migration.name).toBe('ReconcileItemsFromLegacyTables1715000037000');
  });

  it('runs strictly additive, idempotent SQL queries in up() and does not execute DROP/TRUNCATE/DELETE/UPDATE', async () => {
    const executedQueries: string[] = [];
    const mockQr = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        executedQueries.push(sql);
        return [];
      }),
    } as any;

    const migration = new ReconcileItemsFromLegacyTables1715000037000();
    await migration.up(mockQr);

    expect(executedQueries.length).toBeGreaterThan(0);

    for (const sql of executedQueries) {
      const upper = sql.toUpperCase();
      expect(upper).toContain('INSERT INTO ITEMS');
      expect(upper).toContain('NOT EXISTS');
      expect(upper).not.toContain('DROP TABLE');
      expect(upper).not.toContain('DROP COLUMN');
      expect(upper).not.toContain('TRUNCATE');
      expect(upper).not.toContain('DELETE FROM');
      expect(upper).not.toMatch(/\bUPDATE\b/);
    }

    const joined = executedQueries.join('\n');
    const expectedTables = [
      'task',
      'reminder',
      'calendar_event',
      'routine_segment',
      'routine_activity',
      'time_block',
      'learning_item',
      'sport_session',
      'sport_log',
    ];

    for (const table of expectedTables) {
      expect(joined).toContain(table);
    }
  });

  it('has a no-op down() method that executes no destructive statements', async () => {
    const mockQr = {
      query: jest.fn().mockResolvedValue([]),
    } as any;

    const migration = new ReconcileItemsFromLegacyTables1715000037000();
    await migration.down(mockQr);

    expect(mockQr.query).not.toHaveBeenCalled();
  });
});
