import { ApiException } from '../common/api.exception';
import { LearningItem } from './learning-item.entity';
import { LearningSubtopic } from './learning-subtopic.entity';
import { LearningTopic } from './learning-topic.entity';
import { LearningService } from './learning.service';

type Write = {
  entity: unknown;
  set: Record<string, unknown>;
  sql: string;
  params: Record<string, unknown>;
};

describe('LearningService delete / restore', () => {
  const ownerId = '1';
  const now = new Date('2026-05-01T10:00:00Z');
  const deletedAt = new Date('2026-05-02T09:00:00Z');

  let topics: { findOne: jest.Mock; find: jest.Mock };
  let subtopics: { find: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let items: { find: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };
  let writes: Write[];
  let service: LearningService;

  const entityManager = () => ({
    createQueryBuilder: () => {
      const state: Partial<Write> = {};
      const qb: Record<string, jest.Mock> = {
        update: jest.fn((entity: unknown) => {
          state.entity = entity;
          return qb;
        }),
        set: jest.fn((set: Record<string, unknown>) => {
          state.set = set;
          return qb;
        }),
        where: jest.fn((sql: string, params: Record<string, unknown> = {}) => {
          state.sql = sql;
          state.params = params;
          return qb;
        }),
        execute: jest.fn(async () => {
          writes.push(state as Write);
        }),
      };
      return qb;
    },
  });

  const joinQuery = (result: unknown) => ({
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  });

  const writesFor = (entity: unknown) => writes.filter((w) => w.entity === entity);

  beforeEach(() => {
    writes = [];
    jest.useFakeTimers().setSystemTime(now);
    topics = { findOne: jest.fn(), find: jest.fn() };
    subtopics = { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
    items = { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(async (cb: (em: unknown) => unknown) => cb(entityManager())),
    };
    service = new LearningService(
      topics as never,
      subtopics as never,
      items as never,
      dataSource as never,
      notifications as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('deleteTopic', () => {
    it('stamps the topic, its subtopics and its items with the same deleted_at', async () => {
      topics.findOne.mockResolvedValue({ id: 't1', ownerId });
      items.find.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);

      await service.deleteTopic(ownerId, 't1');

      const stamps = [LearningTopic, LearningSubtopic, LearningItem].map((entity) => {
        const [write] = writesFor(entity);
        return write.set.deletedAt;
      });
      expect(stamps[0]).toBeInstanceOf(Date);
      expect(new Set(stamps.map((s) => (s as Date).getTime())).size).toBe(1);
    });

    it('only touches children that are not already deleted', async () => {
      topics.findOne.mockResolvedValue({ id: 't1', ownerId });
      items.find.mockResolvedValue([]);

      await service.deleteTopic(ownerId, 't1');

      expect(writesFor(LearningItem)[0].sql).toContain('deleted_at IS NULL');
      expect(writesFor(LearningSubtopic)[0].sql).toContain('deleted_at IS NULL');
    });

    it('cancels the notification of every item', async () => {
      topics.findOne.mockResolvedValue({ id: 't1', ownerId });
      items.find.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);

      await service.deleteTopic(ownerId, 't1');

      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'learning', 'i1');
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'learning', 'i2');
    });

    it("cannot delete another user's topic", async () => {
      topics.findOne.mockResolvedValue(null);

      await expect(service.deleteTopic(ownerId, 'foreign')).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });
  });

  describe('restoreTopic', () => {
    it('restores the topic at the end of the list and the children deleted with it', async () => {
      topics.findOne
        .mockResolvedValueOnce({ id: 't1', ownerId, deletedAt }) // lookup withDeleted
        .mockResolvedValueOnce({ position: 6 }) // last alive topic
        .mockResolvedValueOnce({ id: 't1', ownerId, title: 'T', createdAt: now, updatedAt: now });
      items.find.mockResolvedValue([]);
      subtopics.find.mockResolvedValue([]);

      await service.restoreTopic(ownerId, 't1');

      const topicWrite = writesFor(LearningTopic)[0];
      expect(topicWrite.set).toEqual({ deletedAt: null, position: 7 });
      const childWrites = [...writesFor(LearningSubtopic), ...writesFor(LearningItem)];
      expect(childWrites).toHaveLength(2);
      for (const write of childWrites) {
        expect(write.set).toEqual({ deletedAt: null });
        expect(write.params.at).toEqual(deletedAt);
      }
    });

    it('rejects a topic that is not in the trash', async () => {
      topics.findOne.mockResolvedValue({ id: 't1', ownerId, deletedAt: null });

      await expect(service.restoreTopic(ownerId, 't1')).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });

    it("cannot restore another user's topic", async () => {
      topics.findOne.mockResolvedValue(null);

      await expect(service.restoreTopic(ownerId, 'foreign')).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });
  });

  describe('deleteSubtopic', () => {
    it('stamps the subtopic and its items with the same deleted_at', async () => {
      subtopics.createQueryBuilder.mockReturnValue(
        joinQuery({ id: 's1', topicId: 't1', deletedAt: null }),
      );
      items.find.mockResolvedValue([{ id: 'i1' }]);

      await service.deleteSubtopic(ownerId, 's1');

      const a = writesFor(LearningSubtopic)[0].set.deletedAt as Date;
      const b = writesFor(LearningItem)[0].set.deletedAt as Date;
      expect(a.getTime()).toBe(b.getTime());
    });
  });

  describe('restoreSubtopic', () => {
    it('restores at the end of the topic and brings back its items', async () => {
      subtopics.createQueryBuilder.mockReturnValue(
        joinQuery({
          id: 's1',
          topicId: 't1',
          title: 'S',
          deletedAt,
          createdAt: now,
          updatedAt: now,
        }),
      );
      topics.findOne.mockResolvedValue({ id: 't1', ownerId }); // parent alive
      subtopics.findOne.mockResolvedValue({ position: 2 });
      items.find.mockResolvedValue([]);

      await service.restoreSubtopic(ownerId, 's1');

      expect(writesFor(LearningSubtopic)[0].set).toEqual({ deletedAt: null, position: 3 });
      expect(writesFor(LearningItem)[0].params.at).toEqual(deletedAt);
    });

    it('rejects restoring into a deleted topic', async () => {
      subtopics.createQueryBuilder.mockReturnValue(
        joinQuery({ id: 's1', topicId: 't1', deletedAt }),
      );
      topics.findOne.mockResolvedValue(null);

      await expect(service.restoreSubtopic(ownerId, 's1')).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });
  });

  describe('restore parent lookup errors', () => {
    it('only turns a missing parent into "restore the parent first"; real errors surface', async () => {
      subtopics.createQueryBuilder.mockReturnValue(
        joinQuery({
          id: 's1',
          topicId: 't1',
          title: 'S',
          deletedAt,
          createdAt: now,
          updatedAt: now,
        }),
      );
      const dbDown = new Error('connection terminated');
      topics.findOne.mockRejectedValue(dbDown);

      await expect(service.restoreSubtopic(ownerId, 's1')).rejects.toBe(dbDown);
      expect(writes).toHaveLength(0);
    });
  });

  describe('restoreItem', () => {
    const deletedItem = {
      id: 'i1',
      topicId: 't1',
      subtopicId: 's1',
      deletedAt,
      completedAt: null,
      reviewAt: null,
      notifyMinutesBefore: null,
    };

    it('restores an item at the end of its own list', async () => {
      items.createQueryBuilder.mockReturnValue(joinQuery({ ...deletedItem }));
      topics.findOne.mockResolvedValue({ id: 't1', ownerId });
      subtopics.findOne.mockResolvedValue({ id: 's1', topicId: 't1' });
      items.findOne.mockResolvedValue({ position: 4 });

      await service.restoreItem(ownerId, 'i1');

      expect(writesFor(LearningItem)[0].set).toEqual({ deletedAt: null, position: 5 });
    });

    it('rejects restoring an item whose subtopic is still deleted', async () => {
      items.createQueryBuilder.mockReturnValue(joinQuery({ ...deletedItem }));
      topics.findOne.mockResolvedValue({ id: 't1', ownerId });
      subtopics.findOne.mockResolvedValue(null);

      await expect(service.restoreItem(ownerId, 'i1')).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });

    it('rejects an item that is not in the trash', async () => {
      items.createQueryBuilder.mockReturnValue(joinQuery({ ...deletedItem, deletedAt: null }));

      await expect(service.restoreItem(ownerId, 'i1')).rejects.toBeInstanceOf(ApiException);
    });

    it("cannot restore another user's item", async () => {
      items.createQueryBuilder.mockReturnValue(joinQuery(null));

      await expect(service.restoreItem(ownerId, 'foreign')).rejects.toBeInstanceOf(ApiException);
    });
  });
});
