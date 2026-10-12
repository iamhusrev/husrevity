import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { TimeBlockService } from '../../time-block/time-block.service';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';

export interface TimeBlockToolsDeps {
  timeBlockService: TimeBlockService;
}

export function registerTimeBlockTools(server: McpServer, deps: TimeBlockToolsDeps) {
  server.registerTool<any, any>(
    'list_time_blocks',
    {
      description: 'List time blocks. Provide either date (YYYY-MM-DD) or both from and to (ISO 8601).',
      inputSchema: {
        date: z.string().optional().describe('Date in YYYY-MM-DD format'),
        from: z.string().optional().describe('From date-time in ISO 8601'),
        to: z.string().optional().describe('To date-time in ISO 8601'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'timeblocks:read');
      if (params.date) {
        const blocks = await deps.timeBlockService.listForDate(ownerId, params.date);
        return textResult(blocks);
      } else if (params.from && params.to) {
        const blocks = await deps.timeBlockService.listForRange(ownerId, params.from, params.to);
        return textResult(blocks);
      } else {
        throw new Error('Provide either date or both from and to');
      }
    },
  );

  server.registerTool<any, any>(
    'create_time_block',
    {
      description: 'Create a time block',
      inputSchema: {
        title: z.string().describe('Title of the time block'),
        startAt: z.string().describe('Start date-time in ISO 8601'),
        endAt: z.string().describe('End date-time in ISO 8601'),
        notes: z.string().optional().describe('Notes'),
        category: z.enum(['work', 'focus', 'rest', 'exercise', 'family', 'other']).optional().describe('Category'),
        colorToken: z.string().optional().describe('Color token'),
        notifyMinutesBefore: z.number().int().min(0).optional().describe('Minutes before startAt to notify'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'timeblocks:write');
      const block = await deps.timeBlockService.create(ownerId, {
        title: params.title,
        startAt: params.startAt,
        endAt: params.endAt,
        notes: params.notes,
        category: params.category,
        colorToken: params.colorToken,
        notifyMinutesBefore: params.notifyMinutesBefore,
      });
      return textResult(block);
    },
  );

  server.registerTool<any, any>(
    'update_time_block',
    {
      description: 'Update a time block. This is a full replace, so title, startAt, and endAt are required.',
      inputSchema: {
        id: z.string().describe('Time block ID'),
        title: z.string().describe('Title of the time block'),
        startAt: z.string().describe('Start date-time in ISO 8601'),
        endAt: z.string().describe('End date-time in ISO 8601'),
        notes: z.string().optional().describe('Notes'),
        category: z.enum(['work', 'focus', 'rest', 'exercise', 'family', 'other']).optional().describe('Category'),
        colorToken: z.string().optional().describe('Color token'),
        notifyMinutesBefore: z.number().int().min(0).optional().describe('Minutes before startAt to notify'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'timeblocks:write');
      const block = await deps.timeBlockService.update(ownerId, params.id, {
        title: params.title,
        startAt: params.startAt,
        endAt: params.endAt,
        notes: params.notes,
        category: params.category,
        colorToken: params.colorToken,
        notifyMinutesBefore: params.notifyMinutesBefore,
      });
      return textResult(block);
    },
  );

  server.registerTool<any, any>(
    'toggle_time_block_complete',
    {
      description: 'Flips the completed state of a time block',
      inputSchema: {
        id: z.string().describe('Time block ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'timeblocks:write');
      const block = await deps.timeBlockService.toggleComplete(ownerId, params.id);
      return textResult(block);
    },
  );
}
