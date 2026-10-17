import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GoalService } from './goal.service';
import { Goal } from './goal.entity';
import { ApiException } from '../common/api.exception';

type MockGoalRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
  restore: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function makeQueryBuilder(rows: Goal[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.addOrderBy = jest.fn().mockReturnValue(qb);
  qb.take = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('GoalService', () => {
  const ownerId = '1';
  const otherOwnerId = '2';

  let service: GoalService;
  let goals: MockGoalRepo;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    goals = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v) => ({ id: '1', ...v })),
      save: jest.fn((v) =>
        Promise.resolve({
          id: '1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          ...v,
        }),
      ),
      softRemove: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => makeQueryBuilder([])),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        GoalService,
        { provide: getRepositoryToken(Goal), useValue: goals },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(GoalService);
  });

  describe('owner-scoping', () => {
    it('throws 404 (never 403) when getting goal belonging to another owner', async () => {
      goals.findOne.mockResolvedValue(null);
      await expect(service.get(ownerId, '999')).rejects.toThrow(ApiException);
      await expect(service.get(ownerId, '999')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 404 when updating goal belonging to another owner', async () => {
      goals.findOne.mockResolvedValue(null);
      await expect(service.update(ownerId, '999', { title: 'New' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 404 when deleting goal belonging to another owner', async () => {
      goals.findOne.mockResolvedValue(null);
      await expect(service.delete(ownerId, '999')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 404 when restoring goal belonging to another owner', async () => {
      goals.findOne.mockResolvedValue(null);
      await expect(service.restore(ownerId, '999')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('period & horizon validation', () => {
    it('throws 400 when periodEnd < periodStart', async () => {
      await expect(
        service.create(ownerId, {
          title: 'Invalid',
          horizon: 'month',
          periodStart: '2026-02-01',
          periodEnd: '2026-01-31',
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('throws 400 when year goal spans more than 366 days', async () => {
      await expect(
        service.create(ownerId, {
          title: 'Too Long Year',
          horizon: 'year',
          periodStart: '2026-01-01',
          periodEnd: '2027-01-03', // 368 days
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('accepts a leap year spanning 366 days', async () => {
      const g = await service.create(ownerId, {
        title: 'Leap Year',
        horizon: 'year',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31',
      });
      expect(g.title).toBe('Leap Year');
    });

    it('throws 400 when quarter goal spans more than 93 days', async () => {
      await expect(
        service.create(ownerId, {
          title: 'Too Long Quarter',
          horizon: 'quarter',
          periodStart: '2026-01-01',
          periodEnd: '2026-04-15', // > 93 days
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('accepts a quarter goal spanning 92 days', async () => {
      const g = await service.create(ownerId, {
        title: 'Q1',
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
      });
      expect(g.title).toBe('Q1');
    });

    it('throws 400 when month goal spans more than 31 days', async () => {
      await expect(
        service.create(ownerId, {
          title: 'Too Long Month',
          horizon: 'month',
          periodStart: '2026-01-01',
          periodEnd: '2026-02-02', // 33 days
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('accepts a month goal spanning 31 days', async () => {
      const g = await service.create(ownerId, {
        title: 'January',
        horizon: 'month',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      });
      expect(g.title).toBe('January');
    });

    it.each([
      ['2026-02-30', 'invalid day 30 for February'],
      ['2026-13-01', 'invalid month 13'],
      ['2026-2-3', 'missing leading zeros'],
      ['2026-10-12T00:00:00Z', 'ISO timestamp with time and zone'],
    ])('rejects invalid calendar date %s on create/update with 400', async (badDate) => {
      await expect(
        service.create(ownerId, {
          title: 'Bad Date',
          horizon: 'month',
          periodStart: badDate,
          periodEnd: '2026-03-31',
        }),
      ).rejects.toMatchObject({
        status: 400,
      });

      await expect(
        service.create(ownerId, {
          title: 'Bad Date',
          horizon: 'month',
          periodStart: '2026-01-01',
          periodEnd: badDate,
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('rejects invalid from/to dates on list with 400', async () => {
      await expect(
        service.list(ownerId, { from: '2026-02-30' }),
      ).rejects.toMatchObject({
        status: 400,
      });

      await expect(
        service.list(ownerId, { to: '2026-13-01' }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('hierarchy & parent validation', () => {
    it('throws 404 if parent belongs to another owner or is not found', async () => {
      goals.findOne.mockResolvedValue(null);
      await expect(
        service.create(ownerId, {
          title: 'Child',
          horizon: 'month',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          parentGoalId: '99',
        }),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 400 if parent horizon is not strictly larger (e.g. month child with month parent)', async () => {
      goals.findOne.mockResolvedValue({
        id: '10',
        ownerId,
        horizon: 'month',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      });
      await expect(
        service.create(ownerId, {
          title: 'Child',
          horizon: 'month',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          parentGoalId: '10',
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('throws 400 if year goal tries to have a parent', async () => {
      goals.findOne.mockResolvedValue({
        id: '10',
        ownerId,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
      });
      await expect(
        service.create(ownerId, {
          title: 'Year Child',
          horizon: 'year',
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          parentGoalId: '10',
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('throws 400 if parent period does not contain child period', async () => {
      goals.findOne.mockResolvedValue({
        id: '10',
        ownerId,
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
      });
      await expect(
        service.create(ownerId, {
          title: 'April Month',
          horizon: 'month',
          periodStart: '2026-04-01',
          periodEnd: '2026-04-30',
          parentGoalId: '10',
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('detects direct self-reference cycle on update', async () => {
      const existing: Goal = {
        id: '5',
        ownerId,
        title: 'Q1',
        notes: null,
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      goals.findOne.mockResolvedValue(existing);

      await expect(
        service.update(ownerId, '5', { parentGoalId: '5' }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('detects indirect cycle and depth cap', async () => {
      // Setup chain: 1 -> 2 -> 3 -> 4 -> 5 -> 6
      const goalMap: Record<string, any> = {
        '1': { id: '1', ownerId, horizon: 'year', periodStart: '2026-01-01', periodEnd: '2026-12-31', parentGoalId: null },
        '2': { id: '2', ownerId, horizon: 'quarter', periodStart: '2026-01-01', periodEnd: '2026-03-31', parentGoalId: '1' },
        '3': { id: '3', ownerId, horizon: 'month', periodStart: '2026-01-01', periodEnd: '2026-01-31', parentGoalId: '2' },
      };
      goals.findOne.mockImplementation(async ({ where }: any) => {
        return goalMap[where.id] ?? null;
      });

      // Goal 1 cannot have Goal 3 as parent (cycle: 3 -> 2 -> 1 -> 3)
      await expect(
        service.update(ownerId, '1', { parentGoalId: '3' }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('If-Match', () => {
    const UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');
    const row = (): Goal => ({
      id: '1',
      ownerId,
      title: 'Year Goal',
      notes: null,
      horizon: 'year',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      parentGoalId: null,
      status: 'active',
      createdAt: UPDATED_AT,
      createdById: null,
      updatedAt: UPDATED_AT,
      updatedById: null,
      deletedAt: null,
    });

    it('update throws 409 and saves nothing when ifMatchMs is stale', async () => {
      goals.findOne.mockResolvedValue(row());

      await expect(
        service.update(ownerId, '1', { title: 'New' }, undefined, UPDATED_AT.getTime() - 1),
      ).rejects.toMatchObject({ status: 409 });
      expect(goals.save).not.toHaveBeenCalled();
    });

    it('update applies when ifMatchMs equals updatedAt', async () => {
      goals.findOne.mockResolvedValue(row());

      const result = await service.update(
        ownerId,
        '1',
        { title: 'New' },
        undefined,
        UPDATED_AT.getTime(),
      );

      expect(result.title).toBe('New');
    });

    it('delete throws 409 and removes nothing when ifMatchMs is stale', async () => {
      goals.findOne.mockResolvedValue(row());

      await expect(
        service.delete(ownerId, '1', undefined, UPDATED_AT.getTime() - 1),
      ).rejects.toMatchObject({ status: 409 });
      expect(goals.softRemove).not.toHaveBeenCalled();
    });

    it('delete proceeds when ifMatchMs equals updatedAt', async () => {
      goals.findOne.mockResolvedValue(row());

      await service.delete(ownerId, '1', undefined, UPDATED_AT.getTime());

      expect(goals.softRemove).toHaveBeenCalled();
    });
  });

  describe('soft delete and restore', () => {
    it('soft deletes a goal leaving children in place', async () => {
      const existing: Goal = {
        id: '1',
        ownerId,
        title: 'Year Goal',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      goals.findOne.mockResolvedValue(existing);

      await service.delete(ownerId, '1');
      expect(goals.softRemove).toHaveBeenCalledWith(existing);
    });

    it('restores a soft-deleted goal', async () => {
      const deletedGoal: Goal = {
        id: '1',
        ownerId,
        title: 'Year Goal',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: new Date('2026-01-02'),
      };
      goals.findOne
        .mockResolvedValueOnce(deletedGoal) // for findOne withDeleted
        .mockResolvedValueOnce({ ...deletedGoal, deletedAt: null }); // after restore

      const res = await service.restore(ownerId, '1');
      expect(goals.restore).toHaveBeenCalledWith({ id: '1', ownerId });
      expect(res.id).toBe('1');
    });

    it('delete a year goal, PATCH its child status to done works (treated as root)', async () => {
      const child: Goal = {
        id: '2',
        ownerId,
        title: 'Quarter Goal',
        notes: null,
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        parentGoalId: '1', // Parent 1 is soft-deleted
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      // findOne returns child, but parent 1 is soft-deleted so any findOne for '1' returns null
      goals.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === '2') return child;
        if (where.id === '1') return null; // deleted parent
        return null;
      });

      const res = await service.update(ownerId, '2', { status: 'done' });
      expect(res.status).toBe('done');
    });

    it('restore a child whose parent is deleted yields a root (clears parentGoalId)', async () => {
      const deletedChild: Goal = {
        id: '2',
        ownerId,
        title: 'Quarter Goal',
        notes: null,
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        parentGoalId: '1', // Parent 1 is deleted
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: new Date('2026-01-02'),
      };
      goals.findOne.mockImplementation(async ({ where, withDeleted }: any) => {
        if (where.id === '2' && withDeleted) return deletedChild;
        if (where.id === '2' && !withDeleted) return { ...deletedChild, deletedAt: null };
        if (where.id === '1') return null; // Parent 1 is not live
        return null;
      });

      const res = await service.restore(ownerId, '2');
      expect(goals.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: '2', parentGoalId: null }),
      );
      expect(res.parentGoalId).toBeNull();
    });

    it('a PATCH that echoes an unchanged, now-deleted parentGoalId does not fail (stale value from a GET)', async () => {
      const child: Goal = {
        id: '2',
        ownerId,
        title: 'Quarter Goal',
        notes: null,
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        parentGoalId: '1', // parent 1 was soft-deleted after the child was created
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      goals.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === '2') return { ...child };
        return null; // parent 1 is not live
      });

      const res = await service.update(ownerId, '2', { parentGoalId: '1', status: 'done' });
      expect(res.status).toBe('done');
    });
  });

  describe('liveSubtreeIds', () => {
    it('returns the goal and all live descendants, scoped to the owner', async () => {
      goals.find.mockResolvedValueOnce([
        { id: '1', parentGoalId: null },
        { id: '2', parentGoalId: '1' },
        { id: '3', parentGoalId: '2' },
        { id: '4', parentGoalId: '9' },
      ]);

      const ids = await service.liveSubtreeIds(ownerId, '1');

      expect([...ids].sort()).toEqual(['1', '2', '3']);
      expect(goals.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId } }),
      );
    });

    it('returns just the goal when it has no live descendants', async () => {
      goals.find.mockResolvedValueOnce([{ id: '1', parentGoalId: null }]);
      expect(await service.liveSubtreeIds(ownerId, '1')).toEqual(['1']);
    });
  });

  describe('progress calculation', () => {
    it('returns 0% when no items exist', async () => {
      const existing: Goal = {
        id: '1',
        ownerId,
        title: 'Year Goal',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      goals.findOne.mockResolvedValue(existing);
      goals.find.mockResolvedValue([existing]);
      dataSource.query.mockResolvedValue([]); // no items

      const res = await service.get(ownerId, '1');
      expect(res.progress).toEqual({
        total: 0,
        done: 0,
        open: 0,
        percent: 0,
      });
    });

    it('computes progress from direct items and project items, excluding cancelled items', async () => {
      const goal1: Goal = {
        id: '1',
        ownerId,
        title: 'Year Goal',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      goals.findOne.mockResolvedValue(goal1);
      goals.find.mockResolvedValue([goal1]);
      dataSource.query.mockResolvedValue([
        { g_id: '1', item_id: '101', status: 'done' },
        { g_id: '1', item_id: '102', status: 'open' },
        // Item 101 also returned via project (duplicate deduplicated)
        { g_id: '1', item_id: '101', status: 'done' },
      ]);

      const res = await service.get(ownerId, '1');
      expect(res.progress).toEqual({
        total: 2,
        done: 1,
        open: 1,
        percent: 50,
      });
    });

    it('rolls up progress from live descendant goals', async () => {
      const yearGoal: Goal = {
        id: '1',
        ownerId,
        title: 'Year',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      const qGoal: Goal = {
        id: '2',
        ownerId,
        title: 'Q1',
        notes: null,
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        parentGoalId: '1',
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      const monthGoal: Goal = {
        id: '3',
        ownerId,
        title: 'Jan',
        notes: null,
        horizon: 'month',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        parentGoalId: '2',
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };

      goals.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === '1') return yearGoal;
        if (where.id === '2') return qGoal;
        if (where.id === '3') return monthGoal;
        return null;
      });
      goals.find.mockResolvedValue([yearGoal, qGoal, monthGoal]);

      dataSource.query.mockResolvedValue([
        { g_id: '1', item_id: '10', status: 'done' },
        { g_id: '2', item_id: '20', status: 'done' },
        { g_id: '3', item_id: '30', status: 'open' },
        { g_id: '3', item_id: '40', status: 'open' },
      ]);

      // Year goal has items 10 (done), 20 (done), 30 (open), 40 (open) => 2 done / 4 total = 50%
      const yearRes = await service.get(ownerId, '1');
      expect(yearRes.progress).toEqual({
        total: 4,
        done: 2,
        open: 2,
        percent: 50,
      });

      // Q1 goal has items 20 (done), 30 (open), 40 (open) => 1 done / 3 total = 33%
      const qRes = await service.get(ownerId, '2');
      expect(qRes.progress).toEqual({
        total: 3,
        done: 1,
        open: 2,
        percent: 33,
      });

      // Month goal has items 30 (open), 40 (open) => 0 done / 2 total = 0%
      const monthRes = await service.get(ownerId, '3');
      expect(monthRes.progress).toEqual({
        total: 2,
        done: 0,
        open: 2,
        percent: 0,
      });
    });

    it('computes list progress with a bounded number of grouped queries', async () => {
      const g1: Goal = {
        id: '1',
        ownerId,
        title: 'Goal 1',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      const g2: Goal = {
        id: '2',
        ownerId,
        title: 'Goal 2',
        notes: null,
        horizon: 'quarter',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };

      goals.createQueryBuilder.mockReturnValue(makeQueryBuilder([g1, g2]));
      goals.find.mockResolvedValue([g1, g2]);
      dataSource.query.mockResolvedValue([
        { g_id: '1', item_id: '1', status: 'done' },
        { g_id: '2', item_id: '2', status: 'open' },
      ]);

      const list = await service.list(ownerId, {});
      expect(list).toHaveLength(2);
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });

    it('uses bigint[] inside UNION arms without casting to text in progress query', async () => {
      const g1: Goal = {
        id: '1',
        ownerId,
        title: 'Goal 1',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      };
      goals.findOne.mockResolvedValue(g1);
      goals.find.mockResolvedValue([g1]);
      dataSource.query.mockResolvedValue([]);

      await service.get(ownerId, '1');

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const sql: string = dataSource.query.mock.calls[0][0];
      expect(sql).toContain('::bigint[]');
      expect(sql).not.toContain('::text');
    });

    it('counts only visible items: live projects and live memberships, for both link kinds', async () => {
      const g1 = {
        id: '1',
        ownerId,
        title: 'Goal 1',
        notes: null,
        horizon: 'year',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        parentGoalId: null,
        status: 'active',
        createdAt: new Date(),
        createdById: null,
        updatedAt: new Date(),
        updatedById: null,
        deletedAt: null,
      } as Goal;
      goals.findOne.mockResolvedValue(g1);
      goals.find.mockResolvedValue([g1]);
      dataSource.query.mockResolvedValue([]);

      await service.get(ownerId, '1');

      const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
      const [direct, viaProject] = sql.split('UNION ALL');
      // direct arm: personal rows are owner-only, project rows need live project + live member
      expect(direct).toContain('i.project_id IS NULL AND i.owner_id = $2');
      expect(direct).toContain('lp.deleted_at IS NULL');
      expect(direct).toContain('pm.deleted_at IS NULL');
      expect(direct).toContain('pm.user_id = $2');
      // project-linked arm: live project and live member
      expect(viaProject).toContain('p.deleted_at IS NULL');
      expect(viaProject).toContain('pm.deleted_at IS NULL');
      expect(viaProject).toContain('pm.user_id = $2');
      expect(params).toEqual([['1'], ownerId]);
    });
  });
});
