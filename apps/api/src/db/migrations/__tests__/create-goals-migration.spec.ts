import * as fs from 'fs';
import * as path from 'path';

describe('CreateGoals migration', () => {
  const migrationPath = path.join(__dirname, '..', '1715000038000-CreateGoals.ts');

  it('migration file exists with timestamp 1715000038000', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('is strictly additive: up method does NOT contain DROP, TRUNCATE, DELETE FROM, or UPDATE', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Extract up() method body
    const upMatch = content.match(
      /async\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}\s*public\s+async\s+down/,
    );
    expect(upMatch).toBeTruthy();
    const upBody = upMatch ? upMatch[1] : '';

    expect(upBody).not.toMatch(/\bDROP\b/i);
    expect(upBody).not.toMatch(/\bTRUNCATE\b/i);
    expect(upBody).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(upBody).not.toMatch(/\bUPDATE\s+/i);
  });

  it('creates goal table with expected columns and constraints', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    expect(content).toContain('CREATE TABLE IF NOT EXISTS goal');
    expect(content).toContain('owner_id');
    expect(content).toContain('title');
    expect(content).toContain('notes');
    expect(content).toContain('horizon');
    expect(content).toContain('period_start');
    expect(content).toContain('period_end');
    expect(content).toContain('parent_goal_id');
    expect(content).toContain('status');
    expect(content).toContain('created_at');
    expect(content).toContain('created_by_id');
    expect(content).toContain('updated_at');
    expect(content).toContain('updated_by_id');
    expect(content).toContain('deleted_at');

    expect(content).toContain('ck_goal_horizon');
    expect(content).toContain('ck_goal_status');
    expect(content).toContain('ck_goal_period');

    expect(content).toContain('idx_goal_owner_horizon_start');
    expect(content).toContain('idx_goal_parent');
  });

  it('adds goal_id to items and project idempotently with foreign keys and indexes', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    expect(content).toMatch(
      /ALTER\s+TABLE\s+items\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+goal_id\s+BIGINT/i,
    );
    expect(content).toMatch(
      /ALTER\s+TABLE\s+project\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+goal_id\s+BIGINT/i,
    );

    expect(content).toContain('fk_items_goal_id');
    expect(content).toContain('fk_project_goal_id');

    expect(content).toContain('idx_items_goal');
    expect(content).toContain('idx_project_goal');
  });

  it('down method only removes objects created by this migration', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    const downMatch = content.match(
      /async\s+down\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}/,
    );
    expect(downMatch).toBeTruthy();
    const downBody = downMatch ? downMatch[1] : '';

    expect(downBody).toContain('fk_items_goal_id');
    expect(downBody).toContain('fk_project_goal_id');
    expect(downBody).toContain('goal_id');
    expect(downBody).toContain('DROP TABLE IF EXISTS goal');
  });
});
