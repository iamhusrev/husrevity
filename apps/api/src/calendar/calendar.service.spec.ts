import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CalendarService } from './calendar.service';
import { CalendarEvent } from './calendar-event.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { ItemMirrorService } from '../item-mirror/item-mirror.service';

type MockRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
};

describe('CalendarService', () => {
  const ownerId = '1';

  let service: CalendarService;
  let events: MockRepo;
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };
  let mirror: {
    upsertFromCalendarEvent: jest.Mock;
    softDeleteMirror: jest.Mock;
    restoreMirror: jest.Mock;
  };

  beforeEach(async () => {
    events = {
      findOne: jest.fn(),
      restore: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
    };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };
    mirror = {
      upsertFromCalendarEvent: jest.fn(),
      softDeleteMirror: jest.fn(),
      restoreMirror: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: getRepositoryToken(CalendarEvent), useValue: events },
        { provide: NotificationService, useValue: notifications },
        { provide: ItemMirrorService, useValue: mirror },
      ],
    }).compile();

    service = module.get(CalendarService);
  });

  describe('mirror hooks', () => {
    const liveRow = {
      id: '50',
      ownerId,
      title: 'Dentist',
      description: null,
      startAt: new Date('2026-08-01T10:00:00Z'),
      endAt: new Date('2026-08-01T11:00:00Z'),
      allDay: false,
      location: null,
      colorHex: null,
      reminderMinutes: null,
      recurrenceRule: null,
      deletedAt: null,
    } as unknown as CalendarEvent;

    it('create calls mirror.upsertFromCalendarEvent with saved row', async () => {
      events.create.mockReturnValue(liveRow);
      events.save.mockResolvedValue(liveRow);

      const res = await service.create(ownerId, {
        title: 'Dentist',
        startAt: '2026-08-01T10:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
      });

      expect(res.id).toBe('50');
      expect(mirror.upsertFromCalendarEvent).toHaveBeenCalledWith(liveRow);
    });

    it('update calls mirror.upsertFromCalendarEvent with saved row', async () => {
      events.findOne.mockResolvedValue(liveRow);
      events.save.mockResolvedValue(liveRow);

      const res = await service.update(ownerId, '50', {
        title: 'Updated Dentist',
        startAt: '2026-08-01T10:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
      });

      expect(res.id).toBe('50');
      expect(mirror.upsertFromCalendarEvent).toHaveBeenCalledWith(liveRow);
    });

    it('delete calls mirror.softDeleteMirror with calendar_event, id and ownerId', async () => {
      events.findOne.mockResolvedValue(liveRow);
      events.softRemove.mockResolvedValue(liveRow);

      await service.delete(ownerId, '50');

      expect(mirror.softDeleteMirror).toHaveBeenCalledWith('calendar_event', '50', ownerId);
    });

    it('restore calls mirror.upsertFromCalendarEvent with restored event', async () => {
      const deletedRow = { ...liveRow, deletedAt: new Date() } as unknown as CalendarEvent;
      events.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      await service.restore(ownerId, '50');

      expect(mirror.upsertFromCalendarEvent).toHaveBeenCalledWith(liveRow);
    });

    it('continues successfully if mirror throws an error during create', async () => {
      events.create.mockReturnValue(liveRow);
      events.save.mockResolvedValue(liveRow);
      mirror.upsertFromCalendarEvent.mockRejectedValue(new Error('DB failure'));

      const res = await service.create(ownerId, {
        title: 'Dentist',
        startAt: '2026-08-01T10:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
      });

      expect(res.id).toBe('50');
    });

    it('continues successfully if mirror throws an error during update', async () => {
      events.findOne.mockResolvedValue(liveRow);
      events.save.mockResolvedValue(liveRow);
      mirror.upsertFromCalendarEvent.mockRejectedValue(new Error('DB failure'));

      const res = await service.update(ownerId, '50', {
        title: 'Dentist Updated',
        startAt: '2026-08-01T10:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
      });

      expect(res.id).toBe('50');
    });

    it('continues successfully if mirror throws an error during delete', async () => {
      events.findOne.mockResolvedValue(liveRow);
      events.softRemove.mockResolvedValue(liveRow);
      mirror.softDeleteMirror.mockRejectedValue(new Error('DB failure'));

      await expect(service.delete(ownerId, '50')).resolves.not.toThrow();
    });

    it('continues successfully if mirror throws an error during restore', async () => {
      const deletedRow = { ...liveRow, deletedAt: new Date() } as unknown as CalendarEvent;
      events.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);
      events.restore.mockResolvedValue(undefined);
      mirror.upsertFromCalendarEvent.mockRejectedValue(new Error('DB failure'));

      const res = await service.restore(ownerId, '50');

      expect(res.id).toBe('50');
    });
  });

  describe('restore', () => {
    const id = '50';
    const deletedRow = {
      id,
      ownerId,
      title: 'Dentist',
      description: null,
      startAt: new Date('2026-08-01T10:00:00Z'),
      endAt: new Date('2026-08-01T11:00:00Z'),
      allDay: false,
      location: null,
      colorHex: null,
      reminderMinutes: null,
      recurrenceRule: null,
      deletedAt: new Date(),
    } as unknown as CalendarEvent;
    const liveRow = { ...deletedRow, deletedAt: null } as unknown as CalendarEvent;

    it('restores a soft-deleted event, re-syncs its notification and returns the live DTO', async () => {
      events.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      const result = await service.restore(ownerId, id);

      expect(events.findOne).toHaveBeenNthCalledWith(1, {
        where: { id, ownerId },
        withDeleted: true,
      });
      expect(events.restore).toHaveBeenCalledWith({ id, ownerId });
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'calendar_event', id);
      expect(result.id).toBe(id);
    });

    it('throws 404 when the event does not exist at all', async () => {
      events.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(events.restore).not.toHaveBeenCalled();
    });

    it('throws 404 when the event exists but is not soft-deleted', async () => {
      events.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(events.restore).not.toHaveBeenCalled();
    });

    it("404s instead of restoring another owner's event (owner mismatch not found by the query)", async () => {
      const otherOwnerId = '999';
      events.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(otherOwnerId, id)).rejects.toThrow(ApiException);
      expect(events.findOne).toHaveBeenCalledWith({
        where: { id, ownerId: otherOwnerId },
        withDeleted: true,
      });
      expect(events.restore).not.toHaveBeenCalled();
    });
  });
});
