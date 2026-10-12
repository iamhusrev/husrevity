import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCalendarTools } from './calendar-tools';

describe('calendar-tools', () => {
  let server: McpServer;
  let calendarService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    calendarService = {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      restore: jest.fn(),
    };
    registerCalendarTools(server, { calendarService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  describe('create_calendar_event', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('create_calendar_event')({}, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('create_calendar_event')({}, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should throw if endAt is before startAt', async () => {
      await expect(
        getHandler('create_calendar_event')(
          { title: 'T', startAt: '2026-10-09T10:00:00Z', endAt: '2026-10-09T09:00:00Z' },
          { authInfo: { scopes: ['calendar:write'], extra: { ownerId: 'u1' } } }
        )
      ).rejects.toThrow('endAt cannot be before startAt');
    });

    it('should call service with ownerId when valid', async () => {
      calendarService.create.mockResolvedValueOnce({ id: 'e1' });
      await getHandler('create_calendar_event')(
        { title: 'T', startAt: '2026-10-09T09:00:00Z', endAt: '2026-10-09T10:00:00Z' },
        { authInfo: { scopes: ['calendar:write'], extra: { ownerId: 'u1' } } }
      );
      expect(calendarService.create).toHaveBeenCalledWith('u1', { 
        title: 'T', 
        startAt: '2026-10-09T09:00:00Z', 
        endAt: '2026-10-09T10:00:00Z',
        description: undefined,
        allDay: undefined,
        location: undefined,
        colorHex: undefined,
        reminderMinutes: undefined,
        recurrenceRule: undefined,
      });
    });
  });

  describe('update_calendar_event', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('update_calendar_event')({ id: 'e1' }, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('update_calendar_event')({ id: 'e1' }, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should throw if next endAt is before next startAt', async () => {
      calendarService.get.mockResolvedValueOnce({
        id: 'e1',
        startAt: '2026-10-09T09:00:00Z',
        endAt: '2026-10-09T10:00:00Z',
      });
      await expect(
        getHandler('update_calendar_event')(
          { id: 'e1', startAt: '2026-10-09T11:00:00Z' },
          { authInfo: { scopes: ['calendar:write'], extra: { ownerId: 'u1' } } }
        )
      ).rejects.toThrow('endAt cannot be before startAt');
    });

    it('should preserve omitted fields on update', async () => {
      calendarService.get.mockResolvedValueOnce({
        id: 'e1',
        title: 'Old',
        startAt: '2026-10-09T09:00:00Z',
        endAt: '2026-10-09T10:00:00Z',
        allDay: false,
      });
      calendarService.update.mockResolvedValueOnce({ id: 'e1' });
      await getHandler('update_calendar_event')(
        { id: 'e1', title: 'New' },
        { authInfo: { scopes: ['calendar:write'], extra: { ownerId: 'u1' } } }
      );
      expect(calendarService.update).toHaveBeenCalledWith('u1', 'e1', {
        title: 'New',
        startAt: '2026-10-09T09:00:00Z',
        endAt: '2026-10-09T10:00:00Z',
        description: undefined,
        allDay: false,
        location: undefined,
        colorHex: undefined,
        reminderMinutes: undefined,
        recurrenceRule: undefined,
      });
    });
  });

  describe('restore_calendar_event', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('restore_calendar_event')({ id: 'e1' }, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('restore_calendar_event')({ id: 'e1' }, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should call service with ownerId when valid', async () => {
      calendarService.restore.mockResolvedValueOnce({ id: 'e1' });
      await getHandler('restore_calendar_event')(
        { id: 'e1' },
        { authInfo: { scopes: ['calendar:write'], extra: { ownerId: 'u1' } } }
      );
      expect(calendarService.restore).toHaveBeenCalledWith('u1', 'e1');
    });
  });

  describe('delete_calendar_event', () => {
    it('should call service delete', async () => {
      calendarService.delete.mockResolvedValueOnce(undefined);
      await getHandler('delete_calendar_event')(
        { id: 'e1' },
        { authInfo: { scopes: ['calendar:write'], extra: { ownerId: 'u1' } } }
      );
      expect(calendarService.delete).toHaveBeenCalledWith('u1', 'e1');
    });
  });
});
