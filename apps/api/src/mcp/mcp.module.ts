import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TodayModule } from '../today/today.module';
import { ItemModule } from '../item/item.module';
import { NoteModule } from '../note/note.module';
import { ProjectModule } from '../project/project.module';
import { TaskModule } from '../task/task.module';
import { RoutineModule } from '../routine/routine.module';
import { ReminderModule } from '../reminder/reminder.module';
import { UserModule } from '../user/user.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TimeBlockModule } from '../time-block/time-block.module';
import { LearningModule } from '../learning/learning.module';
import { SportModule } from '../sport/sport.module';
import { NotificationModule } from '../notification/notification.module';
import { ChangeSetModule } from '../change-set/change-set.module';
import { GoalModule } from '../goal/goal.module';
import { NoteLinkModule } from '../note-link/note-link.module';
import { TrashModule } from '../trash/trash.module';
import { Item } from '../item/item.entity';
import { Note } from '../note/note.entity';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server-factory';
import { McpSearchService } from './mcp-search.service';
import { PatAuthGuard } from './pat-auth.guard';

@Module({
  imports: [
    AuthModule,
    TodayModule,
    ItemModule,
    NoteModule,
    ProjectModule,
    TaskModule,
    ReminderModule,
    RoutineModule,
    UserModule,
    CalendarModule,
    TimeBlockModule,
    LearningModule,
    SportModule,
    NotificationModule,
    ChangeSetModule,
    GoalModule,
    NoteLinkModule,
    TrashModule,
    TypeOrmModule.forFeature([Item, Note]),
  ],
  controllers: [McpController],
  providers: [McpServerFactory, McpSearchService, PatAuthGuard],
  exports: [McpServerFactory, McpSearchService],
})
export class McpModule {}
