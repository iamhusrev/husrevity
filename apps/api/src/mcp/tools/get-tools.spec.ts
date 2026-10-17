import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiException } from '../../common/api.exception';
import { registerRoutineTools } from './routine-tools';
import { registerTimeBlockTools } from './time-block-tools';
import { registerLearningTools } from './learning-tools';
import { registerNoteTools } from './note-tools';
import { registerNotificationTools } from './notification-tools';
import { registerSportTools } from './sport-tools';
import { registerGoalTools } from './goal-tools';
import { registerItemTools } from './item-tools';

/**
 * Every resource with a list/create tool also has a `get_<resource>` detail tool. Each one must
 * authenticate before touching the service, scope the lookup to the caller, and surface the
 * service result unchanged.
 */
type Registrar = (server: McpServer, deps: any) => void;

interface Case {
  tool: string;
  register: Registrar;
  deps: string; // key of the service inside the deps object
  method: string;
  scopes: string[]; // any one of these must unlock the tool
}

const CASES: Case[] = [
  {
    tool: 'get_evkat_segment',
    register: registerRoutineTools,
    deps: 'routineService',
    method: 'getSegment',
    scopes: ['routine:read', 'items:read'],
  },
  {
    tool: 'get_evkat_item',
    register: registerRoutineTools,
    deps: 'routineService',
    method: 'getActivity',
    scopes: ['routine:read', 'items:read'],
  },
  {
    tool: 'get_time_block',
    register: registerTimeBlockTools,
    deps: 'timeBlockService',
    method: 'get',
    scopes: ['timeblocks:read'],
  },
  {
    tool: 'get_learning_topic',
    register: registerLearningTools,
    deps: 'learningService',
    method: 'getTopic',
    scopes: ['learning:read'],
  },
  {
    tool: 'get_learning_subtopic',
    register: registerLearningTools,
    deps: 'learningService',
    method: 'getSubtopic',
    scopes: ['learning:read'],
  },
  {
    tool: 'get_learning_item',
    register: registerLearningTools,
    deps: 'learningService',
    method: 'getItem',
    scopes: ['learning:read'],
  },
  {
    tool: 'get_note_tag',
    register: registerNoteTools,
    deps: 'noteService',
    method: 'getTag',
    scopes: ['notes:read'],
  },
  {
    tool: 'get_notification',
    register: registerNotificationTools,
    deps: 'notificationService',
    method: 'get',
    scopes: ['notifications:read'],
  },
  {
    tool: 'get_sport_session',
    register: registerSportTools,
    deps: 'sportSessionService',
    method: 'getSession',
    scopes: ['sport:read'],
  },
  {
    tool: 'get_sport_log',
    register: registerSportTools,
    deps: 'sportLogService',
    method: 'getLog',
    scopes: ['sport:read'],
  },
];

describe.each(CASES)('$tool', ({ tool, register, deps: depKey, method, scopes }) => {
  let handler: (params: unknown, extra: unknown) => Promise<any>;
  let service: Record<string, jest.Mock>;

  beforeEach(() => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    service = { [method]: jest.fn() };
    // Every service the registrar might touch is a bare object; only the tested one has the method.
    const deps = new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) => (key === depKey ? service : (target[key] ??= {})),
    });
    register(server, deps);
    const registered = (server as any)._registeredTools[tool];
    if (!registered) throw new Error(`${tool} is not registered`);
    handler = registered.handler;
  });

  const auth = (s: string[]) => ({ authInfo: { scopes: s, extra: { ownerId: 'u1' } } });

  it('throws Unauthorized when auth is missing', async () => {
    await expect(handler({ id: '1' }, {})).rejects.toThrow('Unauthorized');
    expect(service[method]).not.toHaveBeenCalled();
  });

  it('throws Forbidden when no read scope is granted', async () => {
    await expect(handler({ id: '1' }, auth(['wrong']))).rejects.toThrow('Forbidden');
    expect(service[method]).not.toHaveBeenCalled();
  });

  it.each(scopes)('returns the service result scoped to the owner with %s', async (scope) => {
    service[method].mockResolvedValueOnce({ id: '1', marker: 'ok' });

    const res = await handler({ id: '1' }, auth([scope]));

    expect(service[method]).toHaveBeenCalledWith('u1', '1');
    expect(JSON.parse(res.content[0].text)).toEqual({ id: '1', marker: 'ok' });
  });

  it('lets a not-found error from the service reach the client', async () => {
    service[method].mockRejectedValueOnce(ApiException.notFound('nope'));

    await expect(handler({ id: '9' }, auth([scopes[0]]))).rejects.toBeInstanceOf(ApiException);
  });
});

