import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlanService } from './plan.service';
import { Plan } from './plan.entity';
import { PlanItem } from './plan-item.entity';
import { ApiException } from '../common/api.exception';

type MockPlanRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
};

type MockQueryBuilder = {
  innerJoin: jest.Mock;
  where: jest.Mock;
  withDeleted: jest.Mock;
  getOne: jest.Mock;
};

function makeQueryBuilder(getOneResults: unknown[]): MockQueryBuilder {
  const qb: Partial<MockQueryBuilder> = {};
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.withDeleted = jest.fn().mockReturnValue(qb);
  qb.getOne = jest.fn(() => Promise.resolve(getOneResults.shift()));
  return qb as MockQueryBuilder;
}

describe('PlanService', () => {
  const ownerId = '1';

  let service: PlanService;
  let plans: MockPlanRepo;
  let items: { restore: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    plans = { findOne: jest.fn(), restore: jest.fn() };
    items = { restore: jest.fn(), createQueryBuilder: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PlanService,
        { provide: getRepositoryToken(Plan), useValue: plans },
        { provide: getRepositoryToken(PlanItem), useValue: items },
      ],
    }).compile();

    service = module.get(PlanService);
  });

  describe('restore', () => {
    const id = '40';
    const deletedRow = {
      id,
      ownerId,
      title: 'Learn Rust',
      description: null,
      targetDate: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as unknown as Plan;
    const liveRow = { ...deletedRow, deletedAt: null } as unknown as Plan;

    it('restores a soft-deleted plan and returns the live DTO', async () => {
      plans.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      const result = await service.restore(ownerId, id);

      expect(plans.findOne).toHaveBeenNthCalledWith(1, {
        where: { id, ownerId },
        withDeleted: true,
      });
      expect(plans.restore).toHaveBeenCalledWith({ id, ownerId });
      expect(result.id).toBe(id);
    });

    it('throws 404 when the plan does not exist at all', async () => {
      plans.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(plans.restore).not.toHaveBeenCalled();
    });

    it('throws 404 when the plan exists but is not soft-deleted', async () => {
      plans.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(plans.restore).not.toHaveBeenCalled();
    });

    it('404s instead of restoring another owner\'s plan (owner mismatch not found by the query)', async () => {
      const otherOwnerId = '999';
      plans.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(otherOwnerId, id)).rejects.toThrow(ApiException);
      expect(plans.findOne).toHaveBeenCalledWith({
        where: { id, ownerId: otherOwnerId },
        withDeleted: true,
      });
      expect(plans.restore).not.toHaveBeenCalled();
    });
  });

  describe('restoreItem', () => {
    const itemId = '41';
    const deletedItem = {
      id: itemId,
      planId: '40',
      title: 'Chapter 1',
      done: false,
      targetDate: null,
      orderIndex: 0,
      deletedAt: new Date(),
    } as unknown as PlanItem;
    const liveItem = { ...deletedItem, deletedAt: null } as unknown as PlanItem;

    it('restores a soft-deleted plan item and returns the live DTO', async () => {
      const qb = makeQueryBuilder([deletedItem, liveItem]);
      items.createQueryBuilder.mockReturnValue(qb);

      const result = await service.restoreItem(ownerId, itemId);

      expect(qb.innerJoin).toHaveBeenCalledWith(
        Plan,
        'p',
        'p.id = i.plan_id AND p.owner_id = :ownerId',
        { ownerId },
      );
      expect(qb.withDeleted).toHaveBeenCalled();
      expect(items.restore).toHaveBeenCalledWith({ id: itemId });
      expect(result.id).toBe(itemId);
    });

    it('throws 404 when the plan item does not exist at all', async () => {
      const qb = makeQueryBuilder([null]);
      items.createQueryBuilder.mockReturnValue(qb);

      await expect(service.restoreItem(ownerId, itemId)).rejects.toThrow(ApiException);
      expect(items.restore).not.toHaveBeenCalled();
    });

    it('throws 404 when the plan item exists but is not soft-deleted', async () => {
      const qb = makeQueryBuilder([{ ...deletedItem, deletedAt: null }]);
      items.createQueryBuilder.mockReturnValue(qb);

      await expect(service.restoreItem(ownerId, itemId)).rejects.toThrow(ApiException);
      expect(items.restore).not.toHaveBeenCalled();
    });

    it('404s instead of restoring another owner\'s plan item (owner join excludes it)', async () => {
      const otherOwnerId = '999';
      const qb = makeQueryBuilder([null]); // innerJoin owner filter would exclude a foreign row
      items.createQueryBuilder.mockReturnValue(qb);

      await expect(service.restoreItem(otherOwnerId, itemId)).rejects.toThrow(ApiException);
      expect(qb.innerJoin).toHaveBeenCalledWith(
        Plan,
        'p',
        'p.id = i.plan_id AND p.owner_id = :ownerId',
        { ownerId: otherOwnerId },
      );
      expect(items.restore).not.toHaveBeenCalled();
    });
  });
});
