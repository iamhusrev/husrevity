import { LearningItem } from '../learning/learning-item.entity';
import { LearningSubtopic } from '../learning/learning-subtopic.entity';
import { LearningTopic } from '../learning/learning-topic.entity';
import { applyLearningUndo, UndoContext } from './learning-undo';
import { ChangeEntry } from './entities/change-entry.entity';

describe('applyLearningUndo', () => {
  const ownerId = '1';
  const deletedAt = new Date('2026-05-02T09:00:00Z');
  const repos = new Map<unknown, { findOne: jest.Mock; update: jest.Mock }>();
  let ctx: UndoContext;

  const entry = (over: Partial<ChangeEntry>): ChangeEntry =>
    ({
      targetType: 'learning_topic',
      targetId: 't1',
      op: 'update',
      before: null,
      after: null,
      ...over,
    }) as ChangeEntry;

  beforeEach(() => {
    repos.clear();
    for (const entity of [LearningTopic, LearningSubtopic, LearningItem])
      repos.set(entity, { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) });
    ctx = {
      manager: { getRepository: (entity: unknown) => repos.get(entity) } as never,
      ownerId,
      latestAfterMs: new Map(),
      initialUpdatedMs: new Map(),
    };
  });

  const topicRepo = () => repos.get(LearningTopic)!;
  const subtopicRepo = () => repos.get(LearningSubtopic)!;
  const itemRepo = () => repos.get(LearningItem)!;

  describe('update', () => {
    it('writes the whitelisted before fields back to the topic', async () => {
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, updatedAt: new Date(1000) });

      const conflict = await applyLearningUndo(
        ctx,
        entry({ before: { position: 3, title: 'Old', ownerId: '99', id: 'x' } }),
      );

      expect(conflict).toBeNull();
      expect(topicRepo().update).toHaveBeenCalledWith({ id: 't1' }, { position: 3, title: 'Old' });
    });

    it('restores subtopicId and position of an item moved between subtopics', async () => {
      itemRepo().findOne.mockResolvedValue({ id: 'i1', topicId: 't1', updatedAt: new Date(1000) });
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId });

      await applyLearningUndo(
        ctx,
        entry({
          targetType: 'learning_item',
          targetId: 'i1',
          before: { subtopicId: 's1', position: 2 },
        }),
      );

      expect(itemRepo().update).toHaveBeenCalledWith(
        { id: 'i1' },
        { subtopicId: 's1', position: 2 },
      );
    });

    it('reports a conflict when the row changed after the change set', async () => {
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, updatedAt: new Date(5000) });
      ctx.latestAfterMs.set('learning_topic:t1', 2000);

      const conflict = await applyLearningUndo(ctx, entry({ before: { position: 3 } }));

      expect(conflict).toMatch(/modified after/);
      expect(topicRepo().update).not.toHaveBeenCalled();
    });

    it('does not report a conflict against its own earlier undo of the same target', async () => {
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, updatedAt: new Date(1000) });
      ctx.latestAfterMs.set('learning_topic:t1', 2000);

      await applyLearningUndo(ctx, entry({ before: { position: 3 } }));
      // The first undo bumped updatedAt; the second entry for the same target must still apply.
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, updatedAt: new Date(9000) });
      const conflict = await applyLearningUndo(ctx, entry({ before: { title: 'Old' } }));

      expect(conflict).toBeNull();
      expect(topicRepo().update).toHaveBeenCalledTimes(2);
    });

    it('reports a conflict for a missing row', async () => {
      topicRepo().findOne.mockResolvedValue(null);

      expect(await applyLearningUndo(ctx, entry({ before: { position: 1 } }))).toMatch(/not found/);
    });

    it("reports not_owner for another user's topic", async () => {
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId: '2', updatedAt: new Date(1) });

      expect(await applyLearningUndo(ctx, entry({ before: { position: 1 } }))).toBe('not_owner');
      expect(topicRepo().update).not.toHaveBeenCalled();
    });

    it("reports not_owner for an item of another user's topic", async () => {
      itemRepo().findOne.mockResolvedValue({ id: 'i1', topicId: 't1', updatedAt: new Date(1) });
      topicRepo().findOne.mockResolvedValue(null);

      expect(
        await applyLearningUndo(
          ctx,
          entry({ targetType: 'learning_item', targetId: 'i1', before: { position: 1 } }),
        ),
      ).toBe('not_owner');
    });
  });

  describe('delete', () => {
    it('restores a deleted topic together with children deleted at the same moment', async () => {
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt });

      const conflict = await applyLearningUndo(ctx, entry({ op: 'delete' }));

      expect(conflict).toBeNull();
      expect(itemRepo().update).toHaveBeenCalledWith(
        { topicId: 't1', deletedAt },
        { deletedAt: null },
      );
      expect(subtopicRepo().update).toHaveBeenCalledWith(
        { topicId: 't1', deletedAt },
        { deletedAt: null },
      );
      expect(topicRepo().update).toHaveBeenCalledWith({ id: 't1' }, { deletedAt: null });
    });

    it('is a no-op success when the topic is already restored', async () => {
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt: null });

      expect(await applyLearningUndo(ctx, entry({ op: 'delete' }))).toBeNull();
      expect(topicRepo().update).not.toHaveBeenCalled();
    });

    it('restores a deleted subtopic with its items', async () => {
      subtopicRepo().findOne.mockResolvedValue({ id: 's1', topicId: 't1', deletedAt });
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId });

      await applyLearningUndo(
        ctx,
        entry({ targetType: 'learning_subtopic', targetId: 's1', op: 'delete' }),
      );

      expect(itemRepo().update).toHaveBeenCalledWith(
        { subtopicId: 's1', deletedAt },
        { deletedAt: null },
      );
      expect(subtopicRepo().update).toHaveBeenCalledWith({ id: 's1' }, { deletedAt: null });
    });

    it('restores a deleted item', async () => {
      itemRepo().findOne.mockResolvedValue({ id: 'i1', topicId: 't1', deletedAt });
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId });

      await applyLearningUndo(
        ctx,
        entry({ targetType: 'learning_item', targetId: 'i1', op: 'delete' }),
      );

      expect(itemRepo().update).toHaveBeenCalledWith({ id: 'i1' }, { deletedAt: null });
    });
  });

  describe('delete undo safety', () => {
    it('refuses to restore a subtopic under a deleted topic and changes nothing', async () => {
      subtopicRepo().findOne.mockResolvedValue({ id: 's1', topicId: 't1', deletedAt });
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt: new Date(1) });

      const conflict = await applyLearningUndo(
        ctx,
        entry({ targetType: 'learning_subtopic', targetId: 's1', op: 'delete' }),
      );

      expect(conflict).toMatch(/parent topic/i);
      expect(subtopicRepo().update).not.toHaveBeenCalled();
      expect(itemRepo().update).not.toHaveBeenCalled();
    });

    it('refuses to restore an item under a deleted topic or a deleted subtopic', async () => {
      itemRepo().findOne.mockResolvedValue({
        id: 'i1',
        topicId: 't1',
        subtopicId: 's1',
        deletedAt,
      });
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt: new Date(1) });

      expect(
        await applyLearningUndo(
          ctx,
          entry({ targetType: 'learning_item', targetId: 'i1', op: 'delete' }),
        ),
      ).toMatch(/parent topic/i);

      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt: null });
      subtopicRepo().findOne.mockResolvedValue({ id: 's1', topicId: 't1', deletedAt: new Date(1) });

      expect(
        await applyLearningUndo(
          ctx,
          entry({ targetType: 'learning_item', targetId: 'i1', op: 'delete' }),
        ),
      ).toMatch(/parent subtopic/i);
      expect(itemRepo().update).not.toHaveBeenCalled();
    });

    it('remembers which topics got rows back, so their review notifications can be re-queued', async () => {
      ctx.restoredTopicIds = new Set();
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt });
      await applyLearningUndo(ctx, entry({ op: 'delete' }));

      itemRepo().findOne.mockResolvedValue({
        id: 'i9',
        topicId: 't7',
        subtopicId: null,
        deletedAt,
      });
      topicRepo().findOne.mockResolvedValue({ id: 't7', ownerId, deletedAt: null });
      await applyLearningUndo(
        ctx,
        entry({ targetType: 'learning_item', targetId: 'i9', op: 'delete' }),
      );

      expect([...ctx.restoredTopicIds].sort()).toEqual(['t1', 't7']);
    });

    it('does not record a topic when nothing was restored', async () => {
      ctx.restoredTopicIds = new Set();
      topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt: null });

      await applyLearningUndo(ctx, entry({ op: 'delete' }));

      expect(ctx.restoredTopicIds.size).toBe(0);
    });
  });

  it('refuses ops it cannot undo', async () => {
    topicRepo().findOne.mockResolvedValue({ id: 't1', ownerId, updatedAt: new Date(1) });

    expect(await applyLearningUndo(ctx, entry({ op: 'create' }))).toMatch(/unsupported/);
  });
});
