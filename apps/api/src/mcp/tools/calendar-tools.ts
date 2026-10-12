import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { CalendarService } from '../../calendar/calendar.service';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';

export interface CalendarToolsDeps {
  calendarService: CalendarService;
}

export function registerCalendarTools(server: McpServer, deps: CalendarToolsDeps) {
  server.registerTool<any, any>(
    'list_calendar_events',
    {
      description: 'List calendar events. Times are ISO 8601 with offset (e.g., 2026-10-09T09:00:00+03:00). User is in Europe/Istanbul.',
      inputSchema: {
        from: z.string().optional().describe('From date-time in ISO 8601'),
        to: z.string().optional().describe('To date-time in ISO 8601'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'calendar:read');
      const events = await deps.calendarService.list(ownerId, params.from, params.to);
      return textResult(events);
    },
  );

  server.registerTool<any, any>(
    'get_calendar_event',
    {
      description: 'Get a calendar event by ID',
      inputSchema: {
        id: z.string().describe('Event ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'calendar:read');
      const event = await deps.calendarService.get(ownerId, params.id);
      return textResult(event);
    },
  );

  server.registerTool<any, any>(
    'create_calendar_event',
    {
      description: 'Create a calendar event. Times are ISO 8601 with offset. User is in Europe/Istanbul.',
      inputSchema: {
        title: z.string().describe('Title of the event'),
        startAt: z.string().describe('Start date-time in ISO 8601'),
        endAt: z.string().describe('End date-time in ISO 8601'),
        description: z.string().optional().describe('Description'),
        allDay: z.boolean().optional().describe('Whether the event is all day'),
        location: z.string().optional().describe('Location'),
        colorHex: z.string().optional().describe('Hex color code'),
        reminderMinutes: z.number().optional().describe('Minutes before startAt to notify'),
        recurrenceRule: z.string().optional().describe('RRULE string for recurrence'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'calendar:write');
      if (new Date(params.endAt).getTime() < new Date(params.startAt).getTime()) {
        throw new Error('endAt cannot be before startAt');
      }
      const event = await deps.calendarService.create(ownerId, {
        title: params.title,
        startAt: params.startAt,
        endAt: params.endAt,
        description: params.description,
        allDay: params.allDay,
        location: params.location,
        colorHex: params.colorHex,
        reminderMinutes: params.reminderMinutes,
        recurrenceRule: params.recurrenceRule,
      });
      return textResult(event);
    },
  );

  server.registerTool<any, any>(
    'update_calendar_event',
    {
      description: 'Update a calendar event. Omitted fields are not changed. Times are ISO 8601 with offset. User is in Europe/Istanbul.',
      inputSchema: {
        id: z.string().describe('Event ID'),
        title: z.string().optional().describe('Title of the event'),
        startAt: z.string().optional().describe('Start date-time in ISO 8601'),
        endAt: z.string().optional().describe('End date-time in ISO 8601'),
        description: z.string().optional().describe('Description'),
        allDay: z.boolean().optional().describe('Whether the event is all day'),
        location: z.string().optional().describe('Location'),
        colorHex: z.string().optional().describe('Hex color code'),
        reminderMinutes: z.number().optional().describe('Minutes before startAt to notify'),
        recurrenceRule: z.string().optional().describe('RRULE string for recurrence'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'calendar:write');
      const current = await deps.calendarService.get(ownerId, params.id);
      
      const nextStartAt = params.startAt ?? current.startAt;
      const nextEndAt = params.endAt ?? current.endAt;
      if (new Date(nextEndAt).getTime() < new Date(nextStartAt).getTime()) {
        throw new Error('endAt cannot be before startAt');
      }

      const event = await deps.calendarService.update(ownerId, params.id, {
        title: params.title ?? current.title,
        startAt: nextStartAt,
        endAt: nextEndAt,
        description: params.description !== undefined ? params.description : (current.description ?? undefined),
        allDay: params.allDay ?? current.allDay,
        location: params.location !== undefined ? params.location : (current.location ?? undefined),
        colorHex: params.colorHex !== undefined ? params.colorHex : (current.colorHex ?? undefined),
        reminderMinutes: params.reminderMinutes !== undefined ? params.reminderMinutes : (current.reminderMinutes ?? undefined),
        recurrenceRule: params.recurrenceRule !== undefined ? params.recurrenceRule : (current.recurrenceRule ?? undefined),
      });
      return textResult(event);
    },
  );

  server.registerTool<any, any>(
    'delete_calendar_event',
    {
      description: 'Delete a calendar event',
      inputSchema: {
        id: z.string().describe('Event ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'calendar:write');
      await deps.calendarService.delete(ownerId, params.id);
      return textResult({ success: true });
    },
  );

  server.registerTool<any, any>(
    'restore_calendar_event',
    {
      description: 'Restore a deleted calendar event',
      inputSchema: {
        id: z.string().describe('Event ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'calendar:write');
      const event = await deps.calendarService.restore(ownerId, params.id);
      return textResult(event);
    },
  );
}
