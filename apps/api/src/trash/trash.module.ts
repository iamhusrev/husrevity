import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../task/task.entity';
import { Project } from '../project/project.entity';
import { Reminder } from '../reminder/reminder.entity';
import { ReminderList } from '../reminder/reminder-list.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { Goal } from '../goal/goal.entity';
import { LearningTopic } from '../learning/learning-topic.entity';
import { LearningSubtopic } from '../learning/learning-subtopic.entity';
import { LearningItem } from '../learning/learning-item.entity';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';

/**
 * Read-only listing of soft-deleted rows. Deliberately queries a fixed set of
 * entities: nothing secret-bearing is ever part of the trash.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      Project,
      Reminder,
      ReminderList,
      CalendarEvent,
      Goal,
      LearningTopic,
      LearningSubtopic,
      LearningItem,
    ]),
  ],
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
