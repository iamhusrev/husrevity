import {
  mapCalendarEventToItem,
  mapReminderToItem,
  mapTaskToItem,
  mapTimeBlockToItem,
} from './legacy-item.mapper';
import { Task } from '../task/task.entity';
import { Reminder } from '../reminder/reminder.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { TimeBlock } from '../time-block/time-block.entity';

describe('legacy-item.mapper', () => {
  describe('mapTaskToItem', () => {
    it('maps open task to item matching backfill semantics', () => {
      const task: Partial<Task> = {
        id: '101',
        ownerId: '1',
        title: 'Complete project report',
        description: 'Detailed report for Q3',
        status: 'TODO',
        priority: 'HIGH',
        projectId: '42',
        assigneeId: '2',
        dueAt: new Date('2026-10-15T12:00:00Z'),
        notifyMinutesBefore: 30,
        deletedAt: null,
      };

      const mapped = mapTaskToItem(task as Task);

      expect(mapped).toEqual({
        ownerId: '1',
        kind: 'task',
        title: 'Complete project report',
        notes: 'Detailed report for Q3',
        context: null,
        projectId: '42',
        scheduledAt: null,
        durationMin: null,
        dueAt: new Date('2026-10-15T12:00:00Z'),
        notifyMinutesBefore: 30,
        rrule: null,
        status: 'open',
        completedAt: null,
        payload: { assigneeId: '2' },
        source: 'web',
        legacyTable: 'task',
        legacyId: '101',
      });
    });

    it('maps DONE, COMPLETED and CANCELLED statuses properly', () => {
      const doneTask = { id: '1', ownerId: '1', title: 'T1', status: 'DONE' } as Task;
      expect(mapTaskToItem(doneTask).status).toBe('done');

      const completedTask = { id: '2', ownerId: '1', title: 'T2', status: 'COMPLETED' } as Task;
      expect(mapTaskToItem(completedTask).status).toBe('done');

      const cancelledTask = { id: '3', ownerId: '1', title: 'T3', status: 'CANCELLED' } as Task;
      expect(mapTaskToItem(cancelledTask).status).toBe('cancelled');

      const inProgressTask = { id: '4', ownerId: '1', title: 'T4', status: 'IN_PROGRESS' } as Task;
      expect(mapTaskToItem(inProgressTask).status).toBe('open');
    });

    it('strips null/undefined assigneeId from payload', () => {
      const task = { id: '1', ownerId: '1', title: 'T1', status: 'TODO', assigneeId: null } as Task;
      expect(mapTaskToItem(task).payload).toEqual({});
    });
  });

  describe('mapReminderToItem', () => {
    it('maps reminder to item matching backfill semantics', () => {
      const reminder: Partial<Reminder> = {
        id: '202',
        ownerId: '1',
        title: 'Buy groceries',
        notes: 'Milk, bread, cheese',
        listId: '5',
        priority: 'HIGH',
        flag: true,
        dueAt: new Date('2026-10-14T10:00:00Z'),
        completedAt: null,
        notifyMinutesBefore: 15,
        deletedAt: null,
      };

      const mapped = mapReminderToItem(reminder as Reminder);

      expect(mapped).toEqual({
        ownerId: '1',
        kind: 'task',
        title: 'Buy groceries',
        notes: 'Milk, bread, cheese',
        context: null,
        projectId: null,
        scheduledAt: null,
        durationMin: null,
        dueAt: new Date('2026-10-14T10:00:00Z'),
        notifyMinutesBefore: 15,
        rrule: null,
        status: 'open',
        completedAt: null,
        payload: { listId: '5', priority: 'HIGH', flag: true },
        source: 'web',
        legacyTable: 'reminder',
        legacyId: '202',
      });
    });

    it('maps completed reminder to status done', () => {
      const completedAt = new Date('2026-10-13T09:00:00Z');
      const reminder: Partial<Reminder> = {
        id: '203',
        ownerId: '1',
        title: 'Buy coffee',
        completedAt,
      };

      const mapped = mapReminderToItem(reminder as Reminder);
      expect(mapped.status).toBe('done');
      expect(mapped.completedAt).toEqual(completedAt);
    });

    it('strips null values from reminder payload', () => {
      const reminder: Partial<Reminder> = {
        id: '204',
        ownerId: '1',
        title: 'No list',
        listId: null,
        priority: 'NONE',
        flag: false,
      };

      const mapped = mapReminderToItem(reminder as Reminder);
      expect(mapped.payload).toEqual({ priority: 'NONE', flag: false });
    });
  });

  describe('mapCalendarEventToItem', () => {
    it('maps calendar event to item matching backfill semantics', () => {
      const startAt = new Date('2026-10-16T14:00:00Z');
      const endAt = new Date('2026-10-16T15:30:00Z');
      const event: Partial<CalendarEvent> = {
        id: '303',
        ownerId: '1',
        title: 'Design sync',
        description: 'Discuss architecture roadmap',
        startAt,
        endAt,
        allDay: false,
        location: 'Room 4B',
        colorHex: '#FF5733',
        reminderMinutes: 10,
        recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR',
        deletedAt: null,
      };

      const mapped = mapCalendarEventToItem(event as CalendarEvent);

      expect(mapped).toEqual({
        ownerId: '1',
        kind: 'event',
        title: 'Design sync',
        notes: 'Discuss architecture roadmap',
        context: null,
        projectId: null,
        scheduledAt: startAt,
        durationMin: 90, // 1h 30m = 90 mins
        dueAt: null,
        notifyMinutesBefore: 10,
        rrule: 'FREQ=WEEKLY;BYDAY=FR',
        status: 'open',
        completedAt: null,
        payload: {
          allDay: false,
          location: 'Room 4B',
          colorHex: '#FF5733',
        },
        source: 'web',
        legacyTable: 'calendar_event',
        legacyId: '303',
      });
    });

    it('handles allDay and recurrence_rule null properly', () => {
      const startAt = new Date('2026-10-16T00:00:00Z');
      const endAt = new Date('2026-10-17T00:00:00Z');
      const event: Partial<CalendarEvent> = {
        id: '304',
        ownerId: '1',
        title: 'All day event',
        startAt,
        endAt,
        allDay: true,
        location: null,
        colorHex: null,
        reminderMinutes: null,
        recurrenceRule: null,
      };

      const mapped = mapCalendarEventToItem(event as CalendarEvent);
      expect(mapped.scheduledAt).toEqual(startAt);
      expect(mapped.durationMin).toBe(1440);
      expect(mapped.rrule).toBeNull();
      expect(mapped.notifyMinutesBefore).toBeNull();
      expect(mapped.payload).toEqual({ allDay: true });
    });
  });

  describe('mapTimeBlockToItem', () => {
    it('maps time block to item matching backfill semantics', () => {
      const startAt = new Date('2026-10-17T09:00:00Z');
      const endAt = new Date('2026-10-17T11:00:00Z');
      const block: Partial<TimeBlock> = {
        id: '404',
        ownerId: '1',
        title: 'Deep Focus Work',
        notes: 'Writing specs',
        startAt,
        endAt,
        category: 'focus',
        colorToken: 'husrev-amber',
        notifyMinutesBefore: 5,
        completedAt: null,
        deletedAt: null,
      };

      const mapped = mapTimeBlockToItem(block as TimeBlock);

      expect(mapped).toEqual({
        ownerId: '1',
        kind: 'event',
        title: 'Deep Focus Work',
        notes: 'Writing specs',
        context: null,
        projectId: null,
        scheduledAt: startAt,
        durationMin: 120,
        dueAt: null,
        notifyMinutesBefore: 5,
        rrule: null,
        status: 'open',
        completedAt: null,
        payload: {
          category: 'focus',
          colorToken: 'husrev-amber',
        },
        source: 'web',
        legacyTable: 'time_block',
        legacyId: '404',
      });
    });

    it('maps completed time block to status done', () => {
      const startAt = new Date('2026-10-17T09:00:00Z');
      const endAt = new Date('2026-10-17T10:00:00Z');
      const completedAt = new Date('2026-10-17T10:05:00Z');
      const block: Partial<TimeBlock> = {
        id: '405',
        ownerId: '1',
        title: 'Workout',
        startAt,
        endAt,
        completedAt,
      };

      const mapped = mapTimeBlockToItem(block as TimeBlock);
      expect(mapped.status).toBe('done');
      expect(mapped.completedAt).toEqual(completedAt);
    });
  });
});
