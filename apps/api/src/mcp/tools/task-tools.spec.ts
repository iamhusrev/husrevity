import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTaskTools } from './task-tools';

describe('task-tools', () => {
  let server: McpServer;
  let taskService: any;
  let projectService: any;
  let userService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    taskService = {
      createForProject: jest.fn(),
      listForProject: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      restore: jest.fn(),
    };
    projectService = {
      list: jest.fn(),
    };
    userService = {
      requireById: jest.fn(),
    };
    registerTaskTools(server, { taskService, projectService, userService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  describe('update_task', () => {
    it('should preserve omitted fields and assigneeId', async () => {
      taskService.get.mockResolvedValueOnce({
        id: 't1',
        title: 'Old',
        description: 'Desc',
        status: 'OPEN',
        priority: 'LOW',
        dueAt: new Date('2026-01-01T00:00:00Z'),
        notifyMinutesBefore: 10,
        assigneeId: 'a1',
      });
      userService.requireById.mockResolvedValueOnce({ email: 'user@ex.com' });
      taskService.update.mockResolvedValueOnce({ id: 't1' });

      await getHandler('update_task')(
        { id: 't1', title: 'New' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );

      expect(taskService.update).toHaveBeenCalledWith('u1', 'user@ex.com', 't1', {
        title: 'New',
        description: 'Desc',
        status: 'OPEN',
        priority: 'LOW',
        dueAt: '2026-01-01T00:00:00.000Z',
        notifyMinutesBefore: 10,
        assigneeId: 'a1',
      });
    });
  });

  describe('delete_task', () => {
    it('should call service delete', async () => {
      await getHandler('delete_task')(
        { id: 't1' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );
      expect(taskService.delete).toHaveBeenCalledWith('u1', 't1');
    });
  });

  describe('restore_task', () => {
    it('should call service restore', async () => {
      taskService.restore.mockResolvedValueOnce({ id: 't1' });
      await getHandler('restore_task')(
        { id: 't1' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );
      expect(taskService.restore).toHaveBeenCalledWith('u1', 't1');
    });
  });
});
