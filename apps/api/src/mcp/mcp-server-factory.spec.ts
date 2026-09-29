import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { McpServerFactory } from './mcp-server-factory';
import { TodayService } from '../today/today.service';
import { ItemService } from '../item/item.service';
import { NoteService } from '../note/note.service';
import { ProjectService } from '../project/project.service';
import { McpSearchService } from './mcp-search.service';
import { PAT_SCOPES } from '../auth/dto/pat-dtos';

describe('McpServerFactory', () => {
  let factory: McpServerFactory;
  let todayService: { dueToday: jest.Mock; timeline: jest.Mock; currentBlock: jest.Mock };
  let itemService: { complete: jest.Mock; create: jest.Mock; list: jest.Mock };
  let mcpSearchService: { search: jest.Mock };
  let noteService: { create: jest.Mock };
  let projectService: { list: jest.Mock; getById: jest.Mock };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpServerFactory,
        { provide: TodayService, useValue: todayService },
        { provide: ItemService, useValue: itemService },
        { provide: McpSearchService, useValue: mcpSearchService },
        { provide: NoteService, useValue: noteService },
        { provide: ProjectService, useValue: projectService },
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

    it('parses quick add text and creates item with source mcp', async () => {
      const server = factory.createMcpServer();
      const toolHandler = (server as any)._registeredTools['quick_add']?.handler;

      itemService.create.mockResolvedValueOnce({
        id: 'item_qa_1',
        kind: 'task',
        title: 'toplantı hazırlığı',
        source: 'mcp',
      });

      const res = await toolHandler(
        { text: 'toplantı hazırlığı #is' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'usr_100' } } },
      );

      expect(itemService.create).toHaveBeenCalledWith(
        'usr_100',
        expect.objectContaining({
          kind: 'task',
          title: 'toplantı hazırlığı',
          context: 'is',
          source: 'mcp',
        }),
      );

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.id).toBe('item_qa_1');
      expect(parsed.source).toBe('mcp');
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

