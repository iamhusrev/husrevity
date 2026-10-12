import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ItemExportQueryDto, ItemListQueryDto } from './item-dtos';

describe('ItemListQueryDto', () => {
  it('documents that inbox=true ignores from, to, kind, context and status', () => {
    const meta = Reflect.getMetadata(
      'swagger/apiModelProperties',
      ItemListQueryDto.prototype,
      'inbox',
    ) as {
      description?: string;
    };
    const description = meta?.description ?? '';
    for (const name of ['from', 'to', 'kind', 'context', 'status']) {
      expect(description).toContain(name);
    }
    expect(description.toLowerCase()).toContain('ignored');
  });

  it('documents that goalId does not expand recurring items', () => {
    const meta = Reflect.getMetadata(
      'swagger/apiModelProperties',
      ItemListQueryDto.prototype,
      'goalId',
    ) as {
      description?: string;
    };
    expect((meta?.description ?? '').toLowerCase()).toContain('recurr');
  });
});

describe('ItemExportQueryDto', () => {
  const errorsFor = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(ItemExportQueryDto, plain))).map((e) => e.property);

  it('accepts real calendar dates and defaults includeTasks to true', async () => {
    const dto = plainToInstance(ItemExportQueryDto, { from: '2026-03-01', to: '2026-03-31' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.includeTasks).toBe(true);
  });

  it('rejects missing, malformed and impossible dates', async () => {
    expect(await errorsFor({ to: '2026-03-31' })).toContain('from');
    expect(await errorsFor({ from: '2026-3-1', to: '2026-03-31' })).toContain('from');
    expect(await errorsFor({ from: '2026-03-01', to: '2026-02-30' })).toContain('to');
  });

  it('parses includeTasks from the query string', async () => {
    const dto = plainToInstance(ItemExportQueryDto, {
      from: '2026-03-01',
      to: '2026-03-31',
      includeTasks: 'false',
    });
    expect(dto.includeTasks).toBe(false);
    expect(
      await errorsFor({ from: '2026-03-01', to: '2026-03-31', includeTasks: 'maybe' }),
    ).toContain('includeTasks');
  });
});
