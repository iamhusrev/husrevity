import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { ReminderModule } from '../reminder/reminder.module';
import { TaskModule } from '../task/task.module';
import { TimeBlockModule } from '../time-block/time-block.module';
import { NotificationResyncController } from './notification-resync.controller';
import { NotificationResyncService } from './notification-resync.service';

@Module({
  imports: [ReminderModule, TaskModule, CalendarModule, TimeBlockModule],
  providers: [NotificationResyncService],
  controllers: [NotificationResyncController],
})
export class NotificationResyncModule {}
