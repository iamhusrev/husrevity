import { Test } from '@nestjs/testing';
import { GoalController } from './goal.controller';
import { GoalService } from './goal.service';
import { GoalResponseDto } from './dto/goal-dtos';
import { AuthenticatedUser } from '../common/current-user.decorator';
import { ApiException } from '../common/api.exception';

describe('GoalController contract', () => {
  let controller: GoalController;
  let service: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    restore: jest.Mock;
  };

  const user: AuthenticatedUser = {
    userId: '1',
    email: 'test@example.com',
    role: 'ROLE_USER',
  };

  const sampleGoal: GoalResponseDto = {
    id: '10',
    ownerId: '1',
    title: 'Q1 Launch',
    notes: 'Important notes',
    horizon: 'quarter',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    parentGoalId: null,
    status: 'active',
    progress: {
      total: 10,
      done: 5,
      open: 5,
      percent: 50,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([sampleGoal]),
      get: jest.fn().mockResolvedValue(sampleGoal),
      create: jest.fn().mockResolvedValue(sampleGoal),
      update: jest.fn().mockResolvedValue(sampleGoal),
      delete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(sampleGoal),
    };

    const module = await Test.createTestingModule({
      controllers: [GoalController],
      providers: [{ provide: GoalService, useValue: service }],
    }).compile();

    controller = module.get(GoalController);
  });

  it('GET /api/goals returns array of goals with progress', async () => {
    const res = await controller.list(user, { horizon: 'quarter' });
    expect(res).toEqual([sampleGoal]);
    expect(service.list).toHaveBeenCalledWith('1', { horizon: 'quarter' });
  });

  it('GET /api/goals/:id returns goal by id', async () => {
    const res = await controller.get(user, '10');
    expect(res).toEqual(sampleGoal);
    expect(service.get).toHaveBeenCalledWith('1', '10');
  });

  it('GET /api/goals/:id rejects id exceeding int64 max with 400', async () => {
    const hugeId = '9223372036854775808'; // BIGINT_MAX + 1
    try {
      await controller.get(user, hugeId);
      fail('should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiException);
      expect(err.getStatus()).toBe(400);
    }
  });

  it('POST /api/goals creates goal and returns 201 shape', async () => {
    const dto = {
      title: 'Q1 Launch',
      horizon: 'quarter' as const,
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
    };
    const res = await controller.create(user, dto);
    expect(res).toEqual(sampleGoal);
    expect(service.create).toHaveBeenCalledWith('1', dto);
  });

  it('PATCH /api/goals/:id updates goal', async () => {
    const res = await controller.update(user, '10', { title: 'Updated' });
    expect(res).toEqual(sampleGoal);
    expect(service.update).toHaveBeenCalledWith('1', '10', { title: 'Updated' });
  });

  it('PATCH /api/goals/:id rejects id exceeding int64 max with 400', async () => {
    const hugeId = '99999999999999999999';
    try {
      await controller.update(user, hugeId, { title: 'Updated' });
      fail('should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiException);
      expect(err.getStatus()).toBe(400);
    }
  });

  it('DELETE /api/goals/:id removes goal', async () => {
    await controller.remove(user, '10');
    expect(service.delete).toHaveBeenCalledWith('1', '10');
  });

  it('DELETE /api/goals/:id rejects id exceeding int64 max with 400', async () => {
    const hugeId = '9223372036854775808';
    try {
      await controller.remove(user, hugeId);
      fail('should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiException);
      expect(err.getStatus()).toBe(400);
    }
  });

  it('PATCH /api/goals/:id/restore restores goal', async () => {
    const res = await controller.restore(user, '10');
    expect(res).toEqual(sampleGoal);
    expect(service.restore).toHaveBeenCalledWith('1', '10');
  });

  it('propagates 404 when goal belongs to another owner or is not found', async () => {
    service.get.mockRejectedValue(ApiException.notFound('Goal not found'));
    await expect(controller.get(user, '999')).rejects.toMatchObject({
      status: 404,
    });
  });

  describe('DTO validation', () => {
    const { validate } = require('class-validator');
    const { plainToInstance } = require('class-transformer');
    const {
      GoalRequestDto,
      GoalUpdateRequestDto,
      GoalListQueryDto,
    } = require('./dto/goal-dtos');

    it('rejects empty string parentGoalId on create with validation error', async () => {
      const dto = plainToInstance(GoalRequestDto, {
        title: 'Title',
        horizon: 'month',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        parentGoalId: '',
      });
      const errors = await validate(dto);
      expect(errors.some((e: any) => e.property === 'parentGoalId')).toBe(true);
    });

    it('accepts null, valid numeric string or omission for parentGoalId on create', async () => {
      for (const parentGoalId of [null, '123', undefined]) {
        const dto = plainToInstance(GoalRequestDto, {
          title: 'Title',
          horizon: 'month',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          parentGoalId,
        });
        const errors = await validate(dto);
        expect(errors.some((e: any) => e.property === 'parentGoalId')).toBe(false);
      }
    });

    it('rejects empty string parentGoalId on update with validation error', async () => {
      const dto = plainToInstance(GoalUpdateRequestDto, {
        parentGoalId: '',
      });
      const errors = await validate(dto);
      expect(errors.some((e: any) => e.property === 'parentGoalId')).toBe(true);
    });

    it('accepts null, valid numeric string or omission for parentGoalId on update', async () => {
      for (const parentGoalId of [null, '123', undefined]) {
        const dto = plainToInstance(GoalUpdateRequestDto, { parentGoalId });
        const errors = await validate(dto);
        expect(errors.some((e: any) => e.property === 'parentGoalId')).toBe(false);
      }
    });

    it.each([
      '2026-02-30',
      '2026-13-01',
      '2026-2-3',
      '2026-10-12T00:00:00Z',
    ])('rejects invalid date %s on DTOs', async (badDate) => {
      const createDto = plainToInstance(GoalRequestDto, {
        title: 'Title',
        horizon: 'month',
        periodStart: badDate,
        periodEnd: '2026-03-31',
      });
      const createErrors = await validate(createDto);
      expect(createErrors.some((e: any) => e.property === 'periodStart')).toBe(true);

      const updateDto = plainToInstance(GoalUpdateRequestDto, {
        periodEnd: badDate,
      });
      const updateErrors = await validate(updateDto);
      expect(updateErrors.some((e: any) => e.property === 'periodEnd')).toBe(true);

      const listDto = plainToInstance(GoalListQueryDto, {
        from: badDate,
      });
      const listErrors = await validate(listDto);
      expect(listErrors.some((e: any) => e.property === 'from')).toBe(true);
    });
  });
});
