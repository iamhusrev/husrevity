import { Test } from '@nestjs/testing';
import { ItemController } from './item.controller';
import { ItemService } from './item.service';
import { AuthenticatedUser } from '../common/current-user.decorator';
import { ItemListQueryDto, ItemResponseDto } from './dto/item-dtos';

describe('ItemController (Contract)', () => {
  let controller: ItemController;
  let itemsService: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    complete: jest.Mock;
    parseQuickAddText: jest.Mock;
    exportIcs: jest.Mock;
  };

  const user: AuthenticatedUser = {
    userId: '1',
    email: 'user@example.com',
    role: 'ROLE_USER',
  };

  beforeEach(async () => {
    itemsService = {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      complete: jest.fn(),
      parseQuickAddText: jest.fn(),
      exportIcs: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [
        { provide: ItemService, useValue: itemsService },
        {
          provide: 'IdempotencyKeyRepository',
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(ItemController);
  });

  describe('POST /items/:id/complete', () => {
    it('returns ItemResponseDto and has NO occurrenceId field in response shape', async () => {
      const mockDto: ItemResponseDto = {
        id: '10',
        kind: 'task',
        title: 'Daily Meeting',
        notes: null,
        context: null,
        projectId: null,
        goalId: null,
        blockId: null,
        scheduledAt: null,
        durationMin: null,
        dueAt: null,
        notifyMinutesBefore: null,
        rrule: 'FREQ=DAILY',
        occursOn: '2026-01-05',
        status: 'done',
        completedAt: '2026-01-05T12:00:00.000Z',
        source: 'web',
        payload: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-05T12:00:00.000Z',
      };
      itemsService.complete.mockResolvedValueOnce(mockDto);

      const result = await controller.complete(user, '10', { occursOn: '2026-01-05' });

      expect(itemsService.complete).toHaveBeenCalledWith('1', '10', { occursOn: '2026-01-05' });
      expect(result).toEqual(mockDto);
      expect((result as any).occurrenceId).toBeUndefined();
      expect(Object.keys(result)).not.toContain('occurrenceId');
    });
  });

  describe('GET /items?inbox=true', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validate } = require('class-validator');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { plainToInstance } = require('class-transformer');

    it('parses inbox=true and inbox=false query strings into booleans', async () => {
      const on = plainToInstance(ItemListQueryDto, { inbox: 'true' });
      const off = plainToInstance(ItemListQueryDto, { inbox: 'false' });
      expect(await validate(on)).toHaveLength(0);
      expect(await validate(off)).toHaveLength(0);
      expect(on.inbox).toBe(true);
      expect(off.inbox).toBe(false);
    });

    it('accepts an absent inbox parameter', async () => {
      const dto = plainToInstance(ItemListQueryDto, {});
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.inbox).toBeUndefined();
    });

    it.each(['maybe', '1', 'yes', ''])('rejects inbox=%j as a validation error', async (value) => {
      const dto = plainToInstance(ItemListQueryDto, { inbox: value });
      const errors = await validate(dto);
      expect(errors.some((e: { property: string }) => e.property === 'inbox')).toBe(true);
    });

    it('passes the query and the caller id to the service (owner scoping) and returns its rows', async () => {
      itemsService.list.mockResolvedValueOnce([{ id: '5', kind: 'task', title: 'x' }]);
      const query = plainToInstance(ItemListQueryDto, { inbox: 'true' });

      const result = await controller.list(user, query);

      expect(itemsService.list).toHaveBeenCalledWith('1', query);
      expect(result).toEqual([{ id: '5', kind: 'task', title: 'x' }]);
    });
  });

  describe('GET /items/export.ics', () => {
    function fakeRes() {
      const res: Record<string, jest.Mock> = {};
      res.status = jest.fn().mockReturnValue(res);
      res.setHeader = jest.fn().mockReturnValue(res);
      res.send = jest.fn().mockReturnValue(res);
      return res;
    }

    it('sends the raw ICS text with calendar headers, outside the JSON envelope', async () => {
      itemsService.exportIcs.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
      const res = fakeRes();

      const returned = await controller.exportIcs(
        user,
        { from: '2026-03-01', to: '2026-03-31' },
        res as never,
      );

      expect(itemsService.exportIcs).toHaveBeenCalledWith('1', {
        from: '2026-03-01',
        to: '2026-03-31',
      });
      expect(returned).toBeUndefined();
      expect(res.send).toHaveBeenCalledWith('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/calendar; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="husrevity-2026-03-01_2026-03-31.ics"',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('is declared before GET :id so "export.ics" is not read as an id', () => {
      const names = Object.getOwnPropertyNames(ItemController.prototype);
      expect(names.indexOf('exportIcs')).toBeGreaterThan(-1);
      expect(names.indexOf('exportIcs')).toBeLessThan(names.indexOf('get'));
      expect(Reflect.getMetadata('path', ItemController.prototype.exportIcs)).toBe('export.ics');
    });
  });
});
