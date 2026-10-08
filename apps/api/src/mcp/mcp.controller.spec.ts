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
import { PatAuthGuard } from './pat-auth.guard';

describe('McpController', () => {
  let app: INestApplication;
  let patService: { validate: jest.Mock };

  beforeEach(async () => {
    patService = { validate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpServerFactory,
        {
          provide: PatService,
          useValue: patService,
        },
        {
          provide: TodayService,
          useValue: { dueToday: jest.fn(), timeline: jest.fn(), currentBlock: jest.fn() },
        },
        {
          provide: ItemService,
          useValue: { complete: jest.fn(), create: jest.fn(), list: jest.fn() },
        },
        {
          provide: McpSearchService,
          useValue: { search: jest.fn() },
        },
        {
          provide: NoteService,
          useValue: { create: jest.fn() },
        },
        {
          provide: ProjectService,
          useValue: { list: jest.fn(), getById: jest.fn() },
        },
        {
          provide: ReminderService,
          useValue: { createReminder: jest.fn(), listReminderLists: jest.fn() },
        },
        {
          provide: RoutineService,
          useValue: { listSegments: jest.fn(), createActivity: jest.fn() },
        },
        { provide: TaskService, useValue: { createForProject: jest.fn() } },
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
