import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Entities that reference each other must declare relation properties as
 * `Relation<T>`. With `emitDecoratorMetadata` a property typed directly as an
 * imported class makes the compiler emit `design:type = T` at class-definition
 * time; when two entity files import each other that is a temporal-dead-zone
 * error ("Cannot access 'X' before initialization") that depends on the order
 * TypeORM's glob loader happens to import the files in. It showed up as a
 * flaky `migration:run` failure, so this guard scans the sources.
 */
function entityFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...entityFiles(full));
    else if (name.endsWith('.entity.ts')) out.push(full);
  }
  return out;
}

const RELATION_DECORATOR = /@(ManyToOne|OneToOne)\(/;
// property line: `name?: Type;` / `name!: Type | null;`
const PROPERTY_LINE = /^\s*[A-Za-z_$][\w$]*[?!]?:\s*([^;=]+);/;

describe('entity relation property types', () => {
  const root = join(__dirname, '..');
  const files = entityFiles(root);

  it('finds the entity files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('declares every ManyToOne/OneToOne property as Relation<T> (never a bare imported class)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!RELATION_DECORATOR.test(lines[i])) continue;
        // the property declaration is the first non-decorator line after it
        let j = i + 1;
        while (j < lines.length && lines[j].trim().startsWith('@')) j++;
        const m = PROPERTY_LINE.exec(lines[j] ?? '');
        if (!m) continue;
        const type = m[1].trim();
        if (!/^Relation<.+>(\s*\|\s*(null|undefined))*$/.test(type)) {
          offenders.push(`${file.replace(root + '/', '')}:${j + 1}  ${lines[j].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
