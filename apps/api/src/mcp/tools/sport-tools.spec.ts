import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSportTools } from './sport-tools';

describe('sport-tools', () => {
  let server: McpServer;
  let deps: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    deps = {
      sportLogService: { logWorkout: jest.fn(), getLogsForPeriod: jest.fn(), getStats: jest.fn() },
      sportProgramService: { listPrograms: jest.fn(), getProgram: jest.fn(), createProgram: jest.fn(), activateProgram: jest.fn() },
      sportSessionService: { listSessions: jest.fn(), getSession: jest.fn(), createSession: jest.fn(), updateSession: jest.fn() },
      sportProfileService: { getOrCreate: jest.fn(), update: jest.fn() },
    };
    registerSportTools(server, deps);
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  it('log_sport_session throws without auth', async () => {
    await expect(getHandler('log_sport_session')({}, {})).rejects.toThrow('Unauthorized');
  });

  it('log_sport_session calls service when valid', async () => {
    deps.sportLogService.logWorkout.mockResolvedValueOnce({ id: '1' });
    await getHandler('log_sport_session')(
      { executedDate: '2026-10-09', actualDuration: 45, completed: true, intensity: 8 },
      { authInfo: { scopes: ['sport:write'], extra: { ownerId: 'u1' } } }
    );
    expect(deps.sportLogService.logWorkout).toHaveBeenCalledWith('u1', expect.objectContaining({
      executedDate: '2026-10-09',
      actualDuration: 45,
      completed: true,
      intensity: 8,
    }));
  });

  // The DB and the web count 0 = Monday ... 6 = Sunday (sport-session.entity.ts, `sport.day`
  // i18n keys). A bare "0-6" in the tool description let callers assume 0 = Sunday and shifted
  // every planned day by one.
  it.each(['create_sport_session', 'update_sport_session'])(
    '%s documents plannedDayOfWeek as 0=Monday ... 6=Sunday',
    (toolName) => {
      const schema = (server as any)._registeredTools[toolName].inputSchema;
      const description: string = schema.shape.plannedDayOfWeek.description;
      expect(description).toContain('0=Monday');
      expect(description).toContain('6=Sunday');
    },
  );

  it('update_sport_session merges with current session', async () => {
    deps.sportSessionService.getSession.mockResolvedValueOnce({
      id: 's1', name: 'S', activityType: 'RUNNING', location: 'DIS', plannedDayOfWeek: 1, plannedDuration: 30, difficulty: 'EASY'
    });
    deps.sportSessionService.updateSession.mockResolvedValueOnce({ id: 's1' });

    await getHandler('update_sport_session')(
      { id: 's1', difficulty: 'HARD' },
      { authInfo: { scopes: ['sport:write'], extra: { ownerId: 'u1' } } }
    );
    expect(deps.sportSessionService.updateSession).toHaveBeenCalledWith('u1', 's1', expect.objectContaining({
      difficulty: 'HARD',
      activityType: 'RUNNING',
    }));
  });
});
