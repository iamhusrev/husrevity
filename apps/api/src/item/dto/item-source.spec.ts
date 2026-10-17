import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ITEM_SOURCES, ItemRequestDto } from './item-dtos';

describe('item source whitelist', () => {
  const check = async (source: string) =>
    validate(plainToInstance(ItemRequestDto, { kind: 'task', title: 'x', source }), {
      whitelist: true,
    });

  it('accepts the native macOS client', async () => {
    expect(ITEM_SOURCES).toContain('macos');
    expect(await check('macos')).toEqual([]);
  });

  it('keeps accepting every existing source', async () => {
    for (const source of ['web', 'ios', 'mcp', 'telegram', 'gmail', 'gcal', 'slack']) {
      expect(await check(source)).toEqual([]);
    }
  });

  it('still rejects an unknown source', async () => {
    const errors = await check('desktop');
    expect(errors.map((e) => e.property)).toContain('source');
  });
});
