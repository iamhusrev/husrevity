import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { parseQuickAdd } from '@husrevity/parser';
import { DateTime } from 'luxon';
import { TodayService } from '../today/today.service';
import { ItemService } from '../item/item.service';
import { NoteService } from '../note/note.service';
import { ProjectService } from '../project/project.service';
import { McpSearchService } from './mcp-search.service';
import { PatScope } from '../auth/personal-access-token.entity';

function getOwnerAndCheckScope(
  extra: any,
  requiredScopes: PatScope | PatScope[],
): { ownerId: string } {
  const authInfo = extra?.authInfo;
  if (!authInfo || !authInfo.extra?.ownerId) {
    throw new Error('Unauthorized: missing owner context');
  }
  const scopes: PatScope[] = authInfo.scopes || [];
  const required = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];
  for (const s of required) {
    if (!scopes.includes(s)) {
      throw new Error(`Forbidden: missing required scope '${s}'`);
    }
  }
  return { ownerId: String(authInfo.extra.ownerId) };
}

@Injectable()
export class McpServerFactory {
  constructor(
    private readonly todayService: TodayService,
    private readonly itemService: ItemService,
    private readonly mcpSearchService: McpSearchService,
    private readonly noteService: NoteService,
    private readonly projectService: ProjectService,
  ) {}

  createMcpServer(): McpServer {
    const server = new McpServer({
      name: 'husrevity',
      version: '1.0.0',
    });

    server.registerTool<any, any>(
      'get_today',
      {
        description:
          "Fetch today's due items, event timeline, and active timeblock for the authenticated user",
      },
      async (extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
        const dueToday = await this.todayService.dueToday(ownerId);
        const timeline = await this.todayService.timeline(ownerId);
        const currentBlock = this.todayService.currentBlock(timeline);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ dueToday, timeline, currentBlock }, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'complete_item',
      {
        description: 'Complete a task item or a single occurrence of a recurring item by ID',
        inputSchema: {
          id: z.string().describe('Item ID to complete'),
          occursOn: z
            .string()
            .optional()
            .describe('YYYY-MM-DD date string required when completing a recurring item'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
        const result = await this.itemService.complete(ownerId, params.id, {
          occursOn: params.occursOn,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'quick_add',
      {
        description:
          'Quickly add a task or item using Turkish natural language text parsing',
        inputSchema: {
          text: z
            .string()
            .describe(
              'Natural language text to parse and create an item from (e.g. "yarın 9da HGS kontrol #alican !yüksek")',
            ),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
        const parsed = await parseQuickAdd(params.text);
        const result = await this.itemService.create(ownerId, {
          kind: 'task',
          title: parsed.title,
          scheduledAt: parsed.scheduledAt,
          context: parsed.context,
          rrule: parsed.rrule,
          source: 'mcp',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'search',
      {
        description:
          'Search items (tasks/events/logs) and notes by title matching a search query',
        inputSchema: {
          query: z.string().describe('Search query string to match titles against'),
          kinds: z
            .array(z.string())
            .optional()
            .describe(
              'Optional filter for result types (e.g. ["item", "note"] or ["task", "event", "log"])',
            ),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, ['items:read', 'notes:read']);
        const results = await this.mcpSearchService.search(ownerId, params.query, {
          kinds: params.kinds,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'create_note',
      {
        description: 'Create a new note with optional markdown body and pinned flag',
        inputSchema: {
          title: z.string().describe('Title of the note'),
          body: z.string().optional().describe('Markdown body of the note'),
          pinned: z.boolean().optional().describe('Whether the note is pinned'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'notes:write');
        const note = await this.noteService.create(ownerId, {
          title: params.title,
          bodyMarkdown: params.body,
          pinned: params.pinned,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(note, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'list_projects',
      {
        description: 'List projects accessible by the authenticated user with optional filter',
        inputSchema: {
          filter: z
            .enum(['all', 'mine', 'shared'])
            .optional()
            .describe('Filter projects by ownership: "all", "mine", or "shared"'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'projects:read');
        const projects = await this.projectService.list(ownerId, params?.filter);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'get_project',
      {
        description: 'Get project details by project ID',
        inputSchema: {
          id: z.string().describe('Project ID'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'projects:read');
        const project = await this.projectService.getById(ownerId, params.id);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(project, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'log_workout',
      {
        description: 'Log a workout activity into the sport context',
        inputSchema: {
          activity: z
            .string()
            .describe('Name of the workout activity (e.g. "Koşu", "Fitness", "Yüzme")'),
          duration_min: z.number().int().positive().describe('Duration in minutes'),
          details: z.string().optional().describe('Optional workout details or notes'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
        const item = await this.itemService.create(ownerId, {
          kind: 'log',
          title: params.activity,
          context: 'spor',
          // Logged "just now" — the tool has no date param, and without a
          // scheduledAt the entry would never show up in any date-scoped
          // view (Today, /sync range, etc.), even though it was created.
          scheduledAt: new Date().toISOString(),
          durationMin: params.duration_min,
          notes: params.details ?? null,
          source: 'mcp',
          payload: {
            activity: params.activity,
            duration_min: params.duration_min,
            ...(params.details ? { details: params.details } : {}),
          },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(item, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'plan_week',
      {
        description:
          'Fetch items (tasks, events, occurrences) scheduled within a 7-day weekly window',
        inputSchema: {
          from: z
            .string()
            .optional()
            .describe('Start date string (ISO format or YYYY-MM-DD). Defaults to today if omitted'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
        const start = params?.from
          ? DateTime.fromISO(params.from, { zone: 'Europe/Istanbul' }).startOf('day')
          : DateTime.now().setZone('Europe/Istanbul').startOf('day');
        const startDate = start.isValid
          ? start
          : DateTime.now().setZone('Europe/Istanbul').startOf('day');
        const endDate = startDate.plus({ days: 6 }).endOf('day');

        const items = await this.itemService.list(ownerId, {
          from: startDate.toUTC().toISO()!,
          to: endDate.toUTC().toISO()!,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(items, null, 2),
            },
          ],
        };
      },
    );

    return server;
  }
}
