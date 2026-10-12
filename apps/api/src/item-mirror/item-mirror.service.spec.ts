import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ItemMirrorService } from './item-mirror.service';
import { Item } from '../item/item.entity';
import { Task } from '../task/task.entity';
import { Reminder } from '../reminder/reminder.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { TimeBlock } from '../time-block/time-block.entity';

describe('ItemMirrorService', () => {
  let service: ItemMirrorService;
  let itemRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
    restore: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    itemRepo = {
      findOne: jest.fn(),
      create: jest.fn((attrs) => ({ ...attrs })),
      save: jest.fn((entity) => Promise.resolve({ id: '99', ...entity })),
      softRemove: jest.fn((entity) => Promise.resolve(entity)),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn().mockReturnValue(undefined), // default: enabled
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemMirrorService,
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<ItemMirrorService>(ItemMirrorService);
  });

  describe('upsertFromTask', () => {
    it('creates a new item when none exists with (legacyTable, legacyId, ownerId)', async () => {
      itemRepo.findOne.mockResolvedValueOnce(null);

      const task = {
        id: '10',
        ownerId: '1',
        title: 'Task 1',
        description: 'Desc',
        status: 'TODO',
      } as Task;

      const result = await service.upsertFromTask(task);

      expect(itemRepo.findOne).toHaveBeenCalledWith({
        where: { legacyTable: 'task', legacyId: '10', ownerId: '1' },
        withDeleted: true,
      });
      expect(itemRepo.create).toHaveBeenCalled();
      expect(itemRepo.save).toHaveBeenCalled();
      expect(result).toMatchObject({
        legacyTable: 'task',
        legacyId: '10',
        ownerId: '1',
        title: 'Task 1',
      });
    });

    it('updates existing item on second call with same legacy key instead of creating second row', async () => {
      const existing = {
        id: '50',
        legacyTable: 'task',
        legacyId: '10',
        ownerId: '1',
        title: 'Old Title',
      } as Item;
      itemRepo.findOne.mockResolvedValueOnce(existing);

      const task = {
        id: '10',
        ownerId: '1',
        title: 'Updated Title',
        description: 'New Desc',
        status: 'DONE',
      } as Task;

      const result = await service.upsertFromTask(task);

      expect(itemRepo.create).not.toHaveBeenCalled();
      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '50',
          title: 'Updated Title',
          status: 'done',
        }),
      );
      expect(result).toMatchObject({
        id: '50',
        title: 'Updated Title',
      });
    });

    it('never overwrites an existing item of another owner', async () => {
      const existingOtherOwner = {
        id: '50',
        legacyTable: 'task',
        legacyId: '10',
        ownerId: '999', // different owner!
        title: 'Other Owner Item',
      } as Item;
      // findOne scoped by ownerId: '1' returns null
      itemRepo.findOne.mockResolvedValueOnce(null);

      const task = {
        id: '10',
        ownerId: '1',
        title: 'My Task',
      } as Task;

      await service.upsertFromTask(task);

      expect(itemRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: '1' }),
      );
    });

    it('never touches native items where legacyTable is null', async () => {
      // Query always filters by legacyTable = 'task'
      const task = { id: '10', ownerId: '1', title: 'Task' } as Task;
      await service.upsertFromTask(task);
      expect(itemRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ legacyTable: 'task' }),
        }),
      );
    });

    it('un-deletes by clearing deletedAt when upsert hits a soft-deleted existing item (re-creation / restore healing case)', async () => {
      const existing = {
        id: '50',
        legacyTable: 'task',
        legacyId: '10',
        ownerId: '1',
        title: 'Deleted Task',
        deletedAt: new Date('2026-01-01T00:00:00Z'),
      } as Item;
      itemRepo.findOne.mockResolvedValueOnce(existing);

      const task = {
        id: '10',
        ownerId: '1',
        title: 'Restored/Recreated Task',
        description: null,
        status: 'TODO',
      } as Task;

      const result = await service.upsertFromTask(task);

      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '50',
          title: 'Restored/Recreated Task',
          deletedAt: null,
        }),
      );
      expect(result?.deletedAt).toBeNull();
    });

    it('overwrites a natively edited item when legacy write occurs (legacy is authoritative)', async () => {
      const nativelyEdited = {
        id: '50',
        legacyTable: 'task',
        legacyId: '10',
        ownerId: '1',
        title: 'Edited natively through /items/:id',
        notes: 'Native notes',
        dueAt: new Date('2026-02-01'),
        status: 'open',
        deletedAt: null,
      } as Item;
      itemRepo.findOne.mockResolvedValueOnce(nativelyEdited);

      const legacyTask = {
        id: '10',
        ownerId: '1',
        title: 'Legacy Authoritative Title',
        description: 'Legacy notes',
        dueAt: new Date('2026-03-01'),
        status: 'DONE',
      } as Task;

      const result = await service.upsertFromTask(legacyTask);

      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '50',
          title: 'Legacy Authoritative Title',
          notes: 'Legacy notes',
          status: 'done',
        }),
      );
      expect(result?.title).toBe('Legacy Authoritative Title');
    });
  });

  describe('upsertFromReminder', () => {
    it('creates/updates mirrored item with legacyTable reminder', async () => {
      itemRepo.findOne.mockResolvedValueOnce(null);

      const reminder = {
        id: '20',
        ownerId: '1',
        title: 'Reminder 1',
        completedAt: null,
      } as Reminder;

      const result = await service.upsertFromReminder(reminder);

      expect(itemRepo.findOne).toHaveBeenCalledWith({
        where: { legacyTable: 'reminder', legacyId: '20', ownerId: '1' },
        withDeleted: true,
      });
      expect(result).toMatchObject({
        legacyTable: 'reminder',
        legacyId: '20',
        ownerId: '1',
        title: 'Reminder 1',
      });
    });
  });

  describe('upsertFromCalendarEvent', () => {
    it('creates/updates mirrored item with legacyTable calendar_event', async () => {
      itemRepo.findOne.mockResolvedValueOnce(null);

      const event = {
        id: '30',
        ownerId: '1',
        title: 'Meeting',
        startAt: new Date('2026-10-15T10:00:00Z'),
        endAt: new Date('2026-10-15T11:00:00Z'),
      } as CalendarEvent;

      const result = await service.upsertFromCalendarEvent(event);

      expect(itemRepo.findOne).toHaveBeenCalledWith({
        where: { legacyTable: 'calendar_event', legacyId: '30', ownerId: '1' },
        withDeleted: true,
      });
      expect(result).toMatchObject({
        legacyTable: 'calendar_event',
        legacyId: '30',
        ownerId: '1',
        title: 'Meeting',
      });
    });
  });

  describe('upsertFromTimeBlock', () => {
    it('creates/updates mirrored item with legacyTable time_block', async () => {
      itemRepo.findOne.mockResolvedValueOnce(null);

      const block = {
        id: '40',
        ownerId: '1',
        title: 'Work Block',
        startAt: new Date('2026-10-15T10:00:00Z'),
        endAt: new Date('2026-10-15T12:00:00Z'),
      } as TimeBlock;

      const result = await service.upsertFromTimeBlock(block);

      expect(itemRepo.findOne).toHaveBeenCalledWith({
        where: { legacyTable: 'time_block', legacyId: '40', ownerId: '1' },
        withDeleted: true,
      });
      expect(result).toMatchObject({
        legacyTable: 'time_block',
        legacyId: '40',
        ownerId: '1',
        title: 'Work Block',
      });
    });
  });

  describe('softDeleteMirror', () => {
    it('soft-deletes the mirrored item matching (legacyTable, legacyId, ownerId)', async () => {
      const existing = {
        id: '50',
        legacyTable: 'task',
        legacyId: '10',
        ownerId: '1',
      } as Item;
      itemRepo.findOne.mockResolvedValueOnce(existing);

      await service.softDeleteMirror('task', '10', '1');

      expect(itemRepo.findOne).toHaveBeenCalledWith({
        where: { legacyTable: 'task', legacyId: '10', ownerId: '1' },
      });
      expect(itemRepo.softRemove).toHaveBeenCalledWith(existing);
    });

    it('is a no-op if item is not found', async () => {
      itemRepo.findOne.mockResolvedValueOnce(null);

      await service.softDeleteMirror('task', '999', '1');

      expect(itemRepo.softRemove).not.toHaveBeenCalled();
    });
  });

  describe('restoreMirror', () => {
    it('restores the soft-deleted mirrored item matching (legacyTable, legacyId, ownerId)', async () => {
      const existing = {
        id: '50',
        legacyTable: 'task',
        legacyId: '10',
        ownerId: '1',
        deletedAt: new Date(),
      } as Item;
      itemRepo.findOne.mockResolvedValueOnce(existing);

      await service.restoreMirror('task', '10', '1');

      expect(itemRepo.findOne).toHaveBeenCalledWith({
        where: { legacyTable: 'task', legacyId: '10', ownerId: '1' },
        withDeleted: true,
      });
      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '50',
          deletedAt: null,
        }),
      );
    });

    it('is a no-op if item is not found or not deleted', async () => {
      itemRepo.findOne.mockResolvedValueOnce(null);
      await service.restoreMirror('task', '999', '1');
      expect(itemRepo.save).not.toHaveBeenCalled();

      const live = { id: '51', deletedAt: null } as Item;
      itemRepo.findOne.mockResolvedValueOnce(live);
      await service.restoreMirror('task', '51', '1');
      expect(itemRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('ITEM_MIRROR_ENABLED switch', () => {
    it('disables mirror when ITEM_MIRROR_ENABLED is false or 0', async () => {
      configService.get.mockReturnValue('false');

      const task = { id: '10', ownerId: '1', title: 'Task' } as Task;
      const result = await service.upsertFromTask(task);

      expect(result).toBeNull();
      expect(itemRepo.findOne).not.toHaveBeenCalled();
      expect(itemRepo.save).not.toHaveBeenCalled();

      configService.get.mockReturnValue('0');
      await service.softDeleteMirror('task', '10', '1');
      expect(itemRepo.findOne).not.toHaveBeenCalled();

      await service.restoreMirror('task', '10', '1');
      expect(itemRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('ITEM_MIRROR_ENABLED parsing', () => {
    const task = { id: '10', ownerId: '1', title: 'Task' } as Task;

    it.each(['false', 'FALSE', 'False', ' false ', '0', 'no', 'No', 'off', 'OFF', ' off\n'])(
      'treats %j as disabled',
      async (value) => {
        configService.get.mockReturnValue(value);
        const result = await service.upsertFromTask(task);
        expect(result).toBeNull();
        expect(itemRepo.findOne).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, '', 'true', 'TRUE', '1', 'yes', 'on', 'enabled'])(
      'treats %j as enabled',
      async (value) => {
        configService.get.mockReturnValue(value);
        itemRepo.findOne.mockResolvedValue(null);
        await service.upsertFromTask(task);
        expect(itemRepo.findOne).toHaveBeenCalled();
      },
    );
  });

  describe('failure policy', () => {
    it('never throws when the legacy mapper itself throws (malformed entity)', async () => {
      const bad = null as unknown as Task;
      await expect(service.upsertFromTask(bad)).resolves.toBeNull();
      await expect(service.upsertFromReminder(bad as never)).resolves.toBeNull();
      await expect(service.upsertFromCalendarEvent(bad as never)).resolves.toBeNull();
      await expect(service.upsertFromTimeBlock(bad as never)).resolves.toBeNull();
      expect(itemRepo.save).not.toHaveBeenCalled();
    });

    it('never throws from service methods when repository throws an error', async () => {
      itemRepo.findOne.mockRejectedValueOnce(new Error('DB failure'));

      const task = { id: '10', ownerId: '1', title: 'Task' } as Task;
      // Must not throw!
      const result = await service.upsertFromTask(task);
      expect(result).toBeNull();

      itemRepo.findOne.mockRejectedValueOnce(new Error('DB failure'));
      await expect(service.softDeleteMirror('task', '10', '1')).resolves.not.toThrow();

      itemRepo.findOne.mockRejectedValueOnce(new Error('DB failure'));
      await expect(service.restoreMirror('task', '10', '1')).resolves.not.toThrow();
    });
  });
});
