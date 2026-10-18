import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGoalTools, GoalToolsDeps } from './goal-tools';
import { ApiException } from '../../common/api.exception';
import { SECRETS_REFUSED_MESSAGE } from './plan-input';

describe('GoalTools', () => {
  let server: McpServer;
  let deps: {
    goalService: {
      list: jest.Mock;
      get: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      restore: jest.Mock;
    };
    itemService: {
      get: jest.Mock;
      update: jest.Mock;
    };
    projectService: {
      update: jest.Mock;
    };
    changeSetService: {
      runWithChangeSet: jest.Mock;
      recordEntry: jest.Mock;
    };
    noteLinkService: {
      createLink: jest.Mock;
    };
  };

  const ownerId = 'usr_100';

  const auth = (
    scopes: string[] = [
      'goals:read',
      'goals:write',
      'items:read',
      'items:write',
      'projects:read',
      'projects:write',
      'notes:read',
      'notes:write',
    ],
  ) => ({
    authInfo: {
      scopes,
      extra: { ownerId },
    },
  });

  const getTool = (name: string) => {
    const tools = (server as any)._registeredTools;
    const tool = tools[name];
    if (!tool) throw new Error(`Tool ${name} not registered`);
    return tool.handler;
  };

  const parseResult = (res: any) => {
    if (res.content && res.content[0]?.text) {
      return JSON.parse(res.content[0].text);
    }
    return res;
  };

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    deps = {
      goalService: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        restore: jest.fn(),
      },
      itemService: {
        get: jest.fn(),
        update: jest.fn(),
      },
      projectService: {
        update: jest.fn(),
      },
      changeSetService: {
        runWithChangeSet: jest.fn(async (_uid, _meta, fn) => {
          const fakeManager = { getRepository: jest.fn() };
          const result = await fn('cs_123', fakeManager);
          return { result, changeSetId: 'cs_123' };
        }),
        recordEntry: jest.fn(),
      },
      noteLinkService: {
        createLink: jest.fn(),
      },
    };

    registerGoalTools(server, deps as unknown as GoalToolsDeps);
  });

  describe('list_goals', () => {
    it('rejects without auth or goals:read scope', async () => {
      const handler = getTool('list_goals');
      await expect(handler({}, {})).rejects.toThrow('Unauthorized: missing owner context');
      await expect(handler({}, auth([]))).rejects.toThrow(
        "Forbidden: missing required scope 'goals:read'",
      );
    });

    it('validates from/to dates using real calendar check', async () => {
      const handler = getTool('list_goals');
      const res1 = await handler({ from: '2026-02-30' }, auth(['goals:read']));
      expect(res1.isError).toBe(true);
      expect(parseResult(res1).error).toMatch(/Invalid from date/);

      const res2 = await handler({ to: 'not-a-date' }, auth(['goals:read']));
      expect(res2.isError).toBe(true);
      expect(parseResult(res2).error).toMatch(/Invalid to date/);
    });

    it('validates limit boundary', async () => {
      const handler = getTool('list_goals');
      const res = await handler({ limit: 150 }, auth(['goals:read']));
      expect(res.isError).toBe(true);
      expect(parseResult(res).error).toMatch(/limit must be an integer between 1 and 100/);
    });

    it('returns goals with progress on success', async () => {
      const handler = getTool('list_goals');
      const mockGoals = [
        {
          id: '1',
          title: 'Q1 Goal',
          horizon: 'quarter',
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
          progress: { total: 10, done: 5, open: 5, percent: 50 },
        },
      ];
      deps.goalService.list.mockResolvedValueOnce(mockGoals);

      const res = await handler({ horizon: 'quarter', limit: 25 }, auth(['goals:read']));
      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.goals).toEqual(mockGoals);
      expect(deps.goalService.list).toHaveBeenCalledWith(ownerId, {
        horizon: 'quarter',
        status: undefined,
        from: undefined,
        to: undefined,
        limit: 25,
      });
    });
  });

  describe('create_goal', () => {
    it('rejects without goals:write scope', async () => {
      const handler = getTool('create_goal');
      await expect(
        handler(
          { title: 'Goal 1', horizon: 'month', periodStart: '2026-04-01', periodEnd: '2026-04-30' },
          auth(['goals:read']),
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'goals:write'");
    });

    it('refuses secret-looking text without echoing it', async () => {
      const handler = getTool('create_goal');
      const res = await handler(
        {
          title: 'api_key=secret1234567890abcdef',
          horizon: 'month',
          periodStart: '2026-04-01',
          periodEnd: '2026-04-30',
        },
        auth(['goals:write']),
      );
      expect(res.isError).toBe(true);
      const parsed = parseResult(res);
      expect(parsed.error).toBe(SECRETS_REFUSED_MESSAGE);
      expect(JSON.stringify(res)).not.toContain('secret1234567890abcdef');
    });

    it('creates goal and returns id plus interpretation', async () => {
      const handler = getTool('create_goal');
      deps.goalService.create.mockResolvedValueOnce({
        id: '42',
        title: 'Ship Beta',
        horizon: 'quarter',
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30',
        progress: { total: 0, done: 0, open: 0, percent: 0 },
      });

      const res = await handler(
        {
          title: 'Ship Beta',
          horizon: 'quarter',
          periodStart: '2026-04-01',
          periodEnd: '2026-06-30',
          notes: 'Important milestone',
        },
        auth(['goals:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.goal.id).toBe('42');
      expect(parsed.interpretation).toBeDefined();
      expect(parsed.interpretation).toContain('Ship Beta');
      expect(deps.goalService.create).toHaveBeenCalledWith(ownerId, {
        title: 'Ship Beta',
        horizon: 'quarter',
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30',
        parentGoalId: undefined,
        notes: 'Important milestone',
      });
    });

    it('returns toolError on ApiException', async () => {
      const handler = getTool('create_goal');
      deps.goalService.create.mockRejectedValueOnce(
        ApiException.badRequest('A quarter goal can span at most 93 days'),
      );

      const res = await handler(
        {
          title: 'Bad span',
          horizon: 'quarter',
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
        },
        auth(['goals:write']),
      );

      expect(res.isError).toBe(true);
      expect(parseResult(res).error).toBe('A quarter goal can span at most 93 days');
    });
  });

  describe('update_goal', () => {
    it('requires numeric id and goals:write scope', async () => {
      const handler = getTool('update_goal');
      await expect(handler({ id: '1' }, auth(['goals:read']))).rejects.toThrow(
        "Forbidden: missing required scope 'goals:write'",
      );

      const res = await handler({ id: 'abc' }, auth(['goals:write']));
      expect(res.isError).toBe(true);
      expect(parseResult(res).error).toMatch(/Invalid id/);
    });

    it('refuses secret-looking text in update', async () => {
      const handler = getTool('update_goal');
      const res = await handler(
        { id: '1', notes: 'token: ghp_123456789012345678901234567890123456' },
        auth(['goals:write']),
      );
      expect(res.isError).toBe(true);
      expect(parseResult(res).error).toBe(SECRETS_REFUSED_MESSAGE);
    });

    it('updates goal successfully', async () => {
      const handler = getTool('update_goal');
      deps.goalService.update.mockResolvedValueOnce({
        id: '1',
        title: 'Updated title',
        status: 'done',
      });

      const res = await handler(
        { id: '1', title: 'Updated title', status: 'done' },
        auth(['goals:write']),
      );

      expect(res.isError).toBeFalsy();
      expect(parseResult(res).goal.status).toBe('done');
      expect(deps.goalService.update).toHaveBeenCalledWith(ownerId, '1', {
        title: 'Updated title',
        status: 'done',
      });
    });
  });

  describe('link_to_goal', () => {
    it('enforces scope checks per input shape', async () => {
      const handler = getTool('link_to_goal');

      // itemIds provided: requires goals:write AND items:write
      await expect(
        handler({ goalId: '1', itemIds: ['10'] }, auth(['goals:write'])),
      ).rejects.toThrow("Forbidden: missing required scope 'items:write'");

      // projectIds provided: requires goals:write AND projects:write
      await expect(
        handler({ goalId: '1', projectIds: ['20'] }, auth(['goals:write'])),
      ).rejects.toThrow("Forbidden: missing required scope 'projects:write'");

      // both provided: requires all three
      await expect(
        handler(
          { goalId: '1', itemIds: ['10'], projectIds: ['20'] },
          auth(['goals:write', 'items:write']),
        ),
      ).rejects.toThrow("Forbidden: missing required scope 'projects:write'");
    });

    it('validates all items before the first write (all-or-nothing)', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({ id: '10', title: 'Item 10', goalId: null });
      deps.itemService.get.mockRejectedValueOnce(ApiException.notFound('Item not found'));

      const res = await handler(
        { goalId: '1', itemIds: ['10', '11'] },
        auth(['goals:write', 'items:write']),
      );

      expect(res.isError).toBe(true);
      expect(parseResult(res).error).toMatch(/Item not found/);
      expect(deps.itemService.update).not.toHaveBeenCalled();
      expect(deps.changeSetService.runWithChangeSet).not.toHaveBeenCalled();
    });

    it('updates items in ONE change set and records entries', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        title: 'Item 10',
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.get.mockResolvedValueOnce({
        id: '11',
        ownerId,
        title: 'Item 11',
        goalId: null,
        updatedAt: new Date(),
      });

      deps.itemService.update.mockResolvedValueOnce({
        id: '10',
        goalId: '1',
        updatedAt: new Date(),
      });
      deps.itemService.update.mockResolvedValueOnce({
        id: '11',
        goalId: '1',
        updatedAt: new Date(),
      });

      const res = await handler(
        { goalId: '1', itemIds: ['10', '11'] },
        auth(['goals:write', 'items:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.itemsLinked).toBe(2);
      expect(parsed.itemsSkipped).toEqual([]);
      expect(parsed.changeSetId).toBe('cs_123');
      expect(parsed.undoable).toBe(true);

      expect(deps.changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        ownerId,
        { source: 'mcp', label: 'link_to_goal' },
        expect.any(Function),
      );
      expect(deps.itemService.update).toHaveBeenCalledTimes(2);
      expect(deps.changeSetService.recordEntry).toHaveBeenCalledTimes(2);
    });

    it('clears goalId when clear is true', async () => {
      const handler = getTool('link_to_goal');
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        title: 'Item 10',
        goalId: '1',
        updatedAt: new Date(),
      });
      deps.itemService.update.mockResolvedValueOnce({
        id: '10',
        goalId: null,
        updatedAt: new Date(),
      });

      const res = await handler(
        { goalId: '1', itemIds: ['10'], clear: true },
        auth(['goals:write', 'items:write']),
      );

      expect(res.isError).toBeFalsy();
      expect(deps.goalService.get).not.toHaveBeenCalled();
      expect(deps.itemService.update).toHaveBeenCalledWith(
        ownerId,
        '10',
        { goalId: null },
        undefined,
        expect.anything(),
      );
    });

    it('reports project failure per project without rolling back items', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        title: 'Item 10',
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.update.mockResolvedValueOnce({
        id: '10',
        goalId: '1',
        updatedAt: new Date(),
      });

      deps.projectService.update.mockRejectedValueOnce(
        ApiException.forbidden('Only the project owner can change the project goal'),
      );

      const res = await handler(
        { goalId: '1', itemIds: ['10'], projectIds: ['99'] },
        auth(['goals:write', 'items:write', 'projects:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.itemsLinked).toBe(1);
      expect(parsed.projects).toBeDefined();
      expect(parsed.projects).toEqual([
        { id: '99', ok: false, error: 'Only the project owner can change the project goal' },
      ]);
      expect(parsed.changeSetId).toBe('cs_123');
      expect(parsed.undoable).toBe(true);
    });

    it('skips items owned by someone else with reason not_owner and does not write them', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.get.mockResolvedValueOnce({
        id: '20',
        ownerId: 'other_user',
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.update.mockResolvedValueOnce({
        id: '10',
        goalId: '1',
        updatedAt: new Date(),
      });

      const res = await handler(
        { goalId: '1', itemIds: ['10', '20'] },
        auth(['goals:write', 'items:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.itemsLinked).toBe(1);
      expect(parsed.itemsSkipped).toEqual([{ id: '20', reason: 'not_owner' }]);
      expect(parsed.changeSetId).toBe('cs_123');
      expect(parsed.undoable).toBe(true);
      expect(deps.itemService.update).toHaveBeenCalledTimes(1);
      expect(deps.itemService.update).toHaveBeenCalledWith(
        ownerId,
        '10',
        { goalId: '1' },
        undefined,
        expect.anything(),
      );
    });

    it('projects-only call returns changeSetId: null and undoable: false', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.projectService.update.mockResolvedValueOnce({ id: '50', goalId: '1' });

      const res = await handler(
        { goalId: '1', projectIds: ['50'] },
        auth(['goals:write', 'projects:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.changeSetId).toBeNull();
      expect(parsed.itemsLinked).toBe(0);
      expect(parsed.itemsSkipped).toEqual([]);
      expect(parsed.projects).toEqual([{ id: '50', ok: true }]);
      expect(parsed.undoable).toBe(false);
      expect(deps.changeSetService.runWithChangeSet).not.toHaveBeenCalled();
    });

    it('returns tool error when every requested project failed and no item was linked', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.projectService.update.mockRejectedValueOnce(
        ApiException.forbidden('Only the project owner can change the project goal'),
      );

      const res = await handler(
        { goalId: '1', projectIds: ['50'] },
        auth(['goals:write', 'projects:write']),
      );

      expect(res.isError).toBe(true);
      const parsed = parseResult(res);
      expect(parsed.error).toContain('Only the project owner');
    });

    it('returns constant Failed to update project for non-ApiException error on project', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.update.mockResolvedValueOnce({
        id: '10',
        goalId: '1',
        updatedAt: new Date(),
      });
      deps.projectService.update.mockRejectedValueOnce(new Error('uncaught DB explosion'));

      const res = await handler(
        { goalId: '1', itemIds: ['10'], projectIds: ['50'] },
        auth(['goals:write', 'items:write', 'projects:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.itemsLinked).toBe(1);
      expect(parsed.projects).toEqual([{ id: '50', ok: false, error: 'Failed to update project' }]);
    });

    it('does not write or count already-linked items with same goalId', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        goalId: '1',
        updatedAt: new Date(),
      });
      deps.itemService.get.mockResolvedValueOnce({
        id: '11',
        ownerId,
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.update.mockResolvedValueOnce({
        id: '11',
        goalId: '1',
        updatedAt: new Date(),
      });

      const res = await handler(
        { goalId: '1', itemIds: ['10', '11'] },
        auth(['goals:write', 'items:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.itemsLinked).toBe(1);
      expect(deps.itemService.update).toHaveBeenCalledTimes(1);
      expect(deps.itemService.update).toHaveBeenCalledWith(
        ownerId,
        '11',
        { goalId: '1' },
        undefined,
        expect.anything(),
      );
    });

    it('handles write-phase failure in link_to_goal with rollback', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.get.mockResolvedValueOnce({
        id: '11',
        ownerId,
        goalId: null,
        updatedAt: new Date(),
      });

      deps.changeSetService.runWithChangeSet.mockImplementationOnce(async (_uid, _meta, fn) => {
        const fakeMgr = { mock: 'manager' };
        return fn('cs_fail', fakeMgr);
      });
      deps.itemService.update.mockResolvedValueOnce({ id: '10', goalId: '1' });
      deps.itemService.update.mockRejectedValueOnce(ApiException.conflict('Write conflict'));

      const res = await handler(
        { goalId: '1', itemIds: ['10', '11'] },
        auth(['goals:write', 'items:write']),
      );

      expect(res.isError).toBe(true);
      expect(parseResult(res).error).toBe('Write conflict');
      expect(parseResult(res).changeSetId).toBeUndefined();
    });

    it('handles empty itemIds: [] gracefully', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      const res = await handler({ goalId: '1', itemIds: [] }, auth(['goals:write', 'items:write']));
      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.itemsLinked).toBe(0);
      expect(parsed.changeSetId).toBeNull();
      expect(parsed.undoable).toBe(false);
    });

    it('deduplicates duplicate itemIds and projectIds', async () => {
      const handler = getTool('link_to_goal');
      deps.goalService.get.mockResolvedValueOnce({ id: '1', title: 'Goal 1' });
      deps.itemService.get.mockResolvedValueOnce({
        id: '10',
        ownerId,
        goalId: null,
        updatedAt: new Date(),
      });
      deps.itemService.update.mockResolvedValueOnce({
        id: '10',
        goalId: '1',
        updatedAt: new Date(),
      });
      deps.projectService.update.mockResolvedValueOnce({ id: '20', goalId: '1' });

      const res = await handler(
        { goalId: '1', itemIds: ['10', '10'], projectIds: ['20', '20'] },
        auth(['goals:write', 'items:write', 'projects:write']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.itemsLinked).toBe(1);
      expect(deps.itemService.update).toHaveBeenCalledTimes(1);
      expect(deps.projectService.update).toHaveBeenCalledTimes(1);
    });

    it('enforces 50/20 runtime caps for itemIds and projectIds', async () => {
      const handler = getTool('link_to_goal');
      const tooManyItems = Array.from({ length: 51 }, (_, i) => String(i + 1));
      const res1 = await handler(
        { goalId: '1', itemIds: tooManyItems },
        auth(['goals:write', 'items:write']),
      );
      expect(res1.isError).toBe(true);
      expect(parseResult(res1).error).toMatch(/itemIds cannot exceed 50/);

      const tooManyProjects = Array.from({ length: 21 }, (_, i) => String(i + 1));
      const res2 = await handler(
        { goalId: '1', projectIds: tooManyProjects },
        auth(['goals:write', 'projects:write']),
      );
      expect(res2.isError).toBe(true);
      expect(parseResult(res2).error).toMatch(/projectIds cannot exceed 20/);
    });
  });

  describe('link_note', () => {
    it('rejects link_note with goals:write alone', async () => {
      const handler = getTool('link_note');
      await expect(
        handler({ noteId: '1', targetType: 'goal', targetId: '30' }, auth(['goals:write'])),
      ).rejects.toThrow("Forbidden: missing required scope 'notes:write'");
    });

    it('requires notes:write and target-specific read scope', async () => {
      const handler = getTool('link_note');

      // item target requires notes:write and items:read
      await expect(
        handler({ noteId: '1', targetType: 'item', targetId: '10' }, auth(['notes:write'])),
      ).rejects.toThrow("Forbidden: missing required scope 'items:read'");

      // project target requires notes:write and projects:read
      await expect(
        handler({ noteId: '1', targetType: 'project', targetId: '20' }, auth(['notes:write'])),
      ).rejects.toThrow("Forbidden: missing required scope 'projects:read'");

      // goal target requires notes:write and goals:read
      await expect(
        handler({ noteId: '1', targetType: 'goal', targetId: '30' }, auth(['notes:write'])),
      ).rejects.toThrow("Forbidden: missing required scope 'goals:read'");
    });

    it('validates numeric ids', async () => {
      const handler = getTool('link_note');
      const res = await handler(
        { noteId: 'abc', targetType: 'goal', targetId: '30' },
        auth(['notes:write', 'goals:read']),
      );
      expect(res.isError).toBe(true);
      expect(parseResult(res).error).toMatch(/Invalid noteId/);
    });

    it('creates note link successfully through NoteLinkService', async () => {
      const handler = getTool('link_note');
      deps.noteLinkService.createLink.mockResolvedValueOnce({
        id: '100',
        noteId: '1',
        targetType: 'goal',
        targetId: '30',
        targetTitle: 'Q1 Goal',
      });

      const res = await handler(
        { noteId: '1', targetType: 'goal', targetId: '30' },
        auth(['notes:write', 'goals:read']),
      );

      expect(res.isError).toBeFalsy();
      const parsed = parseResult(res);
      expect(parsed.link.targetTitle).toBe('Q1 Goal');
      expect(deps.noteLinkService.createLink).toHaveBeenCalledWith(ownerId, '1', {
        targetType: 'goal',
        targetId: '30',
      });
    });
  });
});

describe('GoalTools: restore_goal', () => {
  let server: McpServer;
  let goalService: { restore: jest.Mock };
  const ownerId = 'usr_100';
  const auth = (scopes: string[]) => ({ authInfo: { scopes, extra: { ownerId } } });
  const handler = () => (server as any)._registeredTools['restore_goal'].handler;
  const parseResult = (res: any) => JSON.parse(res.content[0].text);

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    goalService = { restore: jest.fn() };
    registerGoalTools(server, { goalService } as unknown as GoalToolsDeps);
  });

  it('rejects without auth or goals:write scope, before looking at the id', async () => {
    await expect(handler()({ id: 'nope' }, {})).rejects.toThrow(
      'Unauthorized: missing owner context',
    );
    await expect(handler()({ id: 'nope' }, auth(['goals:read']))).rejects.toThrow(
      "Forbidden: missing required scope 'goals:write'",
    );
    expect(goalService.restore).not.toHaveBeenCalled();
  });

  it('returns a tool error for a non-numeric id without calling the service', async () => {
    const res = await handler()({ id: 'abc' }, auth(['goals:write']));
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/numeric ID/);
    expect(goalService.restore).not.toHaveBeenCalled();
  });

  it('restores the owner-scoped goal and returns it', async () => {
    goalService.restore.mockResolvedValueOnce({ id: '10', title: 'Back', status: 'active' });

    const res = await handler()({ id: '10' }, auth(['goals:write']));

    expect(goalService.restore).toHaveBeenCalledWith(ownerId, '10');
    expect(res.isError).toBeFalsy();
    expect(parseResult(res)).toEqual({ goal: { id: '10', title: 'Back', status: 'active' } });
  });

  it('surfaces a not-found ApiException as a tool error', async () => {
    goalService.restore.mockRejectedValueOnce(ApiException.notFound('Goal not found'));
    const res = await handler()({ id: '10' }, auth(['goals:write']));
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toBe('Goal not found');
  });
});
