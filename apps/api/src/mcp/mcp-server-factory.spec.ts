import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { McpServerFactory } from './mcp-server-factory';
import { TodayService } from '../today/today.service';
import { ItemService } from '../item/item.service';
import { NoteService } from '../note/note.service';
import { ProjectService } from '../project/project.service';
import { TaskService } from '../task/task.service';
import { RoutineService } from '../routine/routine.service';
import { ReminderService } from '../reminder/reminder.service';
import { McpSearchService } from './mcp-search.service';
import { PAT_SCOPES } from '../auth/dto/pat-dtos';

describe('McpServerFactory', () => {
  let factory: McpServerFactory;
  let todayService: { dueToday: jest.Mock; timeline: jest.Mock; currentBlock: jest.Mock };
  let itemService: { complete: jest.Mock; create: jest.Mock; list: jest.Mock };
  let mcpSearchService: { search: jest.Mock };
  let noteService: { create: jest.Mock };
  let projectService: { list: jest.Mock; getById: jest.Mock };
  let routineService: { listSegments: jest.Mock; createActivity: jest.Mock };
  let taskService: { createForProject: jest.Mock };
  let reminderService: { createReminder: jest.Mock; listReminderLists: jest.Mock };

  beforeEach(async () => {
    todayService = {
      dueToday: jest.fn(),
      timeline: jest.fn(),
      currentBlock: jest.fn(),
    };
    itemService = {
      complete: jest.fn(),
      create: jest.fn(),
      list: jest.fn(),
    };
    mcpSearchService = {
      search: jest.fn(),
    };
    noteService = {
      create: jest.fn(),
    };
    projectService = {
      list: jest.fn(),
      getById: jest.fn(),
    };
    routineService = { listSegments: jest.fn(), createActivity: jest.fn() };
    taskService = { createForProject: jest.fn() };
    reminderService = {
      createReminder: jest.fn(),
      listReminderLists: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpServerFactory,
        { provide: TodayService, useValue: todayService },
        { provide: ItemService, useValue: itemService },
        { provide: McpSearchService, useValue: mcpSearchService },
        { provide: NoteService, useValue: noteService },
        { provide: ProjectService, useValue: projectService },
        { provide: ReminderService, useValue: reminderService },
        { provide: TaskService, useValue: taskService },
        { provide: RoutineService, useValue: routineService },
      ],
    }).compile();

    factory = module.get<McpServerFactory>(McpServerFactory);
  });

  it('creates an McpServer instance with registered tools', () => {
    const server = factory.createMcpServer();
    expect(server).toBeDefined();
  });

  describe('get_today tool', () => {
    it('throws error when auth context or items:read scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['get_today']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({})).rejects.toThrow('Unauthorized: missing owner context');
      await expect(
        toolHandler({ authInfo: { scopes: ['notes:read'], extra: { ownerId: 'user1' } } }),
      ).rejects.toThrow("Forbidden: missing required scope 'items:read'");
    });

    it('returns today view when items:read scope is present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['get_today']?.handler;

      todayService.dueToday.mockResolvedValueOnce([{ itemId: '1', title: 'Task 1' }]);
      todayService.timeline.mockResolvedValueOnce([{ itemId: '2', title: 'Event 1' }]);
      todayService.currentBlock.mockReturnValueOnce(null);

      const res = await toolHandler({
        authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } },
      });

      expect(todayService.dueToday).toHaveBeenCalledWith('usr_100');
      expect(todayService.timeline).toHaveBeenCalledWith('usr_100');
      expect(todayService.currentBlock).toHaveBeenCalled();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.dueToday).toEqual([{ itemId: '1', title: 'Task 1' }]);
      expect(parsed.timeline).toEqual([{ itemId: '2', title: 'Event 1' }]);
      expect(parsed.currentBlock).toBeNull();
    });
  });

  describe('complete_item tool', () => {
    it('throws error when auth context or items:write scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['complete_item']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({ id: 'item_1' }, {})).rejects.toThrow('Unauthorized: missing owner context');
      await expect(
        toolHandler(
          { id: 'item_1' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'user1' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'items:write'");
    });

    it('completes item when items:write scope is present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['complete_item']?.handler;

      itemService.complete.mockResolvedValueOnce({
        id: 'item_1',
        status: 'done',
      });

      const res = await toolHandler(
        { id: 'item_1', occursOn: '2026-09-28' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'usr_100' } } },
      );

      expect(itemService.complete).toHaveBeenCalledWith('usr_100', 'item_1', {
        occursOn: '2026-09-28',
      });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.id).toBe('item_1');
      expect(parsed.status).toBe('done');
    });
  });

  describe('quick_add tool', () => {
    it('throws error when auth context or items:write scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['quick_add']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({ text: 'toplantı hazırlığı' }, {})).rejects.toThrow(
        'Unauthorized: missing owner context',
      );
      await expect(
        toolHandler(
          { text: 'toplantı hazırlığı' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'user1' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'items:write'");
    });

    it('parses quick add text and creates a reminder instead of an item', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['quick_add']?.handler;

      reminderService.createReminder.mockResolvedValueOnce({
        id: 'rem_qa_1',
        title: 'toplantı hazırlığı',
        dueAt: null,
      });

      const res = await toolHandler(
        { text: 'toplantı hazırlığı' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'usr_100' } } },
      );

      expect(reminderService.createReminder).toHaveBeenCalledWith(
        'usr_100',
        expect.objectContaining({
          title: 'toplantı hazırlığı',
          notifyMinutesBefore: null,
        }),
      );
      expect(itemService.create).not.toHaveBeenCalled();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.id).toBe('rem_qa_1');
      expect(parsed.warning).toBeUndefined();
    });

    it('notifies at due time and warns when the text is recurring', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['quick_add']?.handler;

      reminderService.createReminder.mockResolvedValueOnce({ id: 'rem_qa_2' });

      const res = await toolHandler(
        { text: 'her gün 9da ilaç al' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'usr_100' } } },
      );

      const [, req] = reminderService.createReminder.mock.calls[0];
      expect(req.dueAt).toEqual(expect.any(String));
      expect(req.notifyMinutesBefore).toBe(0);
      expect(itemService.create).not.toHaveBeenCalled();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.warning).toContain('Recurrence is not supported');
    });
  });

  describe('create_reminder tool', () => {
    const auth = { authInfo: { scopes: ['items:write'], extra: { ownerId: 'usr_100' } } };

    it('throws error when auth context or items:write scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_reminder']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({ title: 'x' }, {})).rejects.toThrow(
        'Unauthorized: missing owner context',
      );
      await expect(
        toolHandler(
          { title: 'x' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'user1' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'items:write'");
    });

    it('passes structured fields through and defaults notifyMinutesBefore to 0 with dueAt', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_reminder']?.handler;
      reminderService.createReminder.mockResolvedValueOnce({ id: 'rem_1' });

      await toolHandler(
        {
          title: 'HGS kontrol',
          dueAt: '2026-10-09T09:00:00+03:00',
          notes: 'bakiye',
          priority: 'HIGH',
          flag: true,
          listId: 'list_1',
        },
        auth,
      );

      expect(reminderService.createReminder).toHaveBeenCalledWith('usr_100', {
        title: 'HGS kontrol',
        dueAt: '2026-10-09T09:00:00+03:00',
        notes: 'bakiye',
        priority: 'HIGH',
        flag: true,
        listId: 'list_1',
        notifyMinutesBefore: 0,
      });
    });

    it('keeps notifyMinutesBefore null without dueAt and honors an explicit value', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_reminder']?.handler;
      reminderService.createReminder.mockResolvedValue({ id: 'rem_2' });

      await toolHandler({ title: 'tarihsiz' }, auth);
      await toolHandler({ title: 'erken', dueAt: '2026-10-09T09:00:00+03:00', notifyMinutesBefore: 15 }, auth);

      expect(reminderService.createReminder.mock.calls[0][1].notifyMinutesBefore).toBeNull();
      expect(reminderService.createReminder.mock.calls[1][1].notifyMinutesBefore).toBe(15);
    });
  });

  describe('create_task tool', () => {
    const auth = { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'usr_100' } } };
    const projects = [
      { id: '7', code: 'WEB', name: 'Husrevity Web' },
      { id: '8', code: 'API', name: 'Husrevity API' },
    ];

    it('requires projects:write scope', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_task']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(
        toolHandler(
          { project: 'web', title: 'x' },
          { authInfo: { scopes: ['items:write', 'projects:read'], extra: { ownerId: 'u' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'projects:write'");
    });

    it('resolves the project by name case-insensitively and creates the task there', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_task']?.handler;
      projectService.list.mockResolvedValueOnce(projects);
      taskService.createForProject.mockResolvedValueOnce({ id: 't1', title: 'HGS kontrol' });

      const res = await toolHandler(
        { project: 'husrevity web', title: 'HGS kontrol', priority: 'HIGH' },
        auth,
      );

      expect(taskService.createForProject).toHaveBeenCalledWith(
        'usr_100',
        '7',
        expect.objectContaining({ title: 'HGS kontrol', priority: 'HIGH', notifyMinutesBefore: null }),
      );
      expect(itemService.create).not.toHaveBeenCalled();
      expect(JSON.parse(res.content[0].text).project).toBe('Husrevity Web');
    });

    it('resolves by id or code', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_task']?.handler;
      projectService.list.mockResolvedValue(projects);
      taskService.createForProject.mockResolvedValue({ id: 't2' });

      await toolHandler({ project: '8', title: 'a' }, auth);
      await toolHandler({ project: 'web', title: 'b' }, auth);

      expect(taskService.createForProject.mock.calls[0][1]).toBe('8');
      expect(taskService.createForProject.mock.calls[1][1]).toBe('7');
    });

    it('fails with available projects when not found, and when ambiguous', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_task']?.handler;
      projectService.list.mockResolvedValue([
        ...projects,
        { id: '9', code: 'WEB2', name: 'Husrevity Web' },
      ]);

      await expect(toolHandler({ project: 'yok', title: 'x' }, auth)).rejects.toThrow(
        'Project not found',
      );
      await expect(toolHandler({ project: 'Husrevity Web', title: 'x' }, auth)).rejects.toThrow(
        'ambiguous',
      );
      expect(taskService.createForProject).not.toHaveBeenCalled();
    });
  });

  describe('Evkat tools', () => {
    const segments = [
      { id: '1', name: 'Sabah', activities: [] },
      { id: '2', name: 'Akşam', activities: [] },
    ];
    const write = { authInfo: { scopes: ['items:write'], extra: { ownerId: 'usr_100' } } };

    it('list_evkat requires items:read and returns segments', async () => {
      const server = factory.createMcpServer();
      const handler = (server as any)._registeredTools['list_evkat']?.handler;
      routineService.listSegments.mockResolvedValueOnce(segments);

      await expect(
        handler({ authInfo: { scopes: ['notes:read'], extra: { ownerId: 'u' } } }),
      ).rejects.toThrow("Forbidden: missing required scope 'items:read'");
      const res = await handler({
        authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } },
      });
      expect(JSON.parse(res.content[0].text)).toEqual(segments);
    });

    it('add_evkat_item requires items:write and adds to the segment matched by name', async () => {
      const server = factory.createMcpServer();
      const handler = (server as any)._registeredTools['add_evkat_item']?.handler;
      routineService.listSegments.mockResolvedValue(segments);
      routineService.createActivity.mockResolvedValue({ id: 'a1', text: 'Su iç' });

      await expect(
        handler(
          { segment: 'sabah', text: 'x' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'u' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'items:write'");

      const res = await handler({ segment: 'akşam', text: 'Su iç' }, write);
      expect(routineService.createActivity).toHaveBeenCalledWith('usr_100', '2', {
        text: 'Su iç',
      });
      expect(JSON.parse(res.content[0].text).segment).toBe('Akşam');
    });

    it('add_evkat_item fails when the segment is unknown', async () => {
      const server = factory.createMcpServer();
      const handler = (server as any)._registeredTools['add_evkat_item']?.handler;
      routineService.listSegments.mockResolvedValue(segments);

      await expect(handler({ segment: 'öğle', text: 'x' }, write)).rejects.toThrow(
        'Evkat segment not found',
      );
      expect(routineService.createActivity).not.toHaveBeenCalled();
    });
  });

  describe('list_reminder_lists tool', () => {
    it('requires items:read and returns the lists', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['list_reminder_lists']?.handler;
      reminderService.listReminderLists.mockResolvedValueOnce([{ id: 'l1', name: 'Genel' }]);

      await expect(
        toolHandler({ authInfo: { scopes: ['notes:read'], extra: { ownerId: 'u' } } }),
      ).rejects.toThrow("Forbidden: missing required scope 'items:read'");

      const res = await toolHandler({
        authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } },
      });
      expect(reminderService.listReminderLists).toHaveBeenCalledWith('usr_100');
      expect(JSON.parse(res.content[0].text)).toEqual([{ id: 'l1', name: 'Genel' }]);
    });
  });

  describe('search tool', () => {
    it('throws error when items:read or notes:read scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['search']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(
        toolHandler(
          { query: 'HGS' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'notes:read'");
    });

    it('executes search when both items:read and notes:read scopes are present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['search']?.handler;

      mcpSearchService.search.mockResolvedValueOnce([
        { type: 'item', id: 'item_1', title: 'HGS kontrol' },
      ]);

      const res = await toolHandler(
        { query: 'HGS', kinds: ['item'] },
        {
          authInfo: {
            scopes: ['items:read', 'notes:read'],
            extra: { ownerId: 'usr_100' },
          },
        },
      );

      expect(mcpSearchService.search).toHaveBeenCalledWith('usr_100', 'HGS', {
        kinds: ['item'],
      });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed).toEqual([{ type: 'item', id: 'item_1', title: 'HGS kontrol' }]);
    });
  });

  describe('create_note tool', () => {
    it('throws error when auth context or notes:write scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_note']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({ title: 'New Note' }, {})).rejects.toThrow(
        'Unauthorized: missing owner context',
      );
      await expect(
        toolHandler(
          { title: 'New Note' },
          { authInfo: { scopes: ['notes:read'], extra: { ownerId: 'usr_100' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'notes:write'");
    });

    it('creates note via NoteService when notes:write scope is present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['create_note']?.handler;

      noteService.create.mockResolvedValueOnce({
        id: 'note_123',
        title: 'Meeting Notes',
        bodyMarkdown: 'Discussed roadmap',
        pinned: true,
      });

      const res = await toolHandler(
        { title: 'Meeting Notes', body: 'Discussed roadmap', pinned: true },
        { authInfo: { scopes: ['notes:write'], extra: { ownerId: 'usr_100' } } },
      );

      expect(noteService.create).toHaveBeenCalledWith('usr_100', {
        title: 'Meeting Notes',
        bodyMarkdown: 'Discussed roadmap',
        pinned: true,
      });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.id).toBe('note_123');
      expect(parsed.title).toBe('Meeting Notes');
    });
  });

  describe('list_projects tool', () => {
    it('throws error when auth context or projects:read scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['list_projects']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({}, {})).rejects.toThrow('Unauthorized: missing owner context');
      await expect(
        toolHandler({}, { authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } } }),
      ).rejects.toThrow("Forbidden: missing required scope 'projects:read'");
    });

    it('lists projects via ProjectService when projects:read scope is present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['list_projects']?.handler;

      projectService.list.mockResolvedValueOnce([
        { id: 'proj_1', code: 'HUS', name: 'Husrevity' },
      ]);

      const res = await toolHandler(
        { filter: 'mine' },
        { authInfo: { scopes: ['projects:read'], extra: { ownerId: 'usr_100' } } },
      );

      expect(projectService.list).toHaveBeenCalledWith('usr_100', 'mine');

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed).toEqual([{ id: 'proj_1', code: 'HUS', name: 'Husrevity' }]);
    });
  });

  describe('get_project tool', () => {
    it('throws error when auth context or projects:read scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['get_project']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({ id: 'proj_1' }, {})).rejects.toThrow(
        'Unauthorized: missing owner context',
      );
      await expect(
        toolHandler(
          { id: 'proj_1' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'projects:read'");
    });

    it('gets project by ID via ProjectService when projects:read scope is present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['get_project']?.handler;

      projectService.getById.mockResolvedValueOnce({
        id: 'proj_1',
        code: 'HUS',
        name: 'Husrevity',
      });

      const res = await toolHandler(
        { id: 'proj_1' },
        { authInfo: { scopes: ['projects:read'], extra: { ownerId: 'usr_100' } } },
      );

      expect(projectService.getById).toHaveBeenCalledWith('usr_100', 'proj_1');

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed).toEqual({ id: 'proj_1', code: 'HUS', name: 'Husrevity' });
    });
  });

  describe('log_workout tool', () => {
    it('throws error when auth context or items:write scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['log_workout']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(
        toolHandler({ activity: 'Koşu', duration_min: 45 }, {}),
      ).rejects.toThrow('Unauthorized: missing owner context');
      await expect(
        toolHandler(
          { activity: 'Koşu', duration_min: 45 },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } } },
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'items:write'");
    });

    it('creates workout log item via ItemService when items:write scope is present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['log_workout']?.handler;

      itemService.create.mockResolvedValueOnce({
        id: 'item_log_1',
        kind: 'log',
        title: 'Koşu',
        context: 'spor',
        durationMin: 45,
        source: 'mcp',
      });

      const res = await toolHandler(
        { activity: 'Koşu', duration_min: 45, details: '5km tempolu' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'usr_100' } } },
      );

      expect(itemService.create).toHaveBeenCalledWith('usr_100', {
        kind: 'log',
        title: 'Koşu',
        context: 'spor',
        scheduledAt: expect.any(String),
        durationMin: 45,
        notes: '5km tempolu',
        source: 'mcp',
        payload: {
          activity: 'Koşu',
          duration_min: 45,
          details: '5km tempolu',
        },
      });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.id).toBe('item_log_1');
      expect(parsed.kind).toBe('log');
    });
  });

  describe('plan_week tool', () => {
    it('throws error when auth context or items:read scope is missing', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['plan_week']?.handler;
      expect(toolHandler).toBeDefined();

      await expect(toolHandler({}, {})).rejects.toThrow('Unauthorized: missing owner context');
      await expect(
        toolHandler({}, { authInfo: { scopes: ['notes:read'], extra: { ownerId: 'usr_100' } } }),
      ).rejects.toThrow("Forbidden: missing required scope 'items:read'");
    });

    it('fetches week items via ItemService.list when items:read scope is present', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['plan_week']?.handler;

      itemService.list.mockResolvedValueOnce([
        { id: 'item_wk_1', title: 'Weekly Planning', kind: 'task' },
      ]);

      const res = await toolHandler(
        { from: '2026-09-28' },
        { authInfo: { scopes: ['items:read'], extra: { ownerId: 'usr_100' } } },
      );

      expect(itemService.list).toHaveBeenCalledWith(
        'usr_100',
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      );

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed).toEqual([{ id: 'item_wk_1', title: 'Weekly Planning', kind: 'task' }]);
    });
  });

  describe('Vault exclusion safety checks', () => {
    it('ensures PAT_SCOPES does not include any vault-related scope', () => {
      const vaultScopes = PAT_SCOPES.filter((scope) => scope.includes('vault'));
      expect(vaultScopes).toEqual([]);
    });

    it('ensures mcp-server-factory.ts does not import or reference any vault service or module', () => {
      const factoryFilePath = path.join(__dirname, 'mcp-server-factory.ts');
      const content = fs.readFileSync(factoryFilePath, 'utf8');

      expect(content.toLowerCase()).not.toContain('vault');
    });

    it('ensures registered MCP tools do not contain any vault-related tool', () => {
      const server = factory.createMcpServer();
      const toolNames = Object.keys((server as any)._registeredTools || {});

      const vaultTools = toolNames.filter((name) => name.toLowerCase().includes('vault'));
      expect(vaultTools).toEqual([]);
    });
  });
});

