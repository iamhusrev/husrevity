import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { parseQuickAdd } from '@husrevity/parser';
import { DateTime } from 'luxon';
import { TodayService } from '../today/today.service';
import { ItemService } from '../item/item.service';
import { NoteService } from '../note/note.service';
import { ProjectService } from '../project/project.service';
import { TaskService } from '../task/task.service';
import { RoutineService } from '../routine/routine.service';
import { ReminderService } from '../reminder/reminder.service';
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
    private readonly reminderService: ReminderService,
    private readonly taskService: TaskService,
    private readonly routineService: RoutineService,
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
          'Quickly add a reminder (shown on the Reminders page) from Turkish natural language text. Fires at the parsed due time. Recurrence is not supported: a recurring phrase creates a one-off reminder for its first occurrence.',
        inputSchema: {
          text: z
            .string()
            .describe(
              'Natural language text to parse and create a reminder from (e.g. "yarın 9da HGS kontrol")',
            ),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
        const parsed = await parseQuickAdd(params.text);
        const dueAt = parsed.scheduledAt ?? undefined;
        const reminder = await this.reminderService.createReminder(ownerId, {
          title: parsed.title,
          dueAt,
          notifyMinutesBefore: dueAt ? 0 : null,
        });
        const result = parsed.rrule
          ? {
              ...reminder,
              warning:
                'Recurrence is not supported for reminders; created a one-off reminder for the first occurrence.',
            }
          : reminder;

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
      'create_reminder',
      {
        description:
          'Create a reminder shown on the Reminders page. Prefer this over quick_add when you can provide structured fields. Use Europe/Istanbul time for dueAt.',
        inputSchema: {
          title: z.string().min(1).max(255).describe('Reminder title'),
          dueAt: z
            .string()
            .optional()
            .describe('Due date-time in ISO 8601 with offset, e.g. 2026-10-09T09:00:00+03:00'),
          notes: z.string().optional().describe('Optional notes'),
          priority: z
            .enum(['NONE', 'LOW', 'MEDIUM', 'HIGH'])
            .optional()
            .describe('Priority, defaults to NONE'),
          flag: z.boolean().optional().describe('Whether the reminder is flagged'),
          listId: z.string().optional().describe('Reminder list ID (see list_reminder_lists)'),
          notifyMinutesBefore: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Minutes before dueAt to notify. Defaults to 0 when dueAt is set'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
        const reminder = await this.reminderService.createReminder(ownerId, {
          title: params.title,
          dueAt: params.dueAt,
          notes: params.notes,
          priority: params.priority,
          flag: params.flag,
          listId: params.listId,
          notifyMinutesBefore: params.notifyMinutesBefore ?? (params.dueAt ? 0 : null),
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(reminder, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'list_reminder_lists',
      {
        description: 'List reminder lists so a listId can be passed to create_reminder',
      },
      async (extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
        const lists = await this.reminderService.listReminderLists(ownerId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(lists, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'search',
      {
        description: 'Search items (tasks/events/logs) and notes by title matching a search query',
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
      'create_task',
      {
        description:
          'Create a task inside a project (not a reminder). The project can be given by ID, code or name; use list_projects if unsure.',
        inputSchema: {
          project: z.string().min(1).describe('Project ID, code or name (case-insensitive)'),
          title: z.string().min(1).max(255).describe('Task title'),
          description: z.string().optional().describe('Optional task description'),
          priority: z
            .enum(['LOW', 'MEDIUM', 'HIGH'])
            .optional()
            .describe('Priority, defaults to MEDIUM'),
          dueAt: z
            .string()
            .optional()
            .describe('Due date-time in ISO 8601 with offset, e.g. 2026-10-09T09:00:00+03:00'),
        },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
        const projects = await this.projectService.list(ownerId, 'all');
        const needle = String(params.project).trim().toLowerCase();
        const byId = projects.filter((p) => String(p.id) === params.project.trim());
        const matches = byId.length
          ? byId
          : projects.filter(
              (p) => p.name.toLowerCase() === needle || p.code.toLowerCase() === needle,
            );
        if (matches.length === 0) {
          throw new Error(
            `Project not found: '${params.project}'. Available: ${projects.map((p) => p.name).join(', ')}`,
          );
        }
        if (matches.length > 1) {
          throw new Error(
            `Project '${params.project}' is ambiguous; pass the ID. Matches: ${matches
              .map((p) => `${p.name} (${p.id})`)
              .join(', ')}`,
          );
        }

        const task = await this.taskService.createForProject(ownerId, String(matches[0].id), {
          title: params.title,
          description: params.description,
          priority: params.priority,
          dueAt: params.dueAt,
          notifyMinutesBefore: params.dueAt ? 0 : null,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ project: matches[0].name, task }, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool<any, any>(
      'list_evkat',
      {
        description:
          'List the Evkat daily routine: time segments (e.g. morning, evening) with their items, so an item can be added with add_evkat_item',
      },
      async (extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
        const segments = await this.routineService.listSegments(ownerId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(segments, null, 2),
            },
          ],
        };
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
        const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
        const segments = await this.routineService.listSegments(ownerId);
        const needle = String(params.segment).trim().toLowerCase();
        const byId = segments.filter((s) => String(s.id) === params.segment.trim());
        const matches = byId.length
          ? byId
          : segments.filter((s) => s.name.toLowerCase() === needle);
        if (matches.length === 0) {
          throw new Error(
            `Evkat segment not found: '${params.segment}'. Available: ${segments.map((s) => s.name).join(', ')}`,
          );
        }
        if (matches.length > 1) {
          throw new Error(
            `Evkat segment '${params.segment}' is ambiguous; pass the ID. Matches: ${matches
              .map((s) => `${s.name} (${s.id})`)
              .join(', ')}`,
          );
        }

        const activity = await this.routineService.createActivity(ownerId, String(matches[0].id), {
          text: params.text,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ segment: matches[0].name, activity }, null, 2),
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
