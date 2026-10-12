import { Test } from '@nestjs/testing';
import { ChangeSetController } from './change-set.controller';
import { ChangeSetService } from './change-set.service';
import { ApiException } from '../common/api.exception';
import { AuthenticatedUser } from '../common/current-user.decorator';

describe('ChangeSetController (Contract)', () => {
  let controller: ChangeSetController;
  let service: {
    list: jest.Mock;
    get: jest.Mock;
    undo: jest.Mock;
  };

  const user: AuthenticatedUser = {
    userId: '1',
    email: 'user@example.com',
    role: 'ROLE_USER',
  };

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      get: jest.fn(),
      undo: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [ChangeSetController],
      providers: [{ provide: ChangeSetService, useValue: service }],
    }).compile();

    controller = module.get(ChangeSetController);
  });

  describe('GET /change-sets', () => {
    it('returns summary list shape with entryCount, newest first', async () => {
      const summaryList = [
        {
          id: '2',
          source: 'mcp',
          label: 'create_item: Test 2',
          status: 'applied',
          createdAt: '2026-01-01T12:00:00.000Z',
          entryCount: 1,
        },
        {
          id: '1',
          source: 'mcp',
          label: 'create_item: Test 1',
          status: 'applied',
          createdAt: '2026-01-01T11:00:00.000Z',
          entryCount: 2,
        },
      ];
      service.list.mockResolvedValueOnce({ items: summaryList });

      const res = await controller.list(user, { limit: 20 });

      expect(service.list).toHaveBeenCalledWith('1', { limit: 20, before: undefined });
      expect(res).toEqual(summaryList);
      expect(res[0]).toHaveProperty('entryCount', 1);
    });

    it('caps limit at 100 when a higher limit is requested', async () => {
      service.list.mockResolvedValueOnce({ items: [] });

      await controller.list(user, { limit: 500 });

      expect(service.list).toHaveBeenCalledWith('1', { limit: 100, before: undefined });
    });

    it('uses default limit of 20 when limit is omitted', async () => {
      service.list.mockResolvedValueOnce({ items: [] });

      await controller.list(user, {});

      expect(service.list).toHaveBeenCalledWith('1', { limit: 20, before: undefined });
    });
  });

  describe('GET /change-sets/:id', () => {
    it('returns detailed change set shape with entries', async () => {
      const detail = {
        id: '1',
        source: 'mcp',
        label: 'create_item: Task',
        status: 'applied',
        undoneAt: null,
        createdAt: '2026-01-01T12:00:00.000Z',
        entries: [
          {
            id: 'e1',
            ordinal: 1,
            targetType: 'item',
            targetId: '10',
            op: 'create',
            before: null,
            after: { title: 'Task' },
          },
        ],
      };
      service.get.mockResolvedValueOnce(detail);

      const res = await controller.get(user, '1');

      expect(service.get).toHaveBeenCalledWith('1', '1');
      expect(res).toEqual(detail);
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0]).toHaveProperty('op', 'create');
    });

    it('propagates 404 ApiException when id is not found or belongs to another user', async () => {
      service.get.mockRejectedValueOnce(ApiException.notFound('Change set not found'));

      await expect(controller.get(user, '999')).rejects.toThrow(ApiException);
      expect(service.get).toHaveBeenCalledWith('1', '999');
    });
  });

  describe('POST /change-sets/:id/undo', () => {
    it('returns undo result shape with undoneEntries and conflicts', async () => {
      const undoResult = {
        id: '1',
        status: 'undone',
        undoneEntries: 1,
        conflicts: [],
      };
      service.undo.mockResolvedValueOnce(undoResult);

      const res = await controller.undo(user, '1');

      expect(service.undo).toHaveBeenCalledWith('1', '1');
      expect(res).toEqual(undoResult);
      expect(res).toHaveProperty('status', 'undone');
      expect(res).toHaveProperty('undoneEntries', 1);
      expect(res).toHaveProperty('conflicts');
    });

    it('propagates 404 ApiException when foreign change set is requested for undo', async () => {
      service.undo.mockRejectedValueOnce(ApiException.notFound('Change set not found'));

      await expect(controller.undo(user, '999')).rejects.toThrow(ApiException);
    });
  });

  describe('Validation & pipes (Contract)', () => {
    it('rejects non-numeric id with 400 Bad Request via NumericIdPipe', () => {
      const { NumericIdPipe } = require('../common/numeric-id.pipe');
      const pipe = new NumericIdPipe();
      expect(() => pipe.transform('invalid-id')).toThrow(ApiException);
      try {
        pipe.transform('abc');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.message).toBe('Invalid id');
      }
      expect(pipe.transform('12345')).toBe('12345');
    });

    it('rejects non-numeric before cursor in ChangeSetListQueryDto', async () => {
      const { validate } = require('class-validator');
      const { plainToInstance } = require('class-transformer');
      const { ChangeSetListQueryDto } = require('./dto/change-set-dtos');

      const invalidDto = plainToInstance(ChangeSetListQueryDto, { before: 'abc' });
      const errors = await validate(invalidDto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('before');

      const validDto = plainToInstance(ChangeSetListQueryDto, { before: '12345' });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);
    });
  });
});
