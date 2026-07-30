import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReminderService } from './reminder.service';
import { ReminderList } from './reminder-list.entity';
import { Reminder } from './reminder.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';

type MockRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
  count: jest.Mock;
};

function makeRepo(): MockRepo {
  return { findOne: jest.fn(), restore: jest.fn(), count: jest.fn() };
}

describe('ReminderService', () => {
  const ownerId = '1';

  let service: ReminderService;
  let lists: MockRepo;
  let reminders: MockRepo;
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };

  beforeEach(async () => {
    lists = makeRepo();
    reminders = makeRepo();
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: getRepositoryToken(ReminderList), useValue: lists },
        { provide: getRepositoryToken(Reminder), useValue: reminders },
        { provide: DataSource, useValue: {} },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ReminderService);
  });

  describe('restoreList', () => {
    const id = '10';
    const deletedRow = {
      id,
      ownerId,
      name: 'Groceries',
      color: '#007AFF',
      icon: null,
      position: 0,
      createdAt: new Date(),
      deletedAt: new Date(),
    } as unknown as ReminderList;
    const liveRow = { ...deletedRow, deletedAt: null } as unknown as ReminderList;

    it('restores a soft-deleted list and returns the live DTO', async () => {
      lists.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);
      reminders.count.mockResolvedValue(3);

      const result = await service.restoreList(ownerId, id);

      expect(lists.findOne).toHaveBeenNthCalledWith(1, {
        where: { id, ownerId },
        withDeleted: true,
      });
      expect(lists.restore).toHaveBeenCalledWith({ id, ownerId });
      expect(result.id).toBe(id);
      expect(result.itemCount).toBe(3);
    });

    it('throws 404 when the list does not exist at all', async () => {
      lists.findOne.mockResolvedValueOnce(null);

      await expect(service.restoreList(ownerId, id)).rejects.toThrow(ApiException);
      expect(lists.restore).not.toHaveBeenCalled();
    });

    it('throws 404 when the list exists but is not soft-deleted', async () => {
      lists.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restoreList(ownerId, id)).rejects.toThrow(ApiException);
      expect(lists.restore).not.toHaveBeenCalled();
    });

    it('404s instead of restoring another owner\'s list (owner mismatch not found by the query)', async () => {
      const otherOwnerId = '999';
      lists.findOne.mockResolvedValueOnce(null); // DB would not match id+ownerId for a foreign row

      await expect(service.restoreList(otherOwnerId, id)).rejects.toThrow(ApiException);
      expect(lists.findOne).toHaveBeenCalledWith({
        where: { id, ownerId: otherOwnerId },
        withDeleted: true,
      });
      expect(lists.restore).not.toHaveBeenCalled();
    });
  });

  describe('restoreReminder', () => {
    const id = '20';
    const deletedRow = {
      id,
      ownerId,
      listId: null,
      title: 'Water the plants',
      notes: null,
      dueAt: null,
      completedAt: null,
      priority: 'NONE',
      flag: false,
      position: 0,
      notifyMinutesBefore: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as unknown as Reminder;
    const liveRow = { ...deletedRow, deletedAt: null } as unknown as Reminder;

    it('restores a soft-deleted reminder, re-syncs its notification and returns the live DTO', async () => {
      reminders.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      const result = await service.restoreReminder(ownerId, id);

      expect(reminders.findOne).toHaveBeenNthCalledWith(1, {
        where: { id, ownerId },
        withDeleted: true,
      });
      expect(reminders.restore).toHaveBeenCalledWith({ id, ownerId });
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'reminder', id);
      expect(result.id).toBe(id);
    });

    it('throws 404 when the reminder does not exist at all', async () => {
      reminders.findOne.mockResolvedValueOnce(null);

      await expect(service.restoreReminder(ownerId, id)).rejects.toThrow(ApiException);
      expect(reminders.restore).not.toHaveBeenCalled();
      expect(notifications.cancelForSource).not.toHaveBeenCalled();
    });

    it('throws 404 when the reminder exists but is not soft-deleted', async () => {
      reminders.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restoreReminder(ownerId, id)).rejects.toThrow(ApiException);
      expect(reminders.restore).not.toHaveBeenCalled();
    });

    it('404s instead of restoring another owner\'s reminder (owner mismatch not found by the query)', async () => {
      const otherOwnerId = '999';
      reminders.findOne.mockResolvedValueOnce(null);

      await expect(service.restoreReminder(otherOwnerId, id)).rejects.toThrow(ApiException);
      expect(reminders.findOne).toHaveBeenCalledWith({
        where: { id, ownerId: otherOwnerId },
        withDeleted: true,
      });
      expect(reminders.restore).not.toHaveBeenCalled();
    });
  });
});
