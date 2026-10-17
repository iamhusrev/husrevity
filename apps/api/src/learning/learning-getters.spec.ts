import { LearningService } from './learning.service';
import { ApiException } from '../common/api.exception';

describe('LearningService single-entity getters', () => {
  const ownerId = '1';
  const now = new Date('2026-01-01T00:00:00Z');
  let topics: { findOne: jest.Mock };
  let subtopics: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let items: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let service: LearningService;

  const query = (result: unknown) => ({
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  });
  const item = (over: Record<string, unknown>) => ({
    id: 'i1',
    topicId: 't1',
    subtopicId: null,
    text: 'Read ch. 1',
    position: 0,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  });

  beforeEach(() => {
    topics = { findOne: jest.fn() };
    subtopics = { find: jest.fn(), createQueryBuilder: jest.fn() };
    items = { find: jest.fn(), createQueryBuilder: jest.fn() };
    service = new LearningService(
      topics as never,
      subtopics as never,
      items as never,
      {} as never,
      {} as never,
    );
  });

  describe('getTopic', () => {
    it('returns the owner-scoped topic with direct items and subtopics nested', async () => {
      topics.findOne.mockResolvedValueOnce({
        id: 't1',
        ownerId,
        title: 'Rust',
        description: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      items.find.mockResolvedValueOnce([item({}), item({ id: 'i2', subtopicId: 's1' })]);
      subtopics.find.mockResolvedValueOnce([
        {
          id: 's1',
          topicId: 't1',
          title: 'Ownership',
          position: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.getTopic(ownerId, 't1');

      expect(topics.findOne).toHaveBeenCalledWith({ where: { id: 't1', ownerId } });
      expect(result).toMatchObject({ id: 't1', title: 'Rust' });
      expect(result.items.map((i) => i.id)).toEqual(['i1']);
      expect(result.subtopics[0].items.map((i) => i.id)).toEqual(['i2']);
    });

    it('throws notFound for a missing or foreign topic', async () => {
      topics.findOne.mockResolvedValueOnce(null);

      await expect(service.getTopic(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('getSubtopic', () => {
    it('returns a subtopic whose topic belongs to the owner, with its items', async () => {
      const qb = query({
        id: 's1',
        topicId: 't1',
        title: 'Ownership',
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      subtopics.createQueryBuilder.mockReturnValue(qb);
      items.find.mockResolvedValueOnce([item({ id: 'i2', subtopicId: 's1' })]);

      const result = await service.getSubtopic(ownerId, 's1');

      expect(qb.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        't',
        expect.stringContaining('t.owner_id = :ownerId'),
        { ownerId },
      );
      expect(result).toMatchObject({ id: 's1', title: 'Ownership' });
      expect(result.items).toHaveLength(1);
    });

    it('throws notFound for a missing or foreign subtopic', async () => {
      subtopics.createQueryBuilder.mockReturnValue(query(null));

      await expect(service.getSubtopic(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('getItem', () => {
    it('returns an item whose topic belongs to the owner', async () => {
      const qb = query(item({}));
      items.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getItem(ownerId, 'i1');

      expect(qb.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        't',
        expect.stringContaining('t.owner_id = :ownerId'),
        { ownerId },
      );
      expect(result).toMatchObject({ id: 'i1', text: 'Read ch. 1' });
    });

    it('throws notFound for a missing or foreign item', async () => {
      items.createQueryBuilder.mockReturnValue(query(null));

      await expect(service.getItem(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
  });
});
