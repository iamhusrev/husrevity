import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CalendarService } from './calendar.service';
import { CalendarEvent } from './calendar-event.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';

type MockRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
};

describe('CalendarService', () => {
  const ownerId = '1';

  let service: CalendarService;
  let events: MockRepo;
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };

  beforeEach(async () => {
    events = { findOne: jest.fn(), restore: jest.fn() };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: getRepositoryToken(CalendarEvent), useValue: events },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get(CalendarService);
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

    it('404s instead of restoring another owner\'s event (owner mismatch not found by the query)', async () => {
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
