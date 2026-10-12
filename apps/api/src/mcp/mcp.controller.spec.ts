import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server-factory';
import { McpSearchService } from './mcp-search.service';
import { PatService } from '../auth/pat.service';
import { TodayService } from '../today/today.service';
import { ItemService } from '../item/item.service';
import { NoteService } from '../note/note.service';
import { ProjectService } from '../project/project.service';
import { TaskService } from '../task/task.service';
import { RoutineService } from '../routine/routine.service';
import { ReminderService } from '../reminder/reminder.service';
import { UserService } from '../user/user.service';
import { PatAuthGuard } from './pat-auth.guard';
import { CalendarService } from '../calendar/calendar.service';
import { TimeBlockService } from '../time-block/time-block.service';
import { LearningService } from '../learning/learning.service';
import { SportLogService } from '../sport/sport-log.service';
import { SportProgramService } from '../sport/sport-program.service';
import { SportSessionService } from '../sport/sport-session.service';
import { SportProfileService } from '../sport/sport-profile.service';
import { NotificationService } from '../notification/notification.service';
import { ChangeSetService } from '../change-set/change-set.service';
import { GoalService } from '../goal/goal.service';
import { NoteLinkService } from '../note-link/note-link.service';

describe('McpController', () => {
  let app: INestApplication;
  let patService: { validate: jest.Mock };

  beforeEach(async () => {
    patService = { validate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpServerFactory,
        { provide: PatService, useValue: patService },
        {
          provide: TodayService,
          useValue: { dueToday: jest.fn(), timeline: jest.fn(), currentBlock: jest.fn() },
        },
        {
          provide: ItemService,
          useValue: { complete: jest.fn(), create: jest.fn(), list: jest.fn() },
        },
        { provide: McpSearchService, useValue: { search: jest.fn() } },
        { provide: NoteService, useValue: { create: jest.fn() } },
        { provide: ProjectService, useValue: { list: jest.fn(), getById: jest.fn() } },
        {
          provide: ReminderService,
          useValue: { createReminder: jest.fn(), listReminderLists: jest.fn() },
        },
        {
          provide: RoutineService,
          useValue: { listSegments: jest.fn(), createActivity: jest.fn() },
        },
        {
          provide: TaskService,
          useValue: {
            createForProject: jest.fn(),
            get: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            restore: jest.fn(),
            listForProject: jest.fn(),
          },
        },
        { provide: UserService, useValue: { requireById: jest.fn() } },
        { provide: CalendarService, useValue: {} },
        { provide: TimeBlockService, useValue: {} },
        { provide: LearningService, useValue: {} },
        { provide: SportLogService, useValue: {} },
        { provide: SportProgramService, useValue: {} },
        { provide: SportSessionService, useValue: {} },
        { provide: SportProfileService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        {
          provide: ChangeSetService,
          useValue: {
            runWithChangeSet: jest.fn(),
            recordEntry: jest.fn(),
            list: jest.fn(),
            undo: jest.fn(),
          },
        },
        {
          provide: GoalService,
          useValue: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn() },
        },
        { provide: NoteLinkService, useValue: { createLink: jest.fn() } },
        PatAuthGuard,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('should be defined', () => {
    const controller = app.get<McpController>(McpController);
    expect(controller).toBeDefined();
  });

  it('should reject requests without valid Bearer PAT with 401', async () => {
    patService.validate.mockResolvedValueOnce(null);

    await supertest(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', 'Bearer invalid_pat')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })
      .expect(401);
  });

  it('should process MCP initialize request successfully with valid PAT', async () => {
    patService.validate.mockResolvedValueOnce({
      ownerId: 'usr_123',
      scopes: ['items:read'],
    });

    const res = await supertest(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', 'Bearer valid_pat')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })
      .expect(200);

    expect(res.text).toContain('"name":"husrevity"');
  });
});
