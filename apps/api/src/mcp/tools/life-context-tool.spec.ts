import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLifeContextTool, LifeContextToolDeps } from './life-context-tool';

describe('get_life_context tool', () => {
  let server: McpServer;
  let todayService: any;
  let itemService: any;
  let projectService: any;
  let changeSetService: any;
  let goalService: any;

  // 2026-10-13 13:00 Istanbul (UTC+3, Tuesday)
  const NOW_MS = Date.parse('2026-10-13T10:00:00.000Z');

  const auth = (scopes: string[] = ['items:read']) => ({
    authInfo: { scopes, extra: { ownerId: 'u1' } },
  });
  const getHandler = () => (server as any)._registeredTools['get_life_context']?.handler;
  const call = (params: any = {}, scopes?: string[]) => getHandler()(params, auth(scopes));
  const parse = (res: any) => JSON.parse(res.content[0].text);

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    server = new McpServer({ name: 'test', version: '1.0.0' });

    todayService = {
      timeline: jest.fn().mockResolvedValue([
        {
          itemId: '10',
          title: 'Daily Standup',
          kind: 'event',
          scheduledAt: '2026-10-13T07:00:00.000Z',
          durationMin: 30,
        },
      ]),
      dueToday: jest.fn().mockResolvedValue([
        {
          itemId: '11',
          title: 'Finish report',
          dueAt: '2026-10-13T15:00:00.000Z',
          status: 'open',
          isRecurring: false,
          durationMin: null,
        },
      ]),
      currentBlock: jest.fn().mockReturnValue(null),
    };

    itemService = {
      list: jest.fn().mockImplementation(async (_ownerId: string, query: any) => {
        // If range query for upcoming (future from/to)
        if (query.from && query.from >= '2026-10-13T21:00:00.000Z') {
          return [
            {
              id: '20',
              kind: 'task',
              title: 'Tomorrow Task',
              notes: 'Long notes '.repeat(30), // > 200 chars
              scheduledAt: '2026-10-14T06:00:00.000Z', // 09:00 Istanbul
              dueAt: null,
              durationMin: 45,
              context: 'work',
              projectId: '5',
              status: 'open',
            },
            {
              id: '21',
              kind: 'event',
              title: 'Recurring Event Occurrence',
              notes: 'Short notes',
              scheduledAt: '2026-10-15T07:00:00.000Z',
              occursOn: '2026-10-15',
              durationMin: 60,
              status: 'open',
            },
          ];
        }
        // If query for overdue (to is start of today: 2026-10-12T21:00:00.000Z)
        if (query.to && query.to <= '2026-10-12T21:00:00.000Z') {
          return [
            {
              id: '30',
              kind: 'task',
              title: 'Overdue Task 1',
              notes: 'Overdue notes',
              dueAt: '2026-10-10T12:00:00.000Z',
              scheduledAt: null,
              status: 'open',
            },
            {
              id: '31',
              kind: 'task',
              title: 'Overdue Task 2 (earlier)',
              notes: null,
              dueAt: '2026-10-08T12:00:00.000Z',
              scheduledAt: null,
              status: 'open',
            },
            {
              id: '32',
              kind: 'task',
              title: 'No deadline task',
              dueAt: null,
              scheduledAt: '2026-10-09T10:00:00.000Z',
              status: 'open',
            },
          ];
        }
        return [];
      }),
    };

    projectService = {
      listOwned: jest.fn().mockResolvedValue([
        { id: '1', name: 'Husrevity', code: 'HUS', status: 'ACTIVE', archived: false },
        { id: '2', name: 'Archived Project', code: 'ARC', status: 'COMPLETED', archived: true },
        { id: '3', name: 'Personal', code: 'PER', status: 'ACTIVE', archived: false },
      ]),
    };

    changeSetService = {
      list: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'cs-1',
            label: 'capture: buy milk',
            source: 'mcp',
            status: 'applied',
            createdAt: '2026-10-13T09:00:00.000Z',
          },
        ],
      }),
    };

    goalService = {
      list: jest.fn().mockResolvedValue([]),
    };

    const deps: LifeContextToolDeps = {
      todayService,
      itemService,
      projectService,
      changeSetService,
      goalService,
    };
    registerLifeContextTool(server, deps);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is registered under the name get_life_context', () => {
    expect(getHandler()).toBeDefined();
  });

  describe('scopes and auth', () => {
    it('rejects without auth context', async () => {
      await expect(getHandler()({}, {})).rejects.toThrow('Unauthorized: missing owner context');
    });

    it('rejects without items:read scope', async () => {
      await expect(call({}, ['notes:read'])).rejects.toThrow(
        "Forbidden: missing required scope 'items:read'",
      );
    });

    it('omits activeProjects when token lacks projects:read scope', async () => {
      const res = parse(await call({}, ['items:read']));
      expect(res.activeProjects).toBeUndefined();
      expect(projectService.listOwned).not.toHaveBeenCalled();
    });

    it('includes activeProjects when token carries projects:read scope', async () => {
      const res = parse(await call({}, ['items:read', 'projects:read']));
      expect(res.activeProjects).toBeDefined();
      expect(projectService.listOwned).toHaveBeenCalledWith('u1');
      expect(res.activeProjects).toEqual([
        { id: '1', name: 'Husrevity', code: 'HUS', status: 'ACTIVE' },
        { id: '3', name: 'Personal', code: 'PER', status: 'ACTIVE' },
      ]);
    });
  });

  describe('days input validation', () => {
    it('defaults to 7 days when days is omitted', async () => {
      const res = parse(await call({}));
      expect(res.today.date).toBe('2026-10-13');
      expect(itemService.list).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          from: '2026-10-13T21:00:00.000Z', // 2026-10-14 00:00 Istanbul in UTC
          to: '2026-10-20T20:59:59.999Z', // 2026-10-20 23:59:59.999 Istanbul in UTC
        }),
      );
    });

    it.each([0, -1, 15, 100, 1.5, 'seven'])(
      'rejects invalid days value %j with a tool error',
      async (invalidDays) => {
        const res = await call({ days: invalidDays });
        expect(res.isError).toBe(true);
        expect(parse(res).error).toMatch(/days must be an integer between 1 and 14/i);
      },
    );

    it('accepts valid days within [1, 14]', async () => {
      const res = await call({ days: 3 });
      expect(res.isError).toBeUndefined();
      expect(itemService.list).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          from: '2026-10-13T21:00:00.000Z',
          to: '2026-10-16T20:59:59.999Z',
        }),
      );
    });
  });

  describe('today section', () => {
    it('returns today date, timeline, dueToday and currentBlock', async () => {
      const res = parse(await call({}));
      expect(res.today).toEqual({
        date: '2026-10-13',
        timeline: [
          {
            itemId: '10',
            title: 'Daily Standup',
            kind: 'event',
            scheduledAt: '2026-10-13T07:00:00.000Z',
            durationMin: 30,
          },
        ],
        dueToday: [
          {
            itemId: '11',
            title: 'Finish report',
            dueAt: '2026-10-13T15:00:00.000Z',
            status: 'open',
            isRecurring: false,
            durationMin: null,
          },
        ],
        currentBlock: null,
      });
      expect(todayService.timeline).toHaveBeenCalledWith('u1');
      expect(todayService.dueToday).toHaveBeenCalledWith('u1');
    });
  });

  describe('upcoming section', () => {
    it('groups open items by Istanbul date and truncates notes to 200 characters', async () => {
      const res = parse(await call({ days: 7 }));
      expect(res.upcoming).toBeDefined();
      expect(res.upcoming['2026-10-14']).toBeDefined();
      expect(res.upcoming['2026-10-14'][0].title).toBe('Tomorrow Task');
      expect(res.upcoming['2026-10-14'][0].notes.length).toBe(200);
      expect(res.upcoming['2026-10-15']).toBeDefined();
      expect(res.upcoming['2026-10-15'][0].title).toBe('Recurring Event Occurrence');
    });

    it('sorts upcoming items by instant (Istanbul date, then time) interleaving recurring occurrences (L2)', async () => {
      itemService.list.mockImplementationOnce(async () => [
        // Non-recurring returned first by list
        {
          id: '100',
          kind: 'task',
          title: 'Late Morning Task',
          scheduledAt: '2026-10-14T08:00:00.000Z', // 11:00 Istanbul
          status: 'open',
        },
        {
          id: '101',
          kind: 'task',
          title: 'Day 2 Task',
          scheduledAt: '2026-10-15T06:00:00.000Z', // 09:00 Istanbul
          status: 'open',
        },
        // Recurring returned after non-recurring by list, but occurs earlier on day 1
        {
          id: '102',
          kind: 'task',
          title: 'Early Morning Routine',
          scheduledAt: '2026-01-01T04:00:00.000Z', // 07:00 Istanbul template
          occursOn: '2026-10-14',
          status: 'open',
        },
      ]);

      const res = parse(await call({ days: 7 }));
      expect(res.upcoming['2026-10-14']).toBeDefined();
      expect(res.upcoming['2026-10-14']).toHaveLength(2);
      expect(res.upcoming['2026-10-14'][0].title).toBe('Early Morning Routine'); // 07:00 Istanbul
      expect(res.upcoming['2026-10-14'][1].title).toBe('Late Morning Task'); // 11:00 Istanbul
      expect(res.upcoming['2026-10-15'][0].title).toBe('Day 2 Task');
    });

    it('caps total upcoming items across days at 100 rows, sets truncated flag, and reports real total in counts (L2)', async () => {
      const hundredAndTen = Array.from({ length: 110 }, (_, i) => ({
        id: String(i),
        kind: 'task',
        title: `Task ${i}`,
        scheduledAt: '2026-10-14T06:00:00.000Z',
        status: 'open',
      }));
      itemService.list.mockResolvedValueOnce(hundredAndTen);

      const res = parse(await call({ days: 7 }));
      const count = Object.values(res.upcoming).reduce(
        (sum: number, list: any) => sum + list.length,
        0,
      );
      expect(count).toBe(100);
      expect(res.truncated.upcoming).toBe(true);
      expect(res.counts.upcoming).toBe(110);
    });

    it('sets truncated.upcoming to false when count <= 100', async () => {
      const res = parse(await call({ days: 7 }));
      expect(res.truncated.upcoming).toBe(false);
      expect(res.counts.upcoming).toBe(2);
    });
  });

  describe('overdue section', () => {
    it('returns open items with dueAt before today sorted ascending by dueAt, capped at 50', async () => {
      const res = parse(await call({}));
      expect(res.overdue).toBeDefined();
      expect(res.overdue).toHaveLength(2); // items 31 and 30 (item 32 has no dueAt)
      expect(res.overdue[0].id).toBe('31'); // earlier date first
      expect(res.overdue[1].id).toBe('30');
      expect(res.truncated.overdue).toBe(false);
      expect(res.counts.overdue).toBe(2);
    });

    it('caps overdue items at 50, sets truncated flag, and reports real total in counts (L2)', async () => {
      const sixtyOverdue = Array.from({ length: 60 }, (_, i) => ({
        id: String(i),
        kind: 'task',
        title: `Overdue ${i}`,
        dueAt: '2026-10-01T10:00:00.000Z',
        status: 'open',
      }));
      itemService.list.mockImplementation(async (_owner: string, query: any) => {
        if (query.to && query.to <= '2026-10-12T21:00:00.000Z') {
          return sixtyOverdue;
        }
        return [];
      });

      const res = parse(await call({}));
      expect(res.overdue).toHaveLength(50);
      expect(res.truncated.overdue).toBe(true);
      expect(res.counts.overdue).toBe(60);
    });
  });

  describe('active goals section', () => {
    it('omits activeGoals field when caller lacks goals:read scope', async () => {
      const res = parse(await call({}, ['items:read']));
      expect(res.activeGoals).toBeUndefined();
      expect(res.counts.activeGoals).toBeUndefined();
      expect(res.truncated.goals).toBeUndefined();
    });

    it('returns activeGoals sorted by periodEnd with progress when goals:read is present', async () => {
      const mockGoals = [
        {
          id: 'g2',
          title: 'Year goal',
          horizon: 'year',
          status: 'active',
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          progress: { total: 20, done: 10, open: 10, percent: 50 },
        },
        {
          id: 'g1',
          title: 'Month goal',
          horizon: 'month',
          status: 'active',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          progress: { total: 5, done: 2, open: 3, percent: 40 },
        },
      ];
      goalService.list.mockResolvedValueOnce(mockGoals);

      const res = parse(await call({}, ['items:read', 'goals:read']));

      expect(res.activeGoals).toBeDefined();
      expect(res.activeGoals).toHaveLength(2);
      // Sorted by periodEnd ascending: g1 (2026-10-31) before g2 (2026-12-31)
      expect(res.activeGoals[0].id).toBe('g1');
      expect(res.activeGoals[1].id).toBe('g2');
      expect(res.activeGoals[0].progress).toEqual({ total: 5, done: 2, open: 3, percent: 40 });
      expect(res.counts.activeGoals).toBe(2);
      expect(res.truncated.goals).toBe(false);
      expect(goalService.list).toHaveBeenCalledWith('u1', {
        status: 'active',
        from: '2026-10-13',
        to: '2026-10-13',
        limit: 21,
      });
    });

    it('caps activeGoals at 20 and sets truncated.goals flag when >20 goals exist', async () => {
      const manyGoals = Array.from({ length: 25 }, (_, i) => ({
        id: `g-${i + 1}`,
        title: `Goal ${i + 1}`,
        horizon: 'month',
        status: 'active',
        periodStart: '2026-10-01',
        periodEnd: `2026-10-${String(i + 1).padStart(2, '0')}`,
        progress: { total: 0, done: 0, open: 0, percent: 0 },
      }));
      goalService.list.mockResolvedValueOnce(manyGoals);

      const res = parse(await call({}, ['items:read', 'goals:read']));

      expect(res.activeGoals).toHaveLength(20);
      expect(res.truncated.goals).toBe(true);
      expect(res.counts.activeGoals).toBe(20);
    });
  });

  describe('recent changes and counts', () => {
    it('returns last 5 change sets', async () => {
      const res = parse(await call({}));
      expect(res.recentChanges).toEqual([
        {
          id: 'cs-1',
          label: 'capture: buy milk',
          source: 'mcp',
          status: 'applied',
          createdAt: '2026-10-13T09:00:00.000Z',
        },
      ]);
      expect(changeSetService.list).toHaveBeenCalledWith('u1', { limit: 5 });
    });

    it('returns summary counts', async () => {
      const res = parse(await call({}, ['items:read', 'projects:read']));
      expect(res.counts).toEqual({
        todayDue: 1,
        todayTimeline: 1,
        upcoming: 2,
        overdue: 2,
        activeProjects: 2,
        recentChanges: 1,
      });
    });
  });
});
