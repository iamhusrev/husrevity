import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { RoutineService } from '../../routine/routine.service';
import { getOwnerAndCheckAnyScope, resolveByIdOrName, textResult } from './mcp-tool-helpers';

export interface RoutineToolsDeps {
  routineService: RoutineService;
}

export function registerRoutineTools(server: McpServer, deps: RoutineToolsDeps) {
  server.registerTool<any, any>(
    'list_evkat',
    {
      description:
        'List the Evkat daily routine: time segments (e.g. morning, evening) with their items, so an item can be added with add_evkat_item',
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['routine:read', 'items:read']);
      const segments = await deps.routineService.listSegments(ownerId);

      return textResult(segments);
    },
  );

  server.registerTool<any, any>(
    'add_evkat_item',
    {
      description:
        'Add an item to a segment of the Evkat daily routine. The segment can be given by ID or name; use list_evkat if unsure.',
      inputSchema: {
        segment: z.string().min(1).describe('Evkat segment ID or name (case-insensitive)'),
        text: z.string().min(1).max(300).describe('Routine item text'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['routine:write', 'items:write']);
      const segments = await deps.routineService.listSegments(ownerId);
      const matched = resolveByIdOrName(segments, params.segment, 'Evkat segment');

      const activity = await deps.routineService.createActivity(ownerId, String(matched.id), {
        text: params.text,
      });

      return textResult({ segment: matched.name, activity });
    },
  );

  server.registerTool<any, any>(
    'create_evkat_segment',
    {
      description: 'Create an Evkat daily routine segment',
      inputSchema: {
        name: z.string().min(1).describe('Segment name'),
        startMinute: z.number().int().min(0).max(1439).optional().describe('Start minute of day (0-1439)'),
        endMinute: z.number().int().min(0).max(1439).optional().describe('End minute of day (0-1439)'),
        theme: z.string().optional().describe('Theme'),
        colorToken: z.enum(['husrev-amber', 'ember', 'moss', 'ink', 'sand']).optional().describe('Color token'),
        daysOfWeek: z.number().int().min(1).max(127).optional().describe('Days of week bitmask (1-127)'),
        notes: z.string().optional().describe('Notes'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['routine:write', 'items:write']);
      const segment = await deps.routineService.createSegment(ownerId, {
        name: params.name,
        startMinute: params.startMinute,
        endMinute: params.endMinute,
        theme: params.theme,
        colorToken: params.colorToken,
        daysOfWeek: params.daysOfWeek,
        notes: params.notes,
      });
      return textResult(segment);
    },
  );

  server.registerTool<any, any>(
    'update_evkat_segment',
    {
      description: 'Update an Evkat daily routine segment. Omitted fields are not changed.',
      inputSchema: {
        segment: z.string().describe('Segment ID or name (case-insensitive)'),
        name: z.string().optional().describe('Segment name'),
        startMinute: z.number().int().min(0).max(1439).optional().describe('Start minute of day (0-1439)'),
        endMinute: z.number().int().min(0).max(1439).optional().describe('End minute of day (0-1439)'),
        theme: z.string().optional().describe('Theme'),
        colorToken: z.enum(['husrev-amber', 'ember', 'moss', 'ink', 'sand']).optional().describe('Color token'),
        daysOfWeek: z.number().int().min(1).max(127).optional().describe('Days of week bitmask (1-127)'),
        notes: z.string().optional().describe('Notes'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['routine:write', 'items:write']);
      const allSegments = await deps.routineService.listSegments(ownerId);
      const current = resolveByIdOrName(allSegments, params.segment, 'Evkat segment');

      const segment = await deps.routineService.updateSegment(ownerId, String(current.id), {
        name: params.name ?? current.name,
        startMinute: params.startMinute !== undefined ? params.startMinute : (current.startMinute ?? undefined),
        endMinute: params.endMinute !== undefined ? params.endMinute : (current.endMinute ?? undefined),
        theme: params.theme !== undefined ? params.theme : (current.theme ?? undefined),
        colorToken: params.colorToken !== undefined ? params.colorToken : (current.colorToken as any ?? undefined),
        daysOfWeek: params.daysOfWeek ?? current.daysOfWeek,
        notes: params.notes !== undefined ? params.notes : (current.notes ?? undefined),
      });
      return textResult(segment);
    },
  );

  server.registerTool<any, any>(
    'update_evkat_item',
    {
      description: 'Update an Evkat daily routine item',
      inputSchema: {
        id: z.string().describe('Activity item ID'),
        text: z.string().describe('New text for the item'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['routine:write', 'items:write']);
      const activity = await deps.routineService.updateActivity(ownerId, params.id, {
        text: params.text,
      });
      return textResult(activity);
    },
  );
}
