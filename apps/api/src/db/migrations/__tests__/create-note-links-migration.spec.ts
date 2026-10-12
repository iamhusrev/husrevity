import * as fs from 'fs';
import * as path from 'path';

describe('CreateNoteLinks migration', () => {
  const migrationPath = path.join(__dirname, '..', '1715000039000-CreateNoteLinks.ts');

  it('migration file exists with timestamp 1715000039000', () => {
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

  it('creates note_link table with expected columns and constraints', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    expect(content).toContain('CREATE TABLE IF NOT EXISTS note_link');
    expect(content).toContain('owner_id');
    expect(content).toContain('note_id');
    expect(content).toContain('target_type');
    expect(content).toContain('target_id');
    expect(content).toContain('created_at');
    expect(content).toContain('created_by_id');
    expect(content).toContain('updated_at');
    expect(content).toContain('updated_by_id');
    expect(content).toContain('deleted_at');

    expect(content).toContain("target_type IN ('item','project','goal')");
    expect(content).toContain('uq_note_link_live');
    expect(content).toContain('idx_note_link_owner_target');
  });

  it('down method only removes objects created by this migration', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    const downMatch = content.match(
      /async\s+down\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}/,
    );
    expect(downMatch).toBeTruthy();
    const downBody = downMatch ? downMatch[1] : '';

    expect(downBody).toContain('DROP TABLE IF EXISTS note_link');
  });
});