describe('get_goal', () => {
  let handler: (params: unknown, extra: unknown) => Promise<any>;
  let goalService: { get: jest.Mock };
  const auth = (s: string[]) => ({ authInfo: { scopes: s, extra: { ownerId: 'u1' } } });

  beforeEach(() => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    goalService = { get: jest.fn() };
    registerGoalTools(server, {
      goalService,
      itemService: {},
      projectService: {},
      changeSetService: {},
      noteLinkService: {},
    } as any);
    handler = (server as any)._registeredTools['get_goal'].handler;
  });

  it('throws Unauthorized when auth is missing', async () => {
    await expect(handler({ id: '1' }, {})).rejects.toThrow('Unauthorized');
  });

  it('throws Forbidden without goals:read', async () => {
    await expect(handler({ id: '1' }, auth(['wrong']))).rejects.toThrow('Forbidden');
  });

  it('returns the goal scoped to the owner', async () => {
    goalService.get.mockResolvedValueOnce({ id: '1', title: 'Ship it' });

    const res = await handler({ id: '1' }, auth(['goals:read']));

    expect(goalService.get).toHaveBeenCalledWith('u1', '1');
    expect(JSON.parse(res.content[0].text)).toMatchObject({ id: '1', title: 'Ship it' });
  });

  it('rejects a non-numeric id without calling the service', async () => {
    const res = await handler({ id: 'abc' }, auth(['goals:read']));

    expect(res.isError).toBe(true);
    expect(goalService.get).not.toHaveBeenCalled();
  });

  it('returns a tool error when the goal does not exist', async () => {
    goalService.get.mockRejectedValueOnce(ApiException.notFound('Goal not found'));

    const res = await handler({ id: '5' }, auth(['goals:read']));

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Goal not found');
  });
});

describe('get_change_set', () => {
  let handler: (params: unknown, extra: unknown) => Promise<any>;
  let changeSetService: { get: jest.Mock };
  const auth = (s: string[]) => ({ authInfo: { scopes: s, extra: { ownerId: 'u1' } } });

  beforeEach(() => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    changeSetService = { get: jest.fn() };
    registerItemTools(server, { changeSetService } as any);
    handler = (server as any)._registeredTools['get_change_set'].handler;
  });

  it('throws Unauthorized when auth is missing', async () => {
    await expect(handler({ id: '1' }, {})).rejects.toThrow('Unauthorized');
  });

  it('throws Forbidden without items:read', async () => {
    await expect(handler({ id: '1' }, auth(['wrong']))).rejects.toThrow('Forbidden');
  });

  it('returns the change set with its entries, scoped to the owner', async () => {
    changeSetService.get.mockResolvedValueOnce({ id: '1', entries: [{ id: 'e1' }] });

    const res = await handler({ id: '1' }, auth(['items:read']));

    expect(changeSetService.get).toHaveBeenCalledWith('u1', '1');
    expect(JSON.parse(res.content[0].text)).toEqual({ id: '1', entries: [{ id: 'e1' }] });
  });

  it('rejects a non-numeric id without calling the service', async () => {
    const res = await handler({ id: 'abc' }, auth(['items:read']));

    expect(JSON.parse(res.content[0].text).error).toMatch(/numeric/i);
    expect(changeSetService.get).not.toHaveBeenCalled();
  });

  it('returns an error payload when the change set does not exist', async () => {
    changeSetService.get.mockRejectedValueOnce(ApiException.notFound('Change set not found'));

    const res = await handler({ id: '7' }, auth(['items:read']));

    expect(JSON.parse(res.content[0].text).error).toBe('Change set not found');
  });
});
