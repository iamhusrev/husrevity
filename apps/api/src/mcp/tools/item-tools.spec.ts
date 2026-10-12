import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerItemTools } from './item-tools';

describe('item-tools', () => {
  let server: McpServer;
  let itemService: any;
  let todayService: any;
  let mcpSearchService: any;
  let reminderService: any;
  let changeSetService: any;

  const fakeManager = { mock: 'manager' };

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    itemService = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      complete: jest.fn(),
      completeWithDetails: jest.fn(),
      findOccurrence: jest.fn().mockResolvedValue(null),
    };
    todayService = {
      dueToday: jest.fn(),
      timeline: jest.fn(),
      currentBlock: jest.fn(),
    };
    mcpSearchService = {
      search: jest.fn(),
    };
    reminderService = {
      createReminder: jest.fn(),
    };
    changeSetService = {
      runWithChangeSet: jest.fn(async (_ownerId: string, _meta: any, fn: any) => {
        const result = await fn('cs-mock-1', fakeManager);
        return { result, changeSetId: 'cs-mock-1' };
      }),
      recordEntry: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue({ items: [{ id: 'cs-mock-1', label: 'test' }] }),
      undo: jest.fn().mockResolvedValue({
        id: 'cs-mock-1',
        status: 'undone',
        undoneEntries: 1,
        conflicts: [],
      }),
    };
    registerItemTools(server, {
      itemService,
      todayService,
      mcpSearchService,
      reminderService,
      changeSetService,
    });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  const parseResult = (res: any) => JSON.parse(res.content[0].text);

  describe('create_item', () => {
    it('creates an item wrapped in a change_set and returns changeSetId', async () => {
      itemService.create.mockResolvedValueOnce({
        id: 'i1',
        title: 'New Task',
        kind: 'task',
        status: 'open',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const res = await getHandler('create_item')(
        { kind: 'task', title: 'New Task' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        { source: 'mcp', label: 'create_item: New Task' },
        expect.any(Function),
      );
      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ title: 'New Task' }),
        fakeManager,
      );
      expect(changeSetService.recordEntry).toHaveBeenCalledWith(
        'cs-mock-1',
        'u1',
        expect.objectContaining({
          targetType: 'item',
          targetId: 'i1',
          op: 'create',
        }),
        fakeManager,
      );
      const parsed = parseResult(res);
      expect(parsed.id).toBe('i1');
      expect(parsed.changeSetId).toBe('cs-mock-1');
    });

    it('rejects without items:write scope', async () => {
      await expect(
        getHandler('create_item')(
          { kind: 'task', title: 'New Task' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'u1' } } },
        ),
      ).rejects.toThrow('Forbidden: missing required scope');
    });
  });

  describe('update_item', () => {
    it('captures before/after in a change_set and preserves omitted fields', async () => {
      itemService.get.mockResolvedValue({
        id: 'i1',
        title: 'Old Title',
        kind: 'task',
        status: 'open',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      itemService.update.mockResolvedValueOnce({
        id: 'i1',
        title: 'New Title',
        kind: 'task',
        status: 'open',
        updatedAt: '2026-01-01T01:00:00.000Z',
      });

      const res = await getHandler('update_item')(
        { id: 'i1', title: 'New Title' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1');
      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1', fakeManager);
      expect(itemService.update).toHaveBeenCalledWith(
        'u1',
        'i1',
        { title: 'New Title' },
        undefined,
        fakeManager,
      );
      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        { source: 'mcp', label: 'update_item: Old Title' },
        expect.any(Function),
      );
      expect(changeSetService.recordEntry).toHaveBeenCalledWith(
        'cs-mock-1',
        'u1',
        expect.objectContaining({
          targetType: 'item',
          targetId: 'i1',
          op: 'update',
          before: expect.objectContaining({ title: 'Old Title' }),
          after: expect.objectContaining({ title: 'New Title' }),
        }),
        fakeManager,
      );
      const parsed = parseResult(res);
      expect(parsed.changeSetId).toBe('cs-mock-1');
    });
  });

  describe('complete_item', () => {
    it('wraps non-recurring item completion in a change_set and returns changeSetId', async () => {
      itemService.get.mockResolvedValue({
        id: 'i1',
        title: 'My Task',
        status: 'open',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      itemService.completeWithDetails.mockResolvedValueOnce({
        item: {
          id: 'i1',
          title: 'My Task',
          status: 'done',
          updatedAt: '2026-01-01T01:00:00.000Z',
        },
      });

      const res = await getHandler('complete_item')(
        { id: 'i1' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1');
      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1', fakeManager);
      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        { source: 'mcp', label: 'complete_item: My Task' },
        expect.any(Function),
      );
      expect(itemService.completeWithDetails).toHaveBeenCalledWith(
        'u1',
        'i1',
        {},
        fakeManager,
      );
      expect(changeSetService.recordEntry).toHaveBeenCalledWith(
        'cs-mock-1',
        'u1',
        expect.objectContaining({
          targetType: 'item',
          targetId: 'i1',
          op: 'complete',
        }),
        fakeManager,
      );
      const parsed = parseResult(res);
      expect(parsed.changeSetId).toBe('cs-mock-1');
    });

    it('records target_type item_occurrence with op: create when completing a new occurrence', async () => {
      itemService.get.mockResolvedValue({
        id: 'i1',
        title: 'Daily Habit',
        rrule: 'FREQ=DAILY',
        status: 'open',
      });
      itemService.findOccurrence.mockResolvedValueOnce(null);
      itemService.completeWithDetails.mockResolvedValueOnce({
        item: {
          id: 'i1',
          title: 'Daily Habit',
          status: 'open',
        },
        occurrenceId: 'occ-100',
      });

      const res = await getHandler('complete_item')(
        { id: 'i1', occursOn: '2026-01-05' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1');
      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1', fakeManager);
      expect(itemService.findOccurrence).toHaveBeenCalledWith('u1', 'i1', '2026-01-05', fakeManager);
      expect(itemService.completeWithDetails).toHaveBeenCalledWith(
        'u1',
        'i1',
        { occursOn: '2026-01-05' },
        fakeManager,
      );
      expect(changeSetService.recordEntry).toHaveBeenCalledWith(
        'cs-mock-1',
        'u1',
        expect.objectContaining({
          targetType: 'item_occurrence',
          targetId: 'occ-100',
          op: 'create',
        }),
        fakeManager,
      );
      const parsed = parseResult(res);
      expect(parsed.changeSetId).toBe('cs-mock-1');
    });

    it('records target_type item_occurrence with op: update when occurrence pre-existed', async () => {
      itemService.get.mockResolvedValue({
        id: 'i1',
        title: 'Daily Habit',
        rrule: 'FREQ=DAILY',
        status: 'open',
      });
      itemService.findOccurrence.mockResolvedValueOnce({
        id: 'occ-100',
        status: 'skipped',
        completedAt: null,
      });
      itemService.completeWithDetails.mockResolvedValueOnce({
        item: {
          id: 'i1',
          title: 'Daily Habit',
          status: 'open',
        },
        occurrenceId: 'occ-100',
      });

      const res = await getHandler('complete_item')(
        { id: 'i1', occursOn: '2026-01-05' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1');
      expect(itemService.get).toHaveBeenCalledWith('u1', 'i1', fakeManager);
      expect(changeSetService.recordEntry).toHaveBeenCalledWith(
        'cs-mock-1',
        'u1',
        expect.objectContaining({
          targetType: 'item_occurrence',
          targetId: 'occ-100',
          op: 'update',
          before: { status: 'skipped', completedAt: null },
          after: expect.objectContaining({ status: 'done' }),
        }),
        fakeManager,
      );
      const parsed = parseResult(res);
      expect(parsed.changeSetId).toBe('cs-mock-1');
    });

    it('records target_type item with op complete and returns non-null changeSetId when completing non-recurring item with occursOn', async () => {
      itemService.get.mockResolvedValue({
        id: 'i-nonrec',
        title: 'One-off Task',
        rrule: null,
        status: 'open',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      itemService.completeWithDetails.mockResolvedValueOnce({
        item: {
          id: 'i-nonrec',
          title: 'One-off Task',
          status: 'done',
          updatedAt: '2026-01-01T01:00:00.000Z',
        },
      });

      const res = await getHandler('complete_item')(
        { id: 'i-nonrec', occursOn: '2026-01-05' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(itemService.get).toHaveBeenCalledWith('u1', 'i-nonrec');
      expect(itemService.get).toHaveBeenCalledWith('u1', 'i-nonrec', fakeManager);
      expect(changeSetService.recordEntry).toHaveBeenCalledWith(
        'cs-mock-1',
        'u1',
        expect.objectContaining({
          targetType: 'item',
          targetId: 'i-nonrec',
          op: 'complete',
          before: expect.objectContaining({ status: 'open' }),
          after: expect.objectContaining({ status: 'done' }),
        }),
        fakeManager,
      );
      const parsed = parseResult(res);
      expect(parsed.changeSetId).toBe('cs-mock-1');
    });
  });

  describe('log_workout', () => {
    it('creates log item wrapped in change_set and returns changeSetId', async () => {
      itemService.create.mockResolvedValueOnce({
        id: 'i-sport',
        title: 'Koşu',
        kind: 'log',
        status: 'open',
      });

      const res = await getHandler('log_workout')(
        { activity: 'Koşu', duration_min: 45 },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        { source: 'mcp', label: 'log_workout: Koşu' },
        expect.any(Function),
      );
      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ title: 'Koşu' }),
        fakeManager,
      );
      const parsed = parseResult(res);
      expect(parsed.changeSetId).toBe('cs-mock-1');
    });
  });

  describe('quick_add', () => {
    it('returns undoable: false and records no change_set when creating a reminder with items:write scope', async () => {
      reminderService.createReminder.mockResolvedValueOnce({
        id: 'r1',
        title: 'HGS kontrol',
      });

      const res = await getHandler('quick_add')(
        { text: 'HGS kontrol' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
      const parsed = parseResult(res);
      expect(parsed.undoable).toBe(false);
      expect(parsed.id).toBe('r1');
    });

    it('rejects without items:write scope', async () => {
      await expect(
        getHandler('quick_add')(
          { text: 'HGS kontrol' },
          { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } },
        ),
      ).rejects.toThrow('Forbidden: missing required scope');
    });
  });

  describe('list_change_sets', () => {
    it('requires items:read scope and calls changeSetService.list', async () => {
      const res = await getHandler('list_change_sets')(
        { limit: 10 },
        { authInfo: { scopes: ['items:read'], extra: { ownerId: 'u1' } } },
      );

      expect(changeSetService.list).toHaveBeenCalledWith('u1', { limit: 10, before: undefined });
      const parsed = parseResult(res);
      expect(parsed).toEqual([{ id: 'cs-mock-1', label: 'test' }]);
    });

    it('rejects without items:read scope', async () => {
      await expect(
        getHandler('list_change_sets')(
          {},
          { authInfo: { scopes: ['notes:read'], extra: { ownerId: 'u1' } } },
        ),
      ).rejects.toThrow('Forbidden: missing required scope');
    });

    it.each(['abc', '', '1'.repeat(40)])(
      'returns error text result without throwing or calling service when before is "%s"',
      async (invalidBefore) => {
        const res = await getHandler('list_change_sets')(
          { before: invalidBefore },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'u1' } } },
        );

        expect(changeSetService.list).not.toHaveBeenCalled();
        const parsed = parseResult(res);
        expect(parsed.error).toBeDefined();
        expect(parsed.error).toMatch(/numeric/i);
      },
    );
  });

  describe('undo_change_set', () => {
    it('requires items:write scope and calls changeSetService.undo', async () => {
      const res = await getHandler('undo_change_set')(
        { id: '123' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
      );

      expect(changeSetService.undo).toHaveBeenCalledWith('u1', '123');
      const parsed = parseResult(res);
      expect(parsed).toEqual({
        id: 'cs-mock-1',
        status: 'undone',
        undoneEntries: 1,
        conflicts: [],
      });
    });

    it('rejects without items:write scope', async () => {
      await expect(
        getHandler('undo_change_set')(
          { id: '123' },
          { authInfo: { scopes: ['items:read'], extra: { ownerId: 'u1' } } },
        ),
      ).rejects.toThrow('Forbidden: missing required scope');
    });

    it.each(['abc', '', '1'.repeat(40)])(
      'returns error text result without throwing or calling service when id is "%s"',
      async (invalidId) => {
        const res = await getHandler('undo_change_set')(
          { id: invalidId },
          { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } },
        );

        expect(changeSetService.undo).not.toHaveBeenCalled();
        const parsed = parseResult(res);
        expect(parsed.error).toBeDefined();
        expect(parsed.error).toMatch(/numeric/i);
      },
    );
  });

  describe('list_items', () => {
    it('should call list with correct params', async () => {
      itemService.list.mockResolvedValueOnce([]);

      await getHandler('list_items')(
        { kind: 'task' },
        { authInfo: { scopes: ['items:read'], extra: { ownerId: 'u1' } } },
      );

      expect(itemService.list).toHaveBeenCalledWith('u1', {
        kind: 'task',
      });
    });
  });
});
