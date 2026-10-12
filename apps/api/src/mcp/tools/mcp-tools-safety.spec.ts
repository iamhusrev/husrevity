import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { McpServerFactory } from '../mcp-server-factory';
import { TodayService } from '../../today/today.service';
import { ItemService } from '../../item/item.service';
import { NoteService } from '../../note/note.service';
import { ProjectService } from '../../project/project.service';
import { TaskService } from '../../task/task.service';
import { RoutineService } from '../../routine/routine.service';
import { ReminderService } from '../../reminder/reminder.service';
import { UserService } from '../../user/user.service';
import { CalendarService } from '../../calendar/calendar.service';
import { TimeBlockService } from '../../time-block/time-block.service';
import { LearningService } from '../../learning/learning.service';
import { SportLogService } from '../../sport/sport-log.service';
import { SportProgramService } from '../../sport/sport-program.service';
import { SportSessionService } from '../../sport/sport-session.service';
import { SportProfileService } from '../../sport/sport-profile.service';
import { NotificationService } from '../../notification/notification.service';
import { McpSearchService } from '../mcp-search.service';
import { ChangeSetService } from '../../change-set/change-set.service';
import { GoalService } from '../../goal/goal.service';
import { NoteLinkService } from '../../note-link/note-link.service';

describe('mcp-tools-safety', () => {
  let factory: McpServerFactory;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpServerFactory,
        { provide: TodayService, useValue: {} },
        { provide: ItemService, useValue: {} },
        { provide: McpSearchService, useValue: {} },
        { provide: NoteService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: ReminderService, useValue: {} },
        { provide: TaskService, useValue: {} },
        { provide: RoutineService, useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: CalendarService, useValue: {} },
        { provide: TimeBlockService, useValue: {} },
        { provide: LearningService, useValue: {} },
        { provide: SportLogService, useValue: {} },
        { provide: SportProgramService, useValue: {} },
        { provide: SportSessionService, useValue: {} },
        { provide: SportProfileService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: ChangeSetService, useValue: {} },
        { provide: GoalService, useValue: {} },
        { provide: NoteLinkService, useValue: {} },
      ],
    }).compile();

    factory = module.get<McpServerFactory>(McpServerFactory);
  });

  describe('cross-cutting tool rules', () => {
    it('every registered tool rejects without auth or with empty scopes', async () => {
      const server = factory.createMcpServer();
      const tools = (server as any)._registeredTools || {};

      for (const [name, tool] of Object.entries<any>(tools)) {
        const handler = tool.handler;
        const hasInput = !!tool.inputSchema || !!tool.argsSchema;

        const callWithoutAuth = hasInput ? handler({}, {}) : handler({});
        await expect(callWithoutAuth).rejects.toThrow('Unauthorized: missing owner context');

        const emptyAuthExtra = { authInfo: { scopes: [], extra: { ownerId: 'u1' } } };
        const callWithEmptyScope = hasInput ? handler({}, emptyAuthExtra) : handler(emptyAuthExtra);

        await expect(callWithEmptyScope).rejects.toThrow('Forbidden: missing required scope');
      }
    });

    it('no registered tool or source file under mcp/ contains the word vault', () => {
      const server = factory.createMcpServer();
      const tools = (server as any)._registeredTools || {};

      for (const name of Object.keys(tools)) {
        expect(name.toLowerCase()).not.toContain('vault');
      }

      const scanDir = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
          } else if (fullPath.endsWith('.ts') && !fullPath.endsWith('.spec.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            expect(content.toLowerCase()).not.toContain('vault');
          }
        }
      };

      scanDir(path.join(__dirname, '..'));
    });

    it('no delete tool exists outside of the explicit allow-list', () => {
      const server = factory.createMcpServer();
      const tools = (server as any)._registeredTools || {};

      const allowList = [
        'delete_project',
        'restore_project',
        'delete_task',
        'restore_task',
        'delete_calendar_event',
        'restore_calendar_event',
        'delete_reminder',
        'restore_reminder',
        'delete_reminder_list',
        'restore_reminder_list',
      ];

      for (const name of Object.keys(tools)) {
        if (name.startsWith('delete_') || name.startsWith('remove_')) {
          expect(allowList).toContain(name);
        }
      }
    });

    it('no sport AI generation tools exist', () => {
      const server = factory.createMcpServer();
      const tools = (server as any)._registeredTools || {};

      for (const name of Object.keys(tools)) {
        expect(name.toLowerCase()).not.toContain('generate');
      }
    });
  });
});
