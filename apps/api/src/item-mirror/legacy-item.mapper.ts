import { ItemKind, ItemSource, ItemStatus } from '../item/item.entity';
import { Task } from '../task/task.entity';
import { Reminder } from '../reminder/reminder.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { TimeBlock } from '../time-block/time-block.entity';

export interface MirroredItemAttributes {
  ownerId: string;
  kind: ItemKind;
  title: string;
  notes: string | null;
  context: string | null;
  projectId: string | null;
  scheduledAt: Date | null;
  durationMin: number | null;
  dueAt: Date | null;
  notifyMinutesBefore: number | null;
  rrule: string | null;
  status: ItemStatus;
  completedAt: Date | null;
  payload: Record<string, unknown>;
  source: ItemSource;
  legacyTable: string;
  legacyId: string;
}

function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== null && val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

export function mapTaskToItem(task: Task): MirroredItemAttributes {
  let status: ItemStatus = 'open';
  if (task.status === 'CANCELLED') {
    status = 'cancelled';
  } else if (task.status === 'DONE' || task.status === 'COMPLETED') {
    status = 'done';
  }

  const payload = stripNulls({
    assigneeId: task.assigneeId,
  });

  return {
    ownerId: task.ownerId,
    kind: 'task',
    title: task.title,
    notes: task.description ?? null,
    context: null,
    projectId: task.projectId ?? null,
    scheduledAt: null,
    durationMin: null,
    dueAt: task.dueAt ? new Date(task.dueAt) : null,
    notifyMinutesBefore: task.notifyMinutesBefore ?? null,
    rrule: null,
    status,
    completedAt: null,
    payload,
    source: 'web',
    legacyTable: 'task',
    legacyId: task.id,
  };
}

export function mapReminderToItem(reminder: Reminder): MirroredItemAttributes {
  const status: ItemStatus = reminder.completedAt ? 'done' : 'open';
  const completedAt = reminder.completedAt ? new Date(reminder.completedAt) : null;

  const payload = stripNulls({
    listId: reminder.listId,
    priority: reminder.priority,
    flag: reminder.flag,
  });

  return {
    ownerId: reminder.ownerId,
    kind: 'task',
    title: reminder.title,
    notes: reminder.notes ?? null,
    context: null,
    projectId: null,
    scheduledAt: null,
    durationMin: null,
    dueAt: reminder.dueAt ? new Date(reminder.dueAt) : null,
    notifyMinutesBefore: reminder.notifyMinutesBefore ?? null,
    rrule: null,
    status,
    completedAt,
    payload,
    source: 'web',
    legacyTable: 'reminder',
    legacyId: reminder.id,
  };
}

export function mapCalendarEventToItem(event: CalendarEvent): MirroredItemAttributes {
  const scheduledAt = event.startAt ? new Date(event.startAt) : null;
  let durationMin: number | null = null;
  if (event.endAt && event.startAt) {
    durationMin = Math.round(
      (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60000,
    );
  }

  const payload = stripNulls({
    allDay: event.allDay,
    location: event.location,
    colorHex: event.colorHex,
  });

  return {
    ownerId: event.ownerId,
    kind: 'event',
    title: event.title,
    notes: event.description ?? null,
    context: null,
    projectId: null,
    scheduledAt,
    durationMin,
    dueAt: null,
    notifyMinutesBefore: event.reminderMinutes ?? null,
    rrule: event.recurrenceRule ?? null,
    status: 'open',
    completedAt: null,
    payload,
    source: 'web',
    legacyTable: 'calendar_event',
    legacyId: event.id,
  };
}

export function mapTimeBlockToItem(timeBlock: TimeBlock): MirroredItemAttributes {
  const scheduledAt = timeBlock.startAt ? new Date(timeBlock.startAt) : null;
  let durationMin: number | null = null;
  if (timeBlock.endAt && timeBlock.startAt) {
    durationMin = Math.round(
      (new Date(timeBlock.endAt).getTime() - new Date(timeBlock.startAt).getTime()) / 60000,
    );
  }

  const status: ItemStatus = timeBlock.completedAt ? 'done' : 'open';
  const completedAt = timeBlock.completedAt ? new Date(timeBlock.completedAt) : null;

  const payload = stripNulls({
    category: timeBlock.category,
    colorToken: timeBlock.colorToken,
  });

  return {
    ownerId: timeBlock.ownerId,
    kind: 'event',
    title: timeBlock.title,
    notes: timeBlock.notes ?? null,
    context: null,
    projectId: null,
    scheduledAt,
    durationMin,
    dueAt: null,
    notifyMinutesBefore: timeBlock.notifyMinutesBefore ?? null,
    rrule: null,
    status,
    completedAt,
    payload,
    source: 'web',
    legacyTable: 'time_block',
    legacyId: timeBlock.id,
  };
}
