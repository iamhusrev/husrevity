import { RoutineService } from './routine.service';
import { ApiException } from '../common/api.exception';

describe('RoutineService single-entity getters', () => {
  const ownerId = '1';
  const now = new Date('2026-01-01T00:00:00Z');
  let segments: { findOne: jest.Mock };
  let activities: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let service: RoutineService;

  const activityQuery = (result: unknown) => {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
    };
    activities.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  beforeEach(() => {
    segments = { findOne: jest.fn() };
    activities = { find: jest.fn(), createQueryBuilder: jest.fn() };
    service = new RoutineService(segments as never, activities as never, {} as never);
  });

  describe('getSegment', () => {
    it('returns the owner-scoped segment with its ordered activities', async () => {
      segments.findOne.mockResolvedValueOnce({
        id: '3',
        ownerId,
        name: 'Morning',
        startMinute: 360,
        endMinute: 480,
        daysOfWeek: 127,
        createdAt: now,
        updatedAt: now,
      });
      activities.find.mockResolvedValueOnce([
        { id: '8', segmentId: '3', text: 'Read', position: 0, createdAt: now, updatedAt: now },
      ]);

      const result = await service.getSegment(ownerId, '3');

      expect(segments.findOne).toHaveBeenCalledWith({ where: { id: '3', ownerId } });
      expect(activities.find).toHaveBeenCalledWith({
        where: { segmentId: '3' },
        order: { position: 'ASC', id: 'ASC' },
      });
      expect(result).toMatchObject({ id: '3', name: 'Morning' });
      expect(result.activities).toHaveLength(1);
    });

    it('throws notFound for a missing or foreign segment', async () => {
      segments.findOne.mockResolvedValueOnce(null);

      await expect(service.getSegment(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('getActivity', () => {
    it('returns an activity whose segment belongs to the owner', async () => {
      const qb = activityQuery({
        id: '8',
        segmentId: '3',
        text: 'Read',
        position: 0,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.getActivity(ownerId, '8');

      expect(qb.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        's',
        expect.stringContaining('s.owner_id = :ownerId'),
        { ownerId },
      );
      expect(result).toMatchObject({ id: '8', text: 'Read' });
    });

    it('throws notFound when the activity is missing or in another owner segment', async () => {
      activityQuery(null);

      await expect(service.getActivity(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
  });
});
