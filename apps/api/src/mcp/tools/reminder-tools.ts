import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { ReminderService } from '../../reminder/reminder.service';
import { getOwnerAndCheckAnyScope, textResult } from './mcp-tool-helpers';

export interface ReminderToolsDeps {
  reminderService: ReminderService;
}

export function registerReminderTools(server: McpServer, deps: ReminderToolsDeps) {
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
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const reminder = await deps.reminderService.createReminder(ownerId, {
        title: params.title,
        dueAt: params.dueAt,
        notes: params.notes,
        priority: params.priority,
        flag: params.flag,
        listId: params.listId,
        notifyMinutesBefore: params.notifyMinutesBefore ?? (params.dueAt ? 0 : null),
      });

      return textResult(reminder);
    },
  );

  server.registerTool<any, any>(
    'list_reminder_lists',
    {
      description: 'List reminder lists so a listId can be passed to create_reminder',
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:read', 'items:read']);
      const lists = await deps.reminderService.listReminderLists(ownerId);

      return textResult(lists);
    },
  );

  server.registerTool<any, any>(
    'list_reminders',
    {
      description: 'List reminders',
      inputSchema: {
        listId: z.string().optional().describe('Filter by list ID'),
        completed: z.boolean().optional().describe('Filter by completed status'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:read', 'items:read']);
      const reminders = await deps.reminderService.listReminders(ownerId, params.listId, params.completed);
      return textResult(reminders);
    },
  );

  server.registerTool<any, any>(
    'get_reminder_list',
    {
      description: 'Get a reminder list by ID, including its open reminder count',
      inputSchema: { id: z.string().describe('Reminder list ID') },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:read', 'items:read']);
      return textResult(await deps.reminderService.getList(ownerId, params.id));
    },
  );

  server.registerTool<any, any>(
    'get_reminder',
    {
      description: 'Get a reminder by ID',
      inputSchema: { id: z.string().describe('Reminder ID') },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:read', 'items:read']);
      return textResult(await deps.reminderService.getReminder(ownerId, params.id));
    },
  );

  server.registerTool<any, any>(
    'update_reminder',
    {
      description: 'Update a reminder. Omitted fields are not changed.',
      inputSchema: {
        id: z.string().describe('Reminder ID'),
        title: z.string().optional().describe('Title'),
        notes: z.string().optional().describe('Notes'),
        dueAt: z.string().optional().describe('Due date-time in ISO 8601 with offset'),
        priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional().describe('Priority'),
        flag: z.boolean().optional().describe('Flagged status'),
        listId: z.string().optional().describe('List ID'),
        notifyMinutesBefore: z.number().int().min(0).optional().describe('Minutes before dueAt to notify'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const allReminders = await deps.reminderService.listReminders(ownerId, undefined, undefined);
      const current = allReminders.find(r => r.id === params.id);
      if (!current) {
        throw new Error('Reminder not found');
      }

      const reminder = await deps.reminderService.updateReminder(ownerId, params.id, {
        title: params.title ?? current.title,
        notes: params.notes !== undefined ? params.notes : (current.notes ?? undefined),
        dueAt: params.dueAt !== undefined ? params.dueAt : (current.dueAt ?? undefined),
        priority: params.priority ?? current.priority,
        flag: params.flag ?? current.flag,
        listId: params.listId !== undefined ? params.listId : (current.listId ?? undefined),
        notifyMinutesBefore: params.notifyMinutesBefore !== undefined ? params.notifyMinutesBefore : (current.notifyMinutesBefore ?? undefined),
      });
      return textResult(reminder);
    },
  );

  server.registerTool<any, any>(
    'complete_reminder',
    {
      description: 'Mark a reminder as completed',
      inputSchema: {
        id: z.string().describe('Reminder ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const allReminders = await deps.reminderService.listReminders(ownerId, undefined, undefined);
      const current = allReminders.find(r => r.id === params.id);
      if (!current) {
        throw new Error('Reminder not found');
      }
      if (current.completedAt) {
        return textResult(current);
      }
      const reminder = await deps.reminderService.toggleReminder(ownerId, params.id);
      return textResult(reminder);
    },
  );

  server.registerTool<any, any>(
    'reopen_reminder',
    {
      description: 'Reopen a completed reminder',
      inputSchema: {
        id: z.string().describe('Reminder ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const allReminders = await deps.reminderService.listReminders(ownerId, undefined, undefined);
      const current = allReminders.find(r => r.id === params.id);
      if (!current) {
        throw new Error('Reminder not found');
      }
      if (!current.completedAt) {
        return textResult(current);
      }
      const reminder = await deps.reminderService.toggleReminder(ownerId, params.id);
      return textResult(reminder);
    },
  );

  server.registerTool<any, any>(
    'delete_reminder',
    {
      description: 'Delete a reminder',
      inputSchema: {
        id: z.string().describe('Reminder ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      await deps.reminderService.deleteReminder(ownerId, params.id);
      return textResult({ success: true });
    },
  );

  server.registerTool<any, any>(
    'restore_reminder',
    {
      description: 'Restore a deleted reminder',
      inputSchema: {
        id: z.string().describe('Reminder ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const reminder = await deps.reminderService.restoreReminder(ownerId, params.id);
      return textResult(reminder);
    },
  );

  server.registerTool<any, any>(
    'create_reminder_list',
    {
      description: 'Create a reminder list',
      inputSchema: {
        name: z.string().describe('Name of the list'),
        color: z.string().optional().describe('Color code'),
        icon: z.string().optional().describe('Icon name'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const list = await deps.reminderService.createList(ownerId, {
        name: params.name,
        color: params.color,
        icon: params.icon,
      });
      return textResult(list);
    },
  );

  server.registerTool<any, any>(
    'update_reminder_list',
    {
      description: 'Update a reminder list. Omitted fields are not changed.',
      inputSchema: {
        id: z.string().describe('List ID'),
        name: z.string().optional().describe('Name of the list'),
        color: z.string().optional().describe('Color code'),
        icon: z.string().optional().describe('Icon name'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const allLists = await deps.reminderService.listReminderLists(ownerId);
      const current = allLists.find(l => l.id === params.id);
      if (!current) {
        throw new Error('Reminder list not found');
      }
      const list = await deps.reminderService.updateList(ownerId, params.id, {
        name: params.name ?? current.name,
        color: params.color !== undefined ? params.color : (current.color ?? undefined),
        icon: params.icon !== undefined ? params.icon : (current.icon ?? undefined),
      });
      return textResult(list);
    },
  );

  server.registerTool<any, any>(
    'delete_reminder_list',
    {
      description: 'Delete a reminder list',
      inputSchema: {
        id: z.string().describe('List ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      await deps.reminderService.deleteList(ownerId, params.id);
      return textResult({ success: true });
    },
  );

  server.registerTool<any, any>(
    'restore_reminder_list',
    {
      description: 'Restore a deleted reminder list',
      inputSchema: {
        id: z.string().describe('List ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckAnyScope(extra, ['reminders:write', 'items:write']);
      const list = await deps.reminderService.restoreList(ownerId, params.id);
      return textResult(list);
    },
  );
}
