import * as fs from 'fs';
import * as path from 'path';

describe('MCP tools zod import consistency', () => {
  const toolsDir = __dirname;
  // Audit F-16 identified learning-tools.ts and notification-tools.ts with bare 'zod' imports.
  // Note: sport-tools.ts was also discovered to have bare 'zod', but hard rules forbid
  // modifying any file in apps/api/src/mcp/ except the two import lines named in item 9.
  const auditF16Files = ['learning-tools.ts', 'notification-tools.ts'];

  it.each(auditF16Files)('ensures %s imports zod from "zod/v3"', (file) => {
    const filePath = path.join(toolsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const bareImportRegex = /from\s+['"]zod['"]/;
    expect(bareImportRegex.test(content)).toBe(false);
  });
});
