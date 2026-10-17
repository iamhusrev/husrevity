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

  describe('project resolution (list_tasks / create_task)', () => {
    const auth = { authInfo: { scopes: ['projects:read', 'projects:write'], extra: { ownerId: 'u1' } } };
    const owned = { id: '7', name: 'Acme', code: 'ACME' };
    const shared = { id: '8', name: 'Shared', code: 'SHR' };

    beforeEach(() => {
      projectService.list.mockResolvedValue([owned, shared]);
    });

    it("list_tasks resolves an owned or shared project by name from list(..., 'all')", async () => {
      taskService.listForProject.mockResolvedValue([]);

      await getHandler('list_tasks')({ project: 'shared' }, auth);

      expect(projectService.list).toHaveBeenCalledWith('u1', 'all');
      expect(taskService.listForProject).toHaveBeenCalledWith('u1', '8');
    });

    it('create_task resolves the project by code and creates the task in it', async () => {
      taskService.createForProject.mockResolvedValue({ id: 't1' });

      await getHandler('create_task')({ project: 'ACME', title: 'Do it' }, auth);

      expect(projectService.list).toHaveBeenCalledWith('u1', 'all');
      expect(taskService.createForProject).toHaveBeenCalledWith('u1', '7', expect.objectContaining({ title: 'Do it' }));
    });

    it('create_task reports the available projects when none matches', async () => {
      await expect(
        getHandler('create_task')({ project: 'nope', title: 'x' }, auth),
      ).rejects.toThrow("Project not found: 'nope'. Available: Acme, Shared");
      expect(taskService.createForProject).not.toHaveBeenCalled();
    });
  });

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
