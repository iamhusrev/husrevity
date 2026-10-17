import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReminderService } from './reminder.service';
import { ReminderList } from './reminder-list.entity';
import { Reminder } from './reminder.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { ItemMirrorService } from '../item-mirror/item-mirror.service';

type MockRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
  count: jest.Mock;
  create?: jest.Mock;
  save?: jest.Mock;
  softRemove?: jest.Mock;
};

function makeRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    restore: jest.fn(),
    count: jest.fn(),
    create: jest.fn((attrs) => ({ ...attrs })),
    save: jest.fn((entity) => Promise.resolve({ id: '1', ...entity })),
    softRemove: jest.fn((entity) => Promise.resolve(entity)),
  };
}

describe('ReminderService', () => {
  const ownerId = '1';

  let service: ReminderService;
  let lists: MockRepo;
  let reminders: MockRepo;
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };
  let mirror: {
    upsertFromReminder: jest.Mock;
    softDeleteMirror: jest.Mock;
    restoreMirror: jest.Mock;
  };

  beforeEach(async () => {
    lists = makeRepo();
    reminders = makeRepo();
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };
    mirror = {
      upsertFromReminder: jest.fn().mockResolvedValue(null),
      softDeleteMirror: jest.fn().mockResolvedValue(undefined),
      restoreMirror: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: getRepositoryToken(ReminderList), useValue: lists },
        { provide: getRepositoryToken(Reminder), useValue: reminders },
        { provide: DataSource, useValue: {} },
        { provide: NotificationService, useValue: notifications },
        { provide: ItemMirrorService, useValue: mirror },
      ],
    }).compile();

    service = module.get(ReminderService);
  });

  describe('getReminder', () => {
    it('returns the owner-scoped reminder as a DTO', async () => {
      reminders.findOne.mockResolvedValueOnce({
        id: '5',
        ownerId,
        title: 'Pay rent',
        createdAt: new Date(),
      });

      const result = await service.getReminder(ownerId, '5');

      expect(reminders.findOne).toHaveBeenCalledWith({ where: { id: '5', ownerId } });
      expect(result).toMatchObject({ id: '5', title: 'Pay rent' });
    });

    it('throws notFound for a missing or foreign reminder', async () => {
      reminders.findOne.mockResolvedValueOnce(null);

      await expect(service.getReminder(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('getList', () => {
    it('returns the owner-scoped list with its open reminder count', async () => {
      lists.findOne.mockResolvedValueOnce({
        id: '9',
        ownerId,
        name: 'Groceries',
        color: '#007AFF',
        icon: null,
        position: 0,
        createdAt: new Date(),
      });
      reminders.count.mockResolvedValueOnce(4);

      const result = await service.getList(ownerId, '9');

      expect(lists.findOne).toHaveBeenCalledWith({ where: { id: '9', ownerId } });
      expect(reminders.count).toHaveBeenCalledWith({
        where: { listId: '9', completedAt: expect.anything() },
      });
      expect(result).toMatchObject({ id: '9', name: 'Groceries' });
    });

    it('throws notFound for a missing or foreign list', async () => {
      lists.findOne.mockResolvedValueOnce(null);

      await expect(service.getList(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
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

    it("404s instead of restoring another owner's list (owner mismatch not found by the query)", async () => {
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

    it("404s instead of restoring another owner's reminder (owner mismatch not found by the query)", async () => {
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

  describe('ItemMirror hooks', () => {
    it('invokes mirror.upsertFromReminder upon createReminder', async () => {
      const savedReminder = {
        id: '20',
        ownerId: '1',
        title: 'New Reminder',
        completedAt: null,
      } as Reminder;
      reminders.create!.mockReturnValueOnce(savedReminder);
      reminders.save!.mockResolvedValueOnce(savedReminder);

      await service.createReminder('1', { title: 'New Reminder' });

      expect(mirror.upsertFromReminder).toHaveBeenCalledWith(savedReminder);
    });

    it('invokes mirror.upsertFromReminder upon updateReminder', async () => {
      const existing = {
        id: '20',
        ownerId: '1',
        title: 'Old',
        completedAt: null,
      } as Reminder;
      reminders.findOne.mockResolvedValueOnce(existing);
      const updated = { ...existing, title: 'Updated' };
      reminders.save!.mockResolvedValueOnce(updated);

      await service.updateReminder('1', '20', { title: 'Updated' });

      expect(mirror.upsertFromReminder).toHaveBeenCalledWith(updated);
    });

    it('invokes mirror.upsertFromReminder upon toggleReminder', async () => {
      const existing = {
        id: '20',
        ownerId: '1',
        title: 'Reminder',
        completedAt: null,
      } as Reminder;
      reminders.findOne.mockResolvedValueOnce(existing);
      const updated = { ...existing, completedAt: new Date() };
      reminders.save!.mockResolvedValueOnce(updated);

      await service.toggleReminder('1', '20');

      expect(mirror.upsertFromReminder).toHaveBeenCalledWith(updated);
    });

    it('invokes mirror.softDeleteMirror upon deleteReminder', async () => {
      const existing = {
        id: '20',
        ownerId: '1',
      } as Reminder;
      reminders.findOne.mockResolvedValueOnce(existing);

      await service.deleteReminder('1', '20');

      expect(mirror.softDeleteMirror).toHaveBeenCalledWith('reminder', '20', '1');
    });

    it('invokes mirror.upsertFromReminder upon restoreReminder', async () => {
      const deletedRow = {
        id: '20',
        ownerId: '1',
        title: 'Restored Reminder',
        deletedAt: new Date(),
      } as Reminder;
      const liveRow = { ...deletedRow, deletedAt: null };
      reminders.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      await service.restoreReminder('1', '20');

      expect(mirror.upsertFromReminder).toHaveBeenCalledWith(
        expect.objectContaining({ id: '20', ownerId: '1' }),
      );
    });

    it('does not fail createReminder when mirror throws', async () => {
      const savedReminder = { id: '20', ownerId: '1', title: 'R' } as Reminder;
      reminders.create!.mockReturnValueOnce(savedReminder);
      reminders.save!.mockResolvedValueOnce(savedReminder);
      mirror.upsertFromReminder.mockRejectedValueOnce(new Error('mirror fail'));

      const result = await service.createReminder('1', { title: 'R' });

      expect(result).toBeDefined();
      expect(result.id).toBe('20');
    });

    it('does not fail updateReminder when mirror throws', async () => {
      const existing = { id: '20', ownerId: '1', title: 'Old' } as Reminder;
      const updated = { ...existing, title: 'Updated' } as Reminder;
      reminders.findOne.mockResolvedValueOnce(existing);
      reminders.save!.mockResolvedValueOnce(updated);
      mirror.upsertFromReminder.mockRejectedValueOnce(new Error('mirror fail'));

      const result = await service.updateReminder('1', '20', { title: 'Updated' });

      expect(result).toBeDefined();
      expect(result.title).toBe('Updated');
    });

    it('does not fail toggleReminder when mirror throws', async () => {
      const existing = { id: '20', ownerId: '1', title: 'R', completedAt: null } as Reminder;
      const updated = { ...existing, completedAt: new Date() } as Reminder;
      reminders.findOne.mockResolvedValueOnce(existing);
      reminders.save!.mockResolvedValueOnce(updated);
      mirror.upsertFromReminder.mockRejectedValueOnce(new Error('mirror fail'));

      const result = await service.toggleReminder('1', '20');

      expect(result).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('does not fail deleteReminder when mirror throws', async () => {
      const existing = { id: '20', ownerId: '1' } as Reminder;
      reminders.findOne.mockResolvedValueOnce(existing);
      reminders.softRemove!.mockResolvedValueOnce(existing);
      mirror.softDeleteMirror.mockRejectedValueOnce(new Error('mirror fail'));

      await expect(service.deleteReminder('1', '20')).resolves.not.toThrow();
    });

    it('does not fail restoreReminder when mirror throws', async () => {
      const deletedRow = { id: '20', ownerId: '1', deletedAt: new Date() } as Reminder;
      const liveRow = { ...deletedRow, deletedAt: null };
      reminders.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);
      reminders.restore!.mockResolvedValueOnce(undefined);
      mirror.upsertFromReminder.mockRejectedValueOnce(new Error('mirror fail'));

      const result = await service.restoreReminder('1', '20');

      expect(result).toBeDefined();
      expect(result.id).toBe('20');
    });
  });
});
