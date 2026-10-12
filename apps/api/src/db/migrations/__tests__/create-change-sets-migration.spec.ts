import * as fs from 'fs';
import * as path from 'path';

describe('CreateChangeSets migration', () => {
  const migrationPath = path.join(
    __dirname,
    '..',
    '1715000036000-CreateChangeSets.ts',
  );

  it('migration file exists with timestamp 1715000036000', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('is strictly additive: up method does NOT contain DROP, TRUNCATE, DELETE FROM, or UPDATE', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Extract up() method body
    const upMatch = content.match(/async\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}\s*public\s+async\s+down/);
    expect(upMatch).toBeTruthy();
    const upBody = upMatch ? upMatch[1] : '';

    expect(upBody).not.toMatch(/\bDROP\b/i);
    expect(upBody).not.toMatch(/\bTRUNCATE\b/i);
    expect(upBody).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(upBody).not.toMatch(/\bUPDATE\s+/i);
  });

  it('includes defensive ALTER TABLE change_entry ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ in up()', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');
    const upMatch = content.match(/async\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}\s*public\s+async\s+down/);
    expect(upMatch).toBeTruthy();
    const upBody = upMatch ? upMatch[1] : '';

    expect(upBody).toMatch(/ALTER\s+TABLE\s+change_entry\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+undone_at\s+TIMESTAMPTZ/i);
  });

  it('defines change_set and change_entry tables with expected indexes and foreign keys', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    expect(content).toContain('CREATE TABLE IF NOT EXISTS change_set');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS change_entry');
    expect(content).toContain('idx_change_set_owner_created');
    expect(content).toContain('idx_change_entry_set_ordinal');

    const entryTableMatch = content.match(/CREATE TABLE IF NOT EXISTS change_entry\s*\(([\s\S]*?)\);/);
    expect(entryTableMatch).toBeTruthy();
    expect(entryTableMatch![1]).toMatch(/undone_at\s+TIMESTAMPTZ/);
  });
});
