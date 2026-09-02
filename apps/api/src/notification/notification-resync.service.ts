import { Injectable } from '@nestjs/common';
import { ReminderService } from '../reminder/reminder.service';
import { TaskService } from '../task/task.service';
import { CalendarService } from '../calendar/calendar.service';
import { TimeBlockService } from '../time-block/time-block.service';

@Injectable()
export class NotificationResyncService {
  constructor(
    private readonly reminders: ReminderService,
    private readonly tasks: TaskService,
    private readonly calendarEvents: CalendarService,
    private readonly timeBlocks: TimeBlockService,
  ) {}

  async resyncAll(ownerId: string): Promise<{
    reminders: number;
    tasks: number;
    calendarEvents: number;
    timeBlocks: number;
    total: number;
  }> {
    const [reminders, tasks, calendarEvents, timeBlocks] = await Promise.all([
      this.reminders.resyncNotifications(ownerId),
      this.tasks.resyncNotifications(ownerId),
      this.calendarEvents.resyncNotifications(ownerId),
      this.timeBlocks.resyncNotifications(ownerId),
    ]);
    const total = reminders + tasks + calendarEvents + timeBlocks;
    return { reminders, tasks, calendarEvents, timeBlocks, total };
  }
}
