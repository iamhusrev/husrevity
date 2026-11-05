import { ApiException } from '../common/api.exception';
import { LearningItem } from './learning-item.entity';
import { LearningSubtopic } from './learning-subtopic.entity';
import { LearningTopic } from './learning-topic.entity';
import { LearningService } from './learning.service';

type Write = { entity: unknown; set: Record<string, unknown>; id: string };

describe('LearningService reordering', () => {
  const ownerId = '1';
  const created = new Date('2026-03-01T00:00:00Z');

  let topics: { find: jest.Mock; findOne: jest.Mock };
  let subtopics: { find: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let items: { find: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let writes: Write[];
  let service: LearningService;

  /** Records every UPDATE ... SET ... WHERE id = :id issued inside the transaction. */
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
        where: jest.fn((_sql: string, params: { id: string }) => {
          state.id = params.id;
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
    getOne: jest.fn().mockResolvedValue(result),
  });

  const topic = (id: string, position: number, year: number | null = null) =>
    ({ id, ownerId, position, year, createdAt: created }) as unknown as LearningTopic;
  const row = (id: string, position: number, over: Record<string, unknown> = {}) =>
    ({ id, topicId: 't1', subtopicId: null, position, ...over }) as never;

  const positionsOf = (entity: unknown) =>
    Object.fromEntries(
      writes.filter((w) => w.entity === entity).map((w) => [w.id, w.set.position]),
    );

  beforeEach(() => {
    writes = [];
    topics = { find: jest.fn(), findOne: jest.fn() };
    subtopics = { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
    items = { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
    dataSource = {
      transaction: jest.fn(async (cb: (em: unknown) => unknown) => cb(entityManager())),
    };
    service = new LearningService(
      topics as never,
      subtopics as never,
      items as never,
      dataSource as never,
      {} as never,
    );
  });

  describe('reorderTopics', () => {
    it('renumbers every owned topic 0..n-1 when no year is given', async () => {
      topics.find.mockResolvedValue([topic('a', 0), topic('b', 1), topic('c', 2)]);

      await service.reorderTopics(ownerId, { orderedIds: ['c', 'a', 'b'] });

      expect(topics.find).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId } }));
      expect(positionsOf(LearningTopic)).toEqual({ c: 0, a: 1, b: 2 });
    });

    it('with a year, only refills that year slots and keeps other years in place', async () => {
      // Global order: a(2024) b(2025) c(2024) d(2025) e(2024)
      topics.find.mockResolvedValue([
        topic('a', 0, 2024),
        topic('b', 1, 2025),
        topic('c', 2, 2024),
        topic('d', 3, 2025),
        topic('e', 4, 2024),
      ]);

      await service.reorderTopics(ownerId, { year: 2024, orderedIds: ['e', 'a', 'c'] });

      // New global order: e b a d c
      expect(positionsOf(LearningTopic)).toEqual({ e: 0, a: 2, c: 4 });
    });

    it('resolves the year from createdAt when the stored year is null', async () => {
      topics.find.mockResolvedValue([topic('a', 0, null), topic('b', 1, 2025)]);

      await service.reorderTopics(ownerId, { year: 2026, orderedIds: ['a'] });

      expect(writes).toHaveLength(0);
    });

    it.each([
      ['a missing id', ['a', 'b']],
      ['an extra id', ['a', 'b', 'c', 'z']],
      ['a duplicate id', ['a', 'a', 'b']],
      ["another owner's id", ['a', 'b', 'foreign']],
    ])('rejects %s with 400 and writes nothing', async (_name, orderedIds) => {
      topics.find.mockResolvedValue([topic('a', 0), topic('b', 1), topic('c', 2)]);

      await expect(service.reorderTopics(ownerId, { orderedIds })).rejects.toBeInstanceOf(
        ApiException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(writes).toHaveLength(0);
    });

    it('rejects ids outside the given year', async () => {
      topics.find.mockResolvedValue([topic('a', 0, 2024), topic('b', 1, 2025)]);

      await expect(
        service.reorderTopics(ownerId, { year: 2024, orderedIds: ['a', 'b'] }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });
  });

  describe('reorderSubtopics', () => {
    it('renumbers the subtopics of an owned topic', async () => {
      topics.findOne.mockResolvedValue(topic('t1', 0));
      subtopics.find.mockResolvedValue([row('s1', 0), row('s2', 1)]);

      await service.reorderSubtopics(ownerId, 't1', { orderedIds: ['s2', 's1'] });

      expect(positionsOf(LearningSubtopic)).toEqual({ s2: 0, s1: 1 });
    });

    it("cannot reorder another user's topic", async () => {
      topics.findOne.mockResolvedValue(null);

      await expect(
        service.reorderSubtopics(ownerId, 'foreign', { orderedIds: ['s1'] }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects an incomplete set and writes nothing', async () => {
      topics.findOne.mockResolvedValue(topic('t1', 0));
      subtopics.find.mockResolvedValue([row('s1', 0), row('s2', 1)]);

      await expect(
        service.reorderSubtopics(ownerId, 't1', { orderedIds: ['s1'] }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });
  });

  describe('reorderItems (direct items of a topic)', () => {
    it('only considers items without a subtopic', async () => {
      topics.findOne.mockResolvedValue(topic('t1', 0));
      items.find.mockResolvedValue([row('i1', 0), row('i2', 1)]);

      await service.reorderItems(ownerId, 't1', { orderedIds: ['i2', 'i1'] });

      const where = items.find.mock.calls[0][0].where;
      expect(where.topicId).toBe('t1');
      expect(where.subtopicId).toBeDefined(); // IsNull() operator
      expect(positionsOf(LearningItem)).toEqual({ i2: 0, i1: 1 });
    });

    it('rejects an id that belongs to a subtopic', async () => {
      topics.findOne.mockResolvedValue(topic('t1', 0));
      items.find.mockResolvedValue([row('i1', 0)]);

      await expect(
        service.reorderItems(ownerId, 't1', { orderedIds: ['i1', 'inSubtopic'] }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(writes).toHaveLength(0);
    });
  });

  describe('reorderSubtopicItems', () => {
    it('renumbers the items of an owned subtopic', async () => {
      subtopics.createQueryBuilder.mockReturnValue(joinQuery({ id: 's1', topicId: 't1' }));
      items.find.mockResolvedValue([row('i1', 0, { subtopicId: 's1' }), row('i2', 1)]);

      await service.reorderSubtopicItems(ownerId, 's1', { orderedIds: ['i2', 'i1'] });

      expect(items.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { topicId: 't1', subtopicId: 's1' } }),
      );
      expect(positionsOf(LearningItem)).toEqual({ i2: 0, i1: 1 });
    });

    it("cannot reorder another user's subtopic", async () => {
      subtopics.createQueryBuilder.mockReturnValue(joinQuery(null));

      await expect(
        service.reorderSubtopicItems(ownerId, 'foreign', { orderedIds: [] }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('moveItem', () => {
    const moved = row('i2', 1, { subtopicId: 's1' });

    beforeEach(() => {
      items.createQueryBuilder.mockReturnValue(joinQuery(moved));
    });

    it('moves an item into another subtopic and keeps both lists consistent', async () => {
      subtopics.findOne.mockResolvedValue({ id: 's2', topicId: 't1' });
      // source list s1: i1, i2 ; target list s2: i3, i4
      items.find
        .mockResolvedValueOnce([row('i1', 0, { subtopicId: 's1' }), moved])
        .mockResolvedValueOnce([
          row('i3', 0, { subtopicId: 's2' }),
          row('i4', 1, { subtopicId: 's2' }),
        ]);

      await service.moveItem(ownerId, 'i2', { subtopicId: 's2', index: 1 });

      const itemWrites = writes.filter((w) => w.entity === LearningItem);
      expect(itemWrites.find((w) => w.id === 'i2')?.set).toEqual({ subtopicId: 's2', position: 1 });
      expect(itemWrites.find((w) => w.id === 'i4')?.set).toEqual({ position: 2 });
      expect(itemWrites.find((w) => w.id === 'i1')).toBeUndefined(); // already position 0
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('moves an item out of a subtopic to the direct list of the topic', async () => {
      items.find
        .mockResolvedValueOnce([row('i1', 0, { subtopicId: 's1' }), moved])
        .mockResolvedValueOnce([row('d1', 0)]);

      await service.moveItem(ownerId, 'i2', { subtopicId: null, index: 0 });

      const itemWrites = writes.filter((w) => w.entity === LearningItem);
      expect(itemWrites.find((w) => w.id === 'i2')?.set).toEqual({ subtopicId: null, position: 0 });
      expect(itemWrites.find((w) => w.id === 'd1')?.set).toEqual({ position: 1 });
    });

    it('reorders inside the same list when the subtopic does not change', async () => {
      items.find.mockResolvedValueOnce([row('i1', 0, { subtopicId: 's1' }), moved]);

      await service.moveItem(ownerId, 'i2', { subtopicId: 's1', index: 0 });

      expect(positionsOf(LearningItem)).toEqual({ i2: 0, i1: 1 });
    });

    it('clamps an index past the end of the target list', async () => {
      subtopics.findOne.mockResolvedValue({ id: 's2', topicId: 't1' });
      items.find
        .mockResolvedValueOnce([moved])
        .mockResolvedValueOnce([row('i3', 0, { subtopicId: 's2' })]);

      await service.moveItem(ownerId, 'i2', { subtopicId: 's2', index: 50 });

      const itemWrites = writes.filter((w) => w.entity === LearningItem);
      expect(itemWrites.find((w) => w.id === 'i2')?.set).toEqual({ subtopicId: 's2', position: 1 });
    });

    it('rejects a target subtopic of a different topic and writes nothing', async () => {
      subtopics.findOne.mockResolvedValue({ id: 'x', topicId: 'other-topic' });

      await expect(
        service.moveItem(ownerId, 'i2', { subtopicId: 'x', index: 0 }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("cannot move another user's item", async () => {
      items.createQueryBuilder.mockReturnValue(joinQuery(null));

      await expect(
        service.moveItem(ownerId, 'foreign', { subtopicId: null, index: 0 }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('append at the end of the own list', () => {
    it('puts a new item after the last item of the same subtopic, not of the topic', async () => {
      topics.findOne.mockResolvedValue(topic('t1', 0));
      subtopics.findOne.mockResolvedValue({ id: 's1', topicId: 't1' });
      items.findOne.mockResolvedValue({ position: 4 });
      const save = jest.fn(async (x: unknown) => ({ ...(x as object), id: 'new' }));
      (items as unknown as Record<string, unknown>).create = jest.fn((x: unknown) => x);
      (items as unknown as Record<string, unknown>).save = save;
      (service as unknown as { notifications: unknown }).notifications = {
        cancelForSource: jest.fn(),
        enqueue: jest.fn(),
      };

      await service.createItem(ownerId, 't1', { text: 'x', subtopicId: 's1' } as never);

      expect(items.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { topicId: 't1', subtopicId: 's1' } }),
      );
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ position: 5 }));
    });
  });
});
