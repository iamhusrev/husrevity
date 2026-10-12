import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ItemUpdateRequestDto } from './dto/item-dtos';
import { ItemController } from './item.controller';

/**
 * PATCH /items/:id used to type its body as Partial<ItemRequestDto>. That type
 * is erased at runtime (metatype Object), so the global ValidationPipe never
 * validated or whitelisted the body: goalId "" silently cleared the goal.
 */
describe('PATCH /items/:id body validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const meta = { type: 'body' as const, metatype: ItemUpdateRequestDto };

  it('is wired to a real DTO class on the controller update handler', () => {
    const types: unknown[] =
      Reflect.getMetadata('design:paramtypes', ItemController.prototype, 'update') ?? [];
    expect(types).toContain(ItemUpdateRequestDto);
  });

  it('rejects an empty-string goalId instead of clearing the goal', async () => {
    await expect(pipe.transform({ goalId: '' }, meta)).rejects.toBeDefined();
  });

  it('rejects a non-string goalId', async () => {
    await expect(pipe.transform({ goalId: 12 }, meta)).rejects.toBeDefined();
  });

  it('accepts null to clear the goal and keeps it', async () => {
    const res = await pipe.transform({ goalId: null }, meta);
    expect(res.goalId).toBeNull();
  });

  it('accepts a partial body (no title, no kind)', async () => {
    const res = await pipe.transform({ status: 'done' }, meta);
    expect(res.status).toBe('done');
  });

  it('strips unknown properties such as ownerId (whitelist)', async () => {
    const res = await pipe.transform({ title: 'x', ownerId: '999' }, meta);
    expect(res).not.toHaveProperty('ownerId');
  });

  it('rejects an invalid kind', async () => {
    await expect(pipe.transform({ kind: 'banana' }, meta)).rejects.toBeDefined();
  });
});
