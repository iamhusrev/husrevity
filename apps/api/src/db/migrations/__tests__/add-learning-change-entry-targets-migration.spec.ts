import * as fs from 'fs';
import * as path from 'path';

describe('AddLearningChangeEntryTargets migration', () => {
  const migrationPath = path.join(
    __dirname,
    '..',
    '1715000042000-AddLearningChangeEntryTargets.ts',
  );
  const content = fs.readFileSync(migrationPath, 'utf8');

  const body = (name: 'up' | 'down') => {
    const match = content.match(
      name === 'up'
        ? /async\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\}\s*public\s+async\s+down/
        : /async\s+down\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*)\}\s*\}\s*$/,
    );
    expect(match).toBeTruthy();
    return match ? match[1] : '';
  };

  it('sorts after the latest earlier migration', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const later = fs
      .readdirSync(path.join(__dirname, '..'))
      // Newer migrations (043+) may exist; nothing may slot in between 042 and 043.
      .filter(
        (f) =>
          f.endsWith('.ts') &&
          f > '1715000042000-AddLearningChangeEntryTargets.ts' &&
          f < '1715000043000',
      );
    expect(later).toEqual([]);
  });

  it('up widens the target_type constraint with the three learning types and touches no rows', () => {
    const up = body('up');

    for (const type of ['learning_topic', 'learning_subtopic', 'learning_item'])
      expect(up).toContain(`'${type}'`);
    expect(up).toContain("'item', 'item_occurrence'");
    expect(up).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+ck_change_entry_target_type/i);
    expect(up).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b|\bUPDATE\s+/i);
  });

  it('keeps every learning target_type within the VARCHAR(24) column', () => {
    for (const type of ['learning_topic', 'learning_subtopic', 'learning_item'])
      expect(type.length).toBeLessThanOrEqual(24);
  });

  it('down removes only learning entries before restoring the narrow constraint', () => {
    const down = body('down');

    expect(down).toMatch(
      /DELETE\s+FROM\s+change_entry\s+WHERE\s+target_type\s+LIKE\s+'learning_%'/i,
    );
    expect(down).not.toMatch(/\bDROP\s+TABLE\b|\bTRUNCATE\b/i);
    expect(down.indexOf('DELETE FROM')).toBeLessThan(down.indexOf('ADD CONSTRAINT'));
  });
});
