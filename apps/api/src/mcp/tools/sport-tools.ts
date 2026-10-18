import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SportLogService } from '../../sport/sport-log.service';
import { SportProgramService } from '../../sport/sport-program.service';
import { SportSessionService } from '../../sport/sport-session.service';
import { SportProfileService } from '../../sport/sport-profile.service';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';

export interface SportToolDeps {
  sportLogService: SportLogService;
  sportProgramService: SportProgramService;
  sportSessionService: SportSessionService;
  sportProfileService: SportProfileService;
}

export function registerSportTools(server: McpServer, deps: SportToolDeps) {
  server.registerTool<any, any>(
    'get_sport_session',
    {
      description: 'Get a sport session by ID',
      inputSchema: { id: z.string().describe('Session ID') },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      return textResult(await deps.sportSessionService.getSession(ownerId, params.id));
    },
  );

  server.registerTool<any, any>(
    'get_sport_log',
    {
      description: 'Get a single sport log entry by ID',
      inputSchema: { id: z.string().describe('Sport log ID') },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      return textResult(await deps.sportLogService.getLog(ownerId, params.id));
    },
  );

  server.registerTool<any, any>(
    'log_sport_session',
    {
      description:
        'Log a sport session or workout. With sessionId this is an idempotent upsert: it overrides the existing log for that session on the given date. Without sessionId it always adds a new free-workout log (several per day are kept).',
      inputSchema: {
        executedDate: z.string().describe('YYYY-MM-DD execution date'),
        actualDuration: z.number().int().min(0).describe('Actual duration in minutes'),
        completed: z.boolean().describe('Whether the session was completed'),
        intensity: z.number().int().min(1).max(10).describe('Intensity from 1 to 10'),
        sessionId: z.string().optional().describe('Optional ID of the planned session'),
        notes: z.string().optional().describe('Optional notes'),
        caloriesBurned: z.number().int().min(0).optional().describe('Optional calories burned'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:write');
      const log = await deps.sportLogService.logWorkout(ownerId, {
        executedDate: params.executedDate,
        actualDuration: params.actualDuration,
        completed: params.completed,
        intensity: params.intensity,
        sessionId: params.sessionId,
        notes: params.notes,
        caloriesBurned: params.caloriesBurned,
      });
      return textResult(log);
    },
  );

  server.registerTool<any, any>(
    'list_sport_logs',
    {
      description: 'List sport logs for a given period.',
      inputSchema: {
        from: z.string().describe('Start date YYYY-MM-DD'),
        to: z.string().describe('End date YYYY-MM-DD'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      const logs = await deps.sportLogService.getLogsForPeriod(ownerId, params.from, params.to);
      return textResult(logs);
    },
  );

  server.registerTool<any, any>(
    'sport_stats',
    {
      description: 'Get aggregated sport statistics.',
      inputSchema: {
        from: z.string().optional().describe('Start date YYYY-MM-DD'),
        to: z.string().optional().describe('End date YYYY-MM-DD'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      const stats = await deps.sportLogService.getStats(ownerId, params.from, params.to);
      return textResult(stats);
    },
  );

  server.registerTool<any, any>(
    'get_sport_profile',
    {
      description: 'Get sport profile for the owner.',
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      const profile = await deps.sportProfileService.getOrCreate(ownerId);
      return textResult(profile);
    },
  );

  server.registerTool<any, any>(
    'update_sport_profile',
    {
      description: 'Update the sport profile for the owner.',
      inputSchema: {
        fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('Fitness level'),
        weeklyHours: z.number().int().min(1).max(168).describe('Target weekly hours'),
        preferredActivities: z.array(z.string()).optional().describe('Preferred activities'),
        goals: z.string().optional().describe('Goals'),
        notes: z.string().optional().describe('Notes'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:write');
      const profile = await deps.sportProfileService.update(ownerId, {
        fitnessLevel: params.fitnessLevel,
        weeklyHours: params.weeklyHours,
        preferredActivities: params.preferredActivities ?? [],
        goals: params.goals,
        notes: params.notes,
      });
      return textResult(profile);
    },
  );

  server.registerTool<any, any>(
    'list_sport_programs',
    {
      description: 'List sport programs.',
      inputSchema: {
        activeOnly: z.boolean().optional().describe('Whether to return only active programs'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      const programs = await deps.sportProgramService.listPrograms(ownerId, params.activeOnly);
      return textResult(programs);
    },
  );

  server.registerTool<any, any>(
    'get_sport_program',
    {
      description: 'Get a specific sport program.',
      inputSchema: {
        id: z.string().describe('Program ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      const program = await deps.sportProgramService.getProgram(ownerId, params.id);
      return textResult(program);
    },
  );

  server.registerTool<any, any>(
    'create_sport_program',
    {
      description: 'Create a new sport program.',
      inputSchema: {
        name: z.string().describe('Program name'),
        weekCount: z.number().int().min(4).max(52).describe('Duration in weeks'),
        programType: z.enum(['WEEKLY', 'MONTHLY']).describe('Program type'),
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD'),
        description: z.string().optional().describe('Description'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:write');
      const program = await deps.sportProgramService.createProgram(ownerId, {
        name: params.name,
        weekCount: params.weekCount,
        programType: params.programType,
        startDate: params.startDate,
        endDate: params.endDate,
        description: params.description,
      });
      return textResult(program);
    },
  );

  server.registerTool<any, any>(
    'activate_sport_program',
    {
      description: 'Activate or deactivate a sport program.',
      inputSchema: {
        id: z.string().describe('Program ID'),
        isActive: z.boolean().describe('Activation status'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:write');
      const program = await deps.sportProgramService.activateProgram(ownerId, params.id, params.isActive);
      return textResult(program);
    },
  );

  server.registerTool<any, any>(
    'list_sport_sessions',
    {
      description: 'List sport sessions for a program.',
      inputSchema: {
        programId: z.string().describe('Program ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:read');
      const sessions = await deps.sportSessionService.listSessions(ownerId, params.programId);
      return textResult(sessions);
    },
  );

  server.registerTool<any, any>(
    'create_sport_session',
    {
      description: 'Create a sport session.',
      inputSchema: {
        programId: z.string().describe('Program ID'),
        name: z.string().describe('Session name'),
        activityType: z.enum(['RUNNING', 'YOGA', 'SWIMMING', 'STRENGTH', 'GYM', 'CYCLING', 'FOOTBALL', 'CUSTOM']).describe('Activity type'),
        location: z.enum(['EV', 'SALON', 'YÜZME', 'DIS']).describe('Location'),
        plannedDayOfWeek: z
          .number()
          .int()
          .min(0)
          .max(6)
          .describe('Planned day of week: 0=Monday, 1=Tuesday ... 6=Sunday'),
        plannedDuration: z.number().int().min(1).describe('Planned duration in minutes'),
        difficulty: z.enum(['EASY', 'MODERATE', 'HARD']).describe('Difficulty level'),
        description: z.string().optional().describe('Description'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:write');
      const session = await deps.sportSessionService.createSession(ownerId, params.programId, {
        name: params.name,
        activityType: params.activityType,
        location: params.location,
        plannedDayOfWeek: params.plannedDayOfWeek,
        plannedDuration: params.plannedDuration,
        difficulty: params.difficulty,
        description: params.description,
      });
      return textResult(session);
    },
  );

  server.registerTool<any, any>(
    'update_sport_session',
    {
      description: 'Update a sport session. Merges with current session fields.',
      inputSchema: {
        id: z.string().describe('Session ID'),
        name: z.string().optional().describe('Session name'),
        activityType: z.enum(['RUNNING', 'YOGA', 'SWIMMING', 'STRENGTH', 'GYM', 'CYCLING', 'FOOTBALL', 'CUSTOM']).optional().describe('Activity type'),
        location: z.enum(['EV', 'SALON', 'YÜZME', 'DIS']).optional().describe('Location'),
        plannedDayOfWeek: z
          .number()
          .int()
          .min(0)
          .max(6)
          .optional()
          .describe('Planned day of week: 0=Monday, 1=Tuesday ... 6=Sunday'),
        plannedDuration: z.number().int().min(1).optional().describe('Planned duration in minutes'),
        difficulty: z.enum(['EASY', 'MODERATE', 'HARD']).optional().describe('Difficulty level'),
        description: z.string().optional().describe('Description'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'sport:write');
      const current = await deps.sportSessionService.getSession(ownerId, params.id);
      
      const session = await deps.sportSessionService.updateSession(ownerId, params.id, {
        name: params.name !== undefined ? params.name : current.name,
        activityType: params.activityType !== undefined ? params.activityType : current.activityType,
        location: params.location !== undefined ? params.location : current.location,
        plannedDayOfWeek: params.plannedDayOfWeek !== undefined ? params.plannedDayOfWeek : current.plannedDayOfWeek,
        plannedDuration: params.plannedDuration !== undefined ? params.plannedDuration : current.plannedDuration,
        difficulty: params.difficulty !== undefined ? params.difficulty : current.difficulty,
        description: params.description !== undefined ? params.description : current.description,
      });
      return textResult(session);
    },
  );
}
