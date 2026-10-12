import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { ItemService } from '../../item/item.service';
import { TodayService } from '../../today/today.service';
import { McpSearchService } from '../mcp-search.service';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';
import { DateTime } from 'luxon';
import { ItemKind, ItemStatus } from '../../item/item.entity';
import { ReminderService } from '../../reminder/reminder.service';
import { parseQuickAdd } from '@husrevity/parser';
import {
  ChangeSetService,
  extractItemSnapshot,
  isValidNumericId,
} from '../../change-set/change-set.service';
import { ApiException } from '../../common/api.exception';

export interface ItemToolsDeps {
  itemService: ItemService;
  todayService: TodayService;
  mcpSearchService: McpSearchService;
  reminderService: ReminderService;
  changeSetService: ChangeSetService;
}

export function registerItemTools(server: McpServer, deps: ItemToolsDeps) {
  server.registerTool<any, any>(
    'list_items',
    {
      description: 'List items (tasks, events, logs). Note: recurring items are only expanded into occurrences when BOTH from and to are given.',
      inputSchema: {
        from: z.string().optional().describe('Start date (ISO)'),
        to: z.string().optional().describe('End date (ISO)'),
        kind: z.enum(['task', 'event', 'log']).optional().describe('Filter by item kind'),
        context: z.string().optional().describe('Filter by context'),
        status: z.enum(['open', 'done', 'cancelled']).optional().describe('Filter by status'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
      const items = await deps.itemService.list(ownerId, {
        from: params.from,
        to: params.to,
        kind: params.kind as ItemKind,
        context: params.context,
        status: params.status as ItemStatus,
      });
      return textResult(items);
    },
  );

  server.registerTool<any, any>(
    'get_item',
    {
      description: 'Get an item by ID',
      inputSchema: {
        id: z.string().describe('Item ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
      const item = await deps.itemService.get(ownerId, params.id);
      return textResult(item);
    },
  );

  server.registerTool<any, any>(
    'create_item',
    {
      description: 'Create a new item (task, event, log)',
      inputSchema: {
        kind: z.enum(['task', 'event', 'log']).describe('Item kind'),
        title: z.string().describe('Title'),
        notes: z.string().optional().describe('Notes'),
        context: z.string().optional().describe('Context'),
        projectId: z.string().optional().describe('Project ID'),
        scheduledAt: z.string().optional().describe('Scheduled date-time in ISO 8601'),
        dueAt: z.string().optional().describe('Due date-time in ISO 8601'),
        durationMin: z.number().int().min(0).optional().describe('Duration in minutes'),
        notifyMinutesBefore: z.number().int().optional().describe('Notification lead time'),
        rrule: z.string().optional().describe('Recurrence rule (RFC5545)'),
        status: z.enum(['open', 'done', 'cancelled']).optional().describe('Status'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
      const { result, changeSetId } = await deps.changeSetService.runWithChangeSet(
        ownerId,
        { source: 'mcp', label: `create_item: ${params.title}` },
        async (csId, manager) => {
          const item = await deps.itemService.create(
            ownerId,
            {
              kind: params.kind as ItemKind,
              title: params.title,
              notes: params.notes,
              context: params.context,
              projectId: params.projectId,
              scheduledAt: params.scheduledAt,
              dueAt: params.dueAt,
              durationMin: params.durationMin,
              notifyMinutesBefore: params.notifyMinutesBefore,
              rrule: params.rrule,
              status: params.status as ItemStatus,
              source: 'mcp',
            },
            manager,
          );
          await deps.changeSetService.recordEntry(
            csId,
            ownerId,
            {
              targetType: 'item',
              targetId: item.id,
              op: 'create',
              before: null,
              after: extractItemSnapshot(item),
            },
            manager,
          );
          return item;
        },
      );
      return textResult({ ...result, changeSetId });
    },
  );

  server.registerTool<any, any>(
    'update_item',
    {
      description: 'Update an existing item. Omitted optional fields are ignored (partial update).',
      inputSchema: {
        id: z.string().describe('Item ID'),
        kind: z.enum(['task', 'event', 'log']).optional().describe('Item kind'),
        title: z.string().optional().describe('Title'),
        notes: z.string().optional().describe('Notes'),
        context: z.string().optional().describe('Context'),
        projectId: z.string().optional().describe('Project ID'),
        scheduledAt: z.string().optional().describe('Scheduled date-time in ISO 8601'),
        dueAt: z.string().optional().describe('Due date-time in ISO 8601'),
        durationMin: z.number().int().min(0).optional().describe('Duration in minutes'),
        notifyMinutesBefore: z.number().int().optional().describe('Notification lead time'),
        rrule: z.string().optional().describe('Recurrence rule (RFC5545)'),
        status: z.enum(['open', 'done', 'cancelled']).optional().describe('Status'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
      const req: any = {};
      if (params.kind !== undefined) req.kind = params.kind;
      if (params.title !== undefined) req.title = params.title;
      if (params.notes !== undefined) req.notes = params.notes;
      if (params.context !== undefined) req.context = params.context;
      if (params.projectId !== undefined) req.projectId = params.projectId;
      if (params.scheduledAt !== undefined) req.scheduledAt = params.scheduledAt;
      if (params.dueAt !== undefined) req.dueAt = params.dueAt;
      if (params.durationMin !== undefined) req.durationMin = params.durationMin;
      if (params.notifyMinutesBefore !== undefined) req.notifyMinutesBefore = params.notifyMinutesBefore;
      if (params.rrule !== undefined) req.rrule = params.rrule;
      if (params.status !== undefined) req.status = params.status;

      const initial = await deps.itemService.get(ownerId, params.id);
      const label = `update_item: ${initial.title ?? params.title ?? params.id}`;

      const { result, changeSetId } = await deps.changeSetService.runWithChangeSet(
        ownerId,
        { source: 'mcp', label },
        async (csId, manager) => {
          const before = await deps.itemService.get(ownerId, params.id, manager);
          const item = await deps.itemService.update(ownerId, params.id, req, undefined, manager);
          await deps.changeSetService.recordEntry(
            csId,
            ownerId,
            {
              targetType: 'item',
              targetId: item.id,
              op: 'update',
              before: extractItemSnapshot(before),
              after: extractItemSnapshot(item),
            },
            manager,
          );
          return item;
        },
      );
      return textResult({ ...result, changeSetId });
    },
  );

  server.registerTool<any, any>(
    'get_today',
    {
      description:
        "Fetch today's due items, event timeline, and active timeblock for the authenticated user",
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
      const dueToday = await deps.todayService.dueToday(ownerId);
      const timeline = await deps.todayService.timeline(ownerId);
      const currentBlock = deps.todayService.currentBlock(timeline);

      return textResult({ dueToday, timeline, currentBlock });
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
      const initial = await deps.itemService.get(ownerId, params.id);
      const label = `complete_item: ${initial.title ?? params.id}`;

      const { result, changeSetId } = await deps.changeSetService.runWithChangeSet(
        ownerId,
        { source: 'mcp', label },
        async (csId, manager) => {
          const before = await deps.itemService.get(ownerId, params.id, manager);
          const isRecurring = Boolean(before.rrule && before.rrule.trim());

          if (isRecurring && params.occursOn) {
            const existingOcc = await deps.itemService.findOccurrence(
              ownerId,
              params.id,
              params.occursOn,
              manager,
            );
            const { item, occurrenceId } = await deps.itemService.completeWithDetails(
              ownerId,
              params.id,
              { occursOn: params.occursOn },
              manager,
            );

            if (existingOcc) {
              await deps.changeSetService.recordEntry(
                csId,
                ownerId,
                {
                  targetType: 'item_occurrence',
                  targetId: existingOcc.id,
                  op: 'update',
                  before: {
                    status: existingOcc.status,
                    completedAt: existingOcc.completedAt
                      ? existingOcc.completedAt.toISOString()
                      : null,
                  },
                  after: {
                    status: 'done',
                    completedAt: new Date().toISOString(),
                  },
                },
                manager,
              );
            } else if (occurrenceId) {
              await deps.changeSetService.recordEntry(
                csId,
                ownerId,
                {
                  targetType: 'item_occurrence',
                  targetId: occurrenceId,
                  op: 'create',
                  before: null,
                  after: {
                    status: 'done',
                    occursOn: params.occursOn,
                    itemId: params.id,
                    occurrenceId,
                  },
                },
                manager,
              );
            }
            return item;
          } else {
            const { item } = await deps.itemService.completeWithDetails(
              ownerId,
              params.id,
              params.occursOn ? { occursOn: params.occursOn } : {},
              manager,
            );
            await deps.changeSetService.recordEntry(
              csId,
              ownerId,
              {
                targetType: 'item',
                targetId: params.id,
                op: 'complete',
                before: extractItemSnapshot(before),
                after: extractItemSnapshot(item),
              },
              manager,
            );
            return item;
          }
        },
      );

      return textResult({ ...result, changeSetId });
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
      const results = await deps.mcpSearchService.search(ownerId, params.query, {
        kinds: params.kinds,
      });

      return textResult(results);
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

      const items = await deps.itemService.list(ownerId, {
        from: startDate.toUTC().toISO()!,
        to: endDate.toUTC().toISO()!,
      });

      return textResult(items);
    },
  );

  server.registerTool<any, any>(
    'log_workout',
    {
      description: 'Log a workout activity into the sport context. Note: writes an Item log, real sport log is log_sport_session.',
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
      const { result, changeSetId } = await deps.changeSetService.runWithChangeSet(
        ownerId,
        { source: 'mcp', label: `log_workout: ${params.activity}` },
        async (csId, manager) => {
          const item = await deps.itemService.create(
            ownerId,
            {
              kind: 'log',
              title: params.activity,
              context: 'spor',
              scheduledAt: new Date().toISOString(),
              durationMin: params.duration_min,
              notes: params.details ?? null,
              source: 'mcp',
              payload: {
                activity: params.activity,
                duration_min: params.duration_min,
                ...(params.details ? { details: params.details } : {}),
              },
            },
            manager,
          );
          await deps.changeSetService.recordEntry(
            csId,
            ownerId,
            {
              targetType: 'item',
              targetId: item.id,
              op: 'create',
              before: null,
              after: extractItemSnapshot(item),
            },
            manager,
          );
          return item;
        },
      );

      return textResult({ ...result, changeSetId });
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
      const reminder = await deps.reminderService.createReminder(ownerId, {
        title: parsed.title,
        dueAt,
        notifyMinutesBefore: dueAt ? 0 : null,
      });
      const result = parsed.rrule
        ? {
            ...reminder,
            undoable: false,
            warning:
              'Recurrence is not supported for reminders; created a one-off reminder for the first occurrence.',
          }
        : {
            ...reminder,
            undoable: false,
          };

      return textResult(result);
    },
  );

  server.registerTool<any, any>(
    'list_change_sets',
    {
      description: 'List recent mutation change sets for undo inspection',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum records to return (1-100, default 20)'),
        before: z
          .string()
          .max(19)
          .regex(/^\d{1,19}$/, 'Must be a numeric ID (1-19 digits)')
          .refine((v) => isValidNumericId(v), 'Must be a valid bigint ID')
          .optional()
          .describe('Pagination cursor: change set ID to fetch records before'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'items:read');
      if (params?.before !== undefined && !isValidNumericId(params.before)) {
        return textResult({
          error: 'Invalid before ID: must be a numeric ID (1-19 digits)',
        });
      }
      try {
        const list = await deps.changeSetService.list(ownerId, {
          limit: params?.limit,
          before: params?.before,
        });
        return textResult(list.items);
      } catch (err: any) {
        if (err instanceof ApiException) {
          return textResult({ error: err.message });
        }
        throw err;
      }
    },
  );

  server.registerTool<any, any>(
    'undo_change_set',
    {
      description: 'Undo all mutations in a change set in reverse order',
      inputSchema: {
        id: z
          .string()
          .max(19)
          .regex(/^\d{1,19}$/, 'Must be a numeric ID (1-19 digits)')
          .refine((v) => isValidNumericId(v), 'Must be a valid bigint ID')
          .describe('Change set ID to undo'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'items:write');
      if (!isValidNumericId(params?.id)) {
        return textResult({
          error: 'Invalid change set ID: must be a numeric ID (1-19 digits)',
        });
      }
      try {
        const result = await deps.changeSetService.undo(ownerId, params.id);
        return textResult(result);
      } catch (err: any) {
        if (err instanceof ApiException) {
          return textResult({ error: err.message });
        }
        throw err;
      }
    },
  );
}
