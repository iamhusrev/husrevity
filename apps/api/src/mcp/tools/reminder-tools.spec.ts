import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReminderTools } from './reminder-tools';

describe('reminder-tools', () => {
  let server: McpServer;
  let reminderService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    reminderService = {
      listReminderLists: jest.fn(),
      createList: jest.fn(),
      updateList: jest.fn(),
      deleteList: jest.fn(),
      restoreList: jest.fn(),
      listReminders: jest.fn(),
      createReminder: jest.fn(),
      updateReminder: jest.fn(),
      toggleReminder: jest.fn(),
      deleteReminder: jest.fn(),
      restoreReminder: jest.fn(),
    };
    registerReminderTools(server, { reminderService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  describe('create_reminder', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('create_reminder')({}, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('create_reminder')({}, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow(/Forbidden: missing required scope 'reminders:write'/);
    });

    it('should call service with ownerId when valid (using legacy items:write)', async () => {
      reminderService.createReminder.mockResolvedValueOnce({ id: 'r1' });
      await getHandler('create_reminder')(
        { title: 'T' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.createReminder).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'T' }));
    });
  });

  describe('update_reminder', () => {
    it('should preserve omitted fields on update', async () => {
      reminderService.listReminders.mockResolvedValueOnce([
        { id: 'r1', title: 'Old', priority: 'NONE' },
      ]);
      reminderService.updateReminder.mockResolvedValueOnce({ id: 'r1' });
      await getHandler('update_reminder')(
        { id: 'r1', title: 'New' },
        { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.updateReminder).toHaveBeenCalledWith('u1', 'r1', {
        title: 'New',
        notes: undefined,
        dueAt: undefined,
        priority: 'NONE',
        flag: undefined,
        listId: undefined,
        notifyMinutesBefore: undefined,
      });
    });
  });

  describe('complete_reminder', () => {
    it('should not toggle if already completed', async () => {
      reminderService.listReminders.mockResolvedValueOnce([
        { id: 'r1', completedAt: '2026-10-09' },
      ]);
      await getHandler('complete_reminder')(
        { id: 'r1' },
        { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.toggleReminder).not.toHaveBeenCalled();
    });

    it('should toggle if not completed', async () => {
      reminderService.listReminders.mockResolvedValueOnce([
        { id: 'r1', completedAt: null },
      ]);
      reminderService.toggleReminder.mockResolvedValueOnce({ id: 'r1', completedAt: '2026-10-09' });
      await getHandler('complete_reminder')(
        { id: 'r1' },
        { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.toggleReminder).toHaveBeenCalledWith('u1', 'r1');
    });
  });

  describe('reopen_reminder', () => {
    it('should not toggle if not completed', async () => {
      reminderService.listReminders.mockResolvedValueOnce([
        { id: 'r1', completedAt: null },
      ]);
      await getHandler('reopen_reminder')(
        { id: 'r1' },
        { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.toggleReminder).not.toHaveBeenCalled();
    });

    it('should toggle if completed', async () => {
      reminderService.listReminders.mockResolvedValueOnce([
        { id: 'r1', completedAt: '2026-10-09' },
      ]);
      reminderService.toggleReminder.mockResolvedValueOnce({ id: 'r1', completedAt: null });
      await getHandler('reopen_reminder')(
        { id: 'r1' },
        { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.toggleReminder).toHaveBeenCalledWith('u1', 'r1');
    });
  });

  describe('restore_reminder', () => {
    it('should call service restore', async () => {
      reminderService.restoreReminder.mockResolvedValueOnce({ id: 'r1' });
      await getHandler('restore_reminder')(
        { id: 'r1' },
        { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.restoreReminder).toHaveBeenCalledWith('u1', 'r1');
    });
  });

  describe('update_reminder_list', () => {
    it('should preserve omitted fields', async () => {
      reminderService.listReminderLists.mockResolvedValueOnce([
        { id: 'l1', name: 'Old', color: '#fff' },
      ]);
      reminderService.updateList.mockResolvedValueOnce({ id: 'l1' });
      await getHandler('update_reminder_list')(
        { id: 'l1', name: 'New' },
        { authInfo: { scopes: ['reminders:write'], extra: { ownerId: 'u1' } } }
      );
      expect(reminderService.updateList).toHaveBeenCalledWith('u1', 'l1', {
        name: 'New',
        color: '#fff',
        icon: undefined,
      });
    });
  });
});
