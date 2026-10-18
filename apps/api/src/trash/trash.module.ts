import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../task/task.entity';
import { Project } from '../project/project.entity';
import { Reminder } from '../reminder/reminder.entity';
import { ReminderList } from '../reminder/reminder-list.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { Goal } from '../goal/goal.entity';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';

/**
 * Read-only listing of soft-deleted rows. Deliberately queries a fixed set of
 * entities: nothing secret-bearing is ever part of the trash.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Task, Project, Reminder, ReminderList, CalendarEvent, Goal])],
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
