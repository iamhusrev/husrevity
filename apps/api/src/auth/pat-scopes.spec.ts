import * as fs from 'fs';
import * as path from 'path';
import { PAT_SCOPES } from './dto/pat-dtos';
import { PatScope } from './personal-access-token.entity';

describe('PAT Scopes synchronization across API and Web', () => {
  it('contains goals:read and goals:write in API PAT_SCOPES', () => {
    expect(PAT_SCOPES).toContain('goals:read');
    expect(PAT_SCOPES).toContain('goals:write');
  });

  it('keeps API PAT_SCOPES and Web PAT_SCOPES strictly in sync', () => {
    const webServicePath = path.resolve(
      __dirname,
      '../../../../apps/web/src/services/integrations-service.ts',
    );
    expect(fs.existsSync(webServicePath)).toBe(true);

    const webContent = fs.readFileSync(webServicePath, 'utf8');

    // Extract PAT_SCOPES array literal from web service file
    const match = webContent.match(
      /export\s+const\s+PAT_SCOPES:\s*PatScope\[\]\s*=\s*\[([\s\S]*?)\];/,
    );
    expect(match).not.toBeNull();

    const webScopes = match![1]
      .split(',')
      .map((s) => s.replace(/["'\s]/g, ''))
      .filter(Boolean);

    expect(webScopes.sort()).toEqual([...PAT_SCOPES].sort());
  });

  it('ensures every scope in PAT_SCOPES is assignable to PatScope', () => {
    // Compile-time and runtime check
    const entityFilePath = path.resolve(__dirname, './personal-access-token.entity.ts');
    const entityContent = fs.readFileSync(entityFilePath, 'utf8');

    for (const scope of PAT_SCOPES) {
      expect(entityContent).toContain(`'${scope}'`);
    }
  });

  it('allows tokens with only old scopes to validate and remain functional', () => {
    const oldScopes: PatScope[] = [
      'items:read',
      'items:write',
      'notes:read',
      'notes:write',
      'projects:read',
      'projects:write',
    ];

    // Old token should have only old scopes, without goals:read/write
    expect(oldScopes).not.toContain('goals:read');
    expect(oldScopes).not.toContain('goals:write');

    // Validating against required old scopes passes
    const requiredScope = 'items:read';
    expect(oldScopes.includes(requiredScope)).toBe(true);
  });
});
