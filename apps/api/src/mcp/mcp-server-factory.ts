import { Injectable, Optional } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TodayService } from '../today/today.service';
import { ItemService } from '../item/item.service';
import { NoteService } from '../note/note.service';
import { ProjectService } from '../project/project.service';
import { ProjectAccessService } from '../project/project-access.service';
import { TaskService } from '../task/task.service';
import { RoutineService } from '../routine/routine.service';
import { ReminderService } from '../reminder/reminder.service';
import { UserService } from '../user/user.service';
import { CalendarService } from '../calendar/calendar.service';
import { TimeBlockService } from '../time-block/time-block.service';
import { LearningService } from '../learning/learning.service';
import { SportLogService } from '../sport/sport-log.service';
import { SportProgramService } from '../sport/sport-program.service';
import { SportSessionService } from '../sport/sport-session.service';
import { SportProfileService } from '../sport/sport-profile.service';
import { NotificationService } from '../notification/notification.service';
import { McpSearchService } from './mcp-search.service';
import { ChangeSetService } from '../change-set/change-set.service';
import { GoalService } from '../goal/goal.service';
import { NoteLinkService } from '../note-link/note-link.service';
import { TrashService } from '../trash/trash.service';

import { registerNoteTools } from './tools/note-tools';
import { registerProjectTools } from './tools/project-tools';
import { registerTaskTools } from './tools/task-tools';
import { registerItemTools } from './tools/item-tools';
import { registerCalendarTools } from './tools/calendar-tools';
import { registerReminderTools } from './tools/reminder-tools';
import { registerRoutineTools } from './tools/routine-tools';
import { registerTimeBlockTools } from './tools/time-block-tools';
import { registerLearningTools } from './tools/learning-tools';
import { registerSportTools } from './tools/sport-tools';
import { registerNotificationTools } from './tools/notification-tools';
import { registerCaptureTool } from './tools/capture-tool';
import { registerLifeContextTool } from './tools/life-context-tool';
import { registerPlanTool } from './tools/plan-tool';
import { registerPlanningPrompts } from './tools/planning-prompts';
import { registerGoalTools } from './tools/goal-tools';
import { registerTrashTools } from './tools/trash-tools';

@Injectable()
export class McpServerFactory {
  constructor(
    private readonly todayService: TodayService,
    private readonly itemService: ItemService,
    private readonly mcpSearchService: McpSearchService,
    private readonly noteService: NoteService,
    private readonly projectService: ProjectService,
    private readonly reminderService: ReminderService,
    private readonly taskService: TaskService,
    private readonly routineService: RoutineService,
    private readonly userService: UserService,
    private readonly calendarService: CalendarService,
    private readonly timeBlockService: TimeBlockService,
    private readonly learningService: LearningService,
    private readonly sportLogService: SportLogService,
    private readonly sportProgramService: SportProgramService,
    private readonly sportSessionService: SportSessionService,
    private readonly sportProfileService: SportProfileService,
    private readonly notificationService: NotificationService,
    private readonly changeSetService: ChangeSetService,
    private readonly goalService: GoalService,
    private readonly noteLinkService: NoteLinkService,
    private readonly trashService: TrashService,
    @Optional() private readonly projectAccessService?: ProjectAccessService,
  ) {}

  createMcpServer(): McpServer {
    const server = new McpServer({
      name: 'husrevity',
      version: '1.0.0',
    });

    registerNoteTools(server, { noteService: this.noteService });
    registerProjectTools(server, { projectService: this.projectService });
    registerTaskTools(server, {
      taskService: this.taskService,
      projectService: this.projectService,
      userService: this.userService,
    });
    registerItemTools(server, {
      itemService: this.itemService,
      todayService: this.todayService,
      mcpSearchService: this.mcpSearchService,
      reminderService: this.reminderService,
      changeSetService: this.changeSetService,
    });
    registerCalendarTools(server, { calendarService: this.calendarService });
    registerReminderTools(server, { reminderService: this.reminderService });
    registerRoutineTools(server, { routineService: this.routineService });
    registerTimeBlockTools(server, { timeBlockService: this.timeBlockService });
    registerLearningTools(server, { learningService: this.learningService });
    registerSportTools(server, {
      sportLogService: this.sportLogService,
      sportProgramService: this.sportProgramService,
      sportSessionService: this.sportSessionService,
      sportProfileService: this.sportProfileService,
    });
    registerNotificationTools(server, { notificationService: this.notificationService });

    registerCaptureTool(server, {
      itemService: this.itemService,
      changeSetService: this.changeSetService,
    });
    registerLifeContextTool(server, {
      todayService: this.todayService,
      itemService: this.itemService,
      projectService: this.projectService,
      changeSetService: this.changeSetService,
      goalService: this.goalService,
    });
    registerPlanTool(server, {
      itemService: this.itemService,
      changeSetService: this.changeSetService,
      projectAccessService: this.projectAccessService,
    });
    registerGoalTools(server, {
      goalService: this.goalService,
      itemService: this.itemService,
      projectService: this.projectService,
      changeSetService: this.changeSetService,
      noteLinkService: this.noteLinkService,
    });
    registerTrashTools(server, { trashService: this.trashService });
    registerPlanningPrompts(server);

    return server;
  }
}
