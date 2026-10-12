import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ItemMirrorService } from './item-mirror.service';
import { Item } from '../item/item.entity';
import { ReminderService } from '../reminder/reminder.service';
import { Reminder } from '../reminder/reminder.entity';
import { ReminderList } from '../reminder/reminder-list.entity';
import { NotificationService } from '../notification/notification.service';

describe('Notification safety (ItemMirrorService)', () => {
  let mirrorService: ItemMirrorService;
  let reminderService: ReminderService;
  let mockNotificationService: {
    cancelForSource: jest.Mock;
    enqueue: jest.Mock;
  };
  let itemRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
  };
  let reminderRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
    restore: jest.Mock;
  };

  beforeEach(async () => {
    mockNotificationService = {
      cancelForSource: jest.fn().mockResolvedValue(undefined),
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    itemRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((attrs) => ({ ...attrs })),
      save: jest.fn((entity) => Promise.resolve({ id: 'item-1', ...entity })),
      softRemove: jest.fn((entity) => Promise.resolve(entity)),
    };

    reminderRepo = {
      findOne: jest.fn(),
      create: jest.fn((attrs) => ({ id: 'rem-1', ...attrs })),
      save: jest.fn((entity) => Promise.resolve({ id: 'rem-1', ...entity })),
      softRemove: jest.fn((entity) => Promise.resolve(entity)),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        ItemMirrorService,
        ReminderService,
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Reminder), useValue: reminderRepo },
        { provide: getRepositoryToken(ReminderList), useValue: { findOne: jest.fn() } },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    mirrorService = module.get<ItemMirrorService>(ItemMirrorService);
    reminderService = module.get<ReminderService>(ReminderService);
  });

  it('ItemMirrorService constructor takes only Item repository and ConfigService, never NotificationService or ItemService', () => {
    // Inspect injected properties on ItemMirrorService
    expect((mirrorService as any).notifications).toBeUndefined();
    expect((mirrorService as any).notificationService).toBeUndefined();
    expect((mirrorService as any).itemService).toBeUndefined();
    expect((mirrorService as any).items).toBeDefined();
    expect((mirrorService as any).config).toBeDefined();
  });

  it('no method of mocked notification service is called with kind "item" when legacy service create/update/delete/restore runs with real mirror', async () => {
    const ownerId = 'user-1';
    const futureDue = new Date(Date.now() + 3600_000);

    // 1. Create
    const createdReminder = {
      id: 'rem-1',
      ownerId,
      title: 'Buy groceries',
      dueAt: futureDue,
      notifyMinutesBefore: 15,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Reminder;
    reminderRepo.create.mockReturnValueOnce(createdReminder);
    reminderRepo.save.mockResolvedValueOnce(createdReminder);

    await reminderService.createReminder(ownerId, {
      title: 'Buy groceries',
      dueAt: futureDue.toISOString(),
      notifyMinutesBefore: 15,
    });

    // Mirror saved item
    expect(itemRepo.save).toHaveBeenCalled();
    // Notification called only for legacy kind 'reminder'
    for (const call of mockNotificationService.enqueue.mock.calls) {
      expect(call[0].kind).toBe('reminder');
      expect(call[0].kind).not.toBe('item');
    }
    for (const call of mockNotificationService.cancelForSource.mock.calls) {
      expect(call[1]).toBe('reminder');
      expect(call[1]).not.toBe('item');
    }

    // 2. Update
    reminderRepo.findOne.mockResolvedValueOnce(createdReminder);
    await reminderService.updateReminder(ownerId, 'rem-1', { title: 'Updated groceries' });
    for (const call of mockNotificationService.enqueue.mock.calls) {
      expect(call[0].kind).toBe('reminder');
      expect(call[0].kind).not.toBe('item');
    }

    // 3. Delete
    reminderRepo.findOne.mockResolvedValueOnce(createdReminder);
    itemRepo.findOne.mockResolvedValueOnce({
      id: 'item-1',
      legacyTable: 'reminder',
      legacyId: 'rem-1',
      ownerId,
    } as Item);
    await reminderService.deleteReminder(ownerId, 'rem-1');
    expect(itemRepo.softRemove).toHaveBeenCalled();
    for (const call of mockNotificationService.cancelForSource.mock.calls) {
      expect(call[1]).toBe('reminder');
      expect(call[1]).not.toBe('item');
    }

    // 4. Restore
    const deletedReminder = { ...createdReminder, deletedAt: new Date() };
    const restoredReminder = { ...createdReminder, deletedAt: null };
    reminderRepo.findOne
      .mockResolvedValueOnce(deletedReminder)
      .mockResolvedValueOnce(restoredReminder);
    await reminderService.restoreReminder(ownerId, 'rem-1');

    // Still no notifications of kind 'item'
    for (const call of mockNotificationService.enqueue.mock.calls) {
      expect(call[0].kind).toBe('reminder');
      expect(call[0].kind).not.toBe('item');
    }
    for (const call of mockNotificationService.cancelForSource.mock.calls) {
      expect(call[1]).toBe('reminder');
      expect(call[1]).not.toBe('item');
    }
  });
});
