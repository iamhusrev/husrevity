import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The apply_plan description is the only place a model learns that operations
 * cannot reference items created in the same plan (a deliberate limitation).
 * This guards the sentences against accidental removal; it reads the source on
 * purpose because the registered description is built inside the tool module.
 */
describe('apply_plan tool description', () => {
  const source = readFileSync(join(__dirname, 'plan-tool.ts'), 'utf8');

  it('documents that operations cannot reference items created in the same plan', () => {
    expect(source).toContain('Operations cannot reference items created in the same plan');
    expect(source).toContain('give each create its own scheduledAt/dueAt and durationMin');
  });

  it('documents that several occurrences of one recurring item need separate plans', () => {
    expect(source).toContain('one operation per item id per plan');
  });
});
