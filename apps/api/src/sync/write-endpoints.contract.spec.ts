import 'reflect-metadata';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { AuthenticatedUser } from '../common/current-user.decorator';
import { ItemController } from '../item/item.controller';
import { NoteController } from '../note/note.controller';
import { ProjectController } from '../project/project.controller';
import { GoalController } from '../goal/goal.controller';

/**
 * Contract for the offline outbox replay (apps/macos): every write the Mac app can queue must
 * honour `Idempotency-Key` (safe retry) and, for edits/deletes, `If-Match` (409 on a stale
 * updatedAt). A header-less request must keep behaving exactly as before.
 */

const user: AuthenticatedUser = { userId: '7', email: 'a@b.c', role: 'ROLE_USER' };
const STALE_HEADER = '1767225600000';
const STALE_MS = 1767225600000;

const interceptorsOf = (target: object, method: string): unknown[] =>
  Reflect.getMetadata('__interceptors__', (target as any)[method]) ?? [];

describe('Idempotency-Key coverage on replayable writes', () => {
  it.each([
    [ItemController, 'create'],
    [ItemController, 'update'],
    [ItemController, 'remove'],
    [ItemController, 'complete'],
    [NoteController, 'create'],
    [NoteController, 'update'],
    [NoteController, 'remove'],
    [NoteController, 'createTag'],
    [NoteController, 'deleteTag'],
    [ProjectController, 'create'],
    [ProjectController, 'update'],
    [ProjectController, 'remove'],
    [GoalController, 'create'],
    [GoalController, 'update'],
    [GoalController, 'remove'],
  ] as const)('%p.%s is wrapped by IdempotencyInterceptor', (controller, method) => {
    expect(interceptorsOf(controller.prototype, method)).toContain(IdempotencyInterceptor);
  });
});

describe('If-Match header is parsed and forwarded to the service', () => {
  it('items: remove and complete', async () => {
    const items = { delete: jest.fn(), complete: jest.fn() };
    const c = new ItemController(items as never);

    await c.remove(user, '10', STALE_HEADER);
    expect(items.delete).toHaveBeenCalledWith('7', '10', undefined, STALE_MS);

    await c.complete(user, '10', { occursOn: '2026-01-05' }, `"${STALE_HEADER}"`);
    expect(items.complete).toHaveBeenCalledWith(
      '7',
      '10',
      { occursOn: '2026-01-05' },
      undefined,
      STALE_MS,
    );
  });

  it('notes: update and remove', async () => {
    const notes = { update: jest.fn(), delete: jest.fn() };
    const c = new NoteController(notes as never);

    await c.update(user, '9', { title: 'T' }, STALE_HEADER);
    expect(notes.update).toHaveBeenCalledWith('7', '9', { title: 'T' }, STALE_MS);

    await c.remove(user, '9', STALE_HEADER);
    expect(notes.delete).toHaveBeenCalledWith('7', '9', STALE_MS);
  });

  it('projects: update and remove', async () => {
    const projects = { update: jest.fn(), delete: jest.fn() };
    const c = new ProjectController(projects as never);

    await c.update(user, '3', { name: 'N' }, STALE_HEADER);
    expect(projects.update).toHaveBeenCalledWith('7', '3', { name: 'N' }, STALE_MS);

    await c.remove(user, '3', STALE_HEADER);
    expect(projects.delete).toHaveBeenCalledWith('7', '3', STALE_MS);
  });

  it('goals: update and remove', async () => {
    const goals = { update: jest.fn(), delete: jest.fn() };
    const c = new GoalController(goals as never);

    await c.update(user, '4', { title: 'G' }, STALE_HEADER);
    expect(goals.update).toHaveBeenCalledWith('7', '4', { title: 'G' }, undefined, STALE_MS);

    await c.remove(user, '4', STALE_HEADER);
    expect(goals.delete).toHaveBeenCalledWith('7', '4', undefined, STALE_MS);
  });

  it('a request without the header passes undefined (unconditional write)', async () => {
    const notes = { update: jest.fn() };
    await new NoteController(notes as never).update(user, '9', { title: 'T' });
    expect(notes.update).toHaveBeenCalledWith('7', '9', { title: 'T' }, undefined);
  });

  it('a malformed header is rejected with 400 before touching the service', async () => {
    const notes = { delete: jest.fn() };
    const c = new NoteController(notes as never);

    await expect(async () => c.remove(user, '9', 'not-a-number')).rejects.toMatchObject({
      status: 400,
    });
    expect(notes.delete).not.toHaveBeenCalled();
  });
});
