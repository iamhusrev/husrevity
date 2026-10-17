import * as fs from 'fs';
import * as path from 'path';

describe('AddLearningTopicYear migration', () => {
  const migrationPath = path.join(__dirname, '..', '1715000041000-AddLearningTopicYear.ts');

  it('migration file exists with timestamp 1715000041000', () => {
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

  it('adds a nullable smallint year column to learning_topic idempotently, without default or index', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    const upMatch = content.match(
      /async\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}\s*public\s+async\s+down/,
    );
    expect(upMatch).toBeTruthy();
    const upBody = upMatch ? upMatch[1] : '';

    expect(upBody).toMatch(
      /ALTER\s+TABLE\s+learning_topic\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+year\s+SMALLINT/i,
    );
    expect(upBody).not.toMatch(/\bNOT\s+NULL\b/i);
    expect(upBody).not.toMatch(/\bDEFAULT\b/i);
    expect(upBody).not.toMatch(/\bINDEX\b/i);
  });

  it('down method only drops the year column', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    const downMatch = content.match(
      /async\s+down\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}/,
    );
    expect(downMatch).toBeTruthy();
    const downBody = downMatch ? downMatch[1] : '';

    expect(downBody).toMatch(
      /ALTER\s+TABLE\s+learning_topic\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+year/i,
    );
    expect(downBody).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(downBody.match(/\bDROP\b/gi)).toHaveLength(1);
  });
});
