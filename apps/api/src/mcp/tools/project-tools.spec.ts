import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './project-tools';

describe('project-tools', () => {
  let server: McpServer;
  let projectService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    projectService = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      restore: jest.fn(),
    };
    registerProjectTools(server, { projectService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  describe('create_project', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('create_project')({}, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('create_project')({}, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should call service with ownerId when valid', async () => {
      projectService.create.mockResolvedValueOnce({ id: 'p1' });
      await getHandler('create_project')(
        { code: 'C', name: 'N' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );
      expect(projectService.create).toHaveBeenCalledWith('u1', { code: 'C', name: 'N' });
    });
  });

  describe('update_project', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('update_project')({ id: 'p1' }, {})).rejects.toThrow('Unauthorized');
    });

    it("resolves a project by name from list(..., 'all'), including shared ones", async () => {
      projectService.list.mockResolvedValueOnce([
        { id: 'p1', name: 'Mine' },
        { id: 'p2', name: 'Shared with me' },
      ]);
      projectService.update.mockResolvedValueOnce({ id: 'p2' });
      await getHandler('update_project')(
        { id: 'shared with me', name: 'Renamed' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );
      expect(projectService.list).toHaveBeenCalledWith('u1', 'all');
      expect(projectService.update).toHaveBeenCalledWith('u1', 'p2', { name: 'Renamed' });
    });

    it('should call service update and preserve omitted fields through Partial', async () => {
      projectService.list.mockResolvedValueOnce([{ id: 'p1', name: 'P' }]);
      projectService.update.mockResolvedValueOnce({ id: 'p1' });
      await getHandler('update_project')(
        { id: 'p1', name: 'NewName' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );
      expect(projectService.update).toHaveBeenCalledWith('u1', 'p1', {
        name: 'NewName',
      });
    });
  });

  describe('delete_project', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('delete_project')({ id: 'p1' }, {})).rejects.toThrow('Unauthorized');
    });

    it('should call service delete with ownerId when valid', async () => {
      projectService.delete.mockResolvedValueOnce(undefined);
      await getHandler('delete_project')(
        { id: 'p1' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );
      expect(projectService.delete).toHaveBeenCalledWith('u1', 'p1');
    });
  });

  describe('restore_project', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('restore_project')({ id: 'p1' }, {})).rejects.toThrow('Unauthorized');
    });

    it('should call service restore with ownerId when valid', async () => {
      projectService.restore.mockResolvedValueOnce({ id: 'p1' });
      await getHandler('restore_project')(
        { id: 'p1' },
        { authInfo: { scopes: ['projects:write'], extra: { ownerId: 'u1' } } }
      );
      expect(projectService.restore).toHaveBeenCalledWith('u1', 'p1');
    });
  });
});
