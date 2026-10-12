import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRoutineTools } from './routine-tools';

describe('routine-tools', () => {
  let server: McpServer;
  let routineService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    routineService = {
      listSegments: jest.fn(),
      createSegment: jest.fn(),
      updateSegment: jest.fn(),
      createActivity: jest.fn(),
      updateActivity: jest.fn(),
    };
    registerRoutineTools(server, { routineService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  describe('create_evkat_segment', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('create_evkat_segment')({}, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('create_evkat_segment')({}, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow(/Forbidden: missing required scope 'routine:write'/);
    });

    it('should call service with ownerId when valid (using legacy items:write)', async () => {
      routineService.createSegment.mockResolvedValueOnce({ id: 's1' });
      await getHandler('create_evkat_segment')(
        { name: 'S' },
        { authInfo: { scopes: ['items:write'], extra: { ownerId: 'u1' } } }
      );
      expect(routineService.createSegment).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'S' }));
    });
  });

  describe('add_evkat_item', () => {
    it('should resolve segment by name and call service', async () => {
      routineService.listSegments.mockResolvedValueOnce([
        { id: '1', name: 'Morning' },
        { id: '2', name: 'Evening' },
      ]);
      routineService.createActivity.mockResolvedValueOnce({ id: 'a1' });
      
      await getHandler('add_evkat_item')(
        { segment: 'morning', text: 'T' },
        { authInfo: { scopes: ['routine:write'], extra: { ownerId: 'u1' } } }
      );
      
      expect(routineService.createActivity).toHaveBeenCalledWith('u1', '1', { text: 'T' });
    });

    it('should resolve segment by id and call service', async () => {
      routineService.listSegments.mockResolvedValueOnce([
        { id: '1', name: 'Morning' },
        { id: '2', name: 'Evening' },
      ]);
      routineService.createActivity.mockResolvedValueOnce({ id: 'a1' });
      
      await getHandler('add_evkat_item')(
        { segment: '2', text: 'T' },
        { authInfo: { scopes: ['routine:write'], extra: { ownerId: 'u1' } } }
      );
      
      expect(routineService.createActivity).toHaveBeenCalledWith('u1', '2', { text: 'T' });
    });

    it('should throw when segment not found', async () => {
      routineService.listSegments.mockResolvedValueOnce([
        { id: '1', name: 'Morning' },
      ]);
      await expect(
        getHandler('add_evkat_item')(
          { segment: 'noon', text: 'T' },
          { authInfo: { scopes: ['routine:write'], extra: { ownerId: 'u1' } } }
        )
      ).rejects.toThrow(/not found: 'noon'/);
    });

    it('should throw when segment is ambiguous', async () => {
      routineService.listSegments.mockResolvedValueOnce([
        { id: '1', name: 'Test' },
        { id: '2', name: 'test' },
      ]);
      await expect(
        getHandler('add_evkat_item')(
          { segment: 'test', text: 'T' },
          { authInfo: { scopes: ['routine:write'], extra: { ownerId: 'u1' } } }
        )
      ).rejects.toThrow(/is ambiguous/);
    });
  });

  describe('update_evkat_segment', () => {
    it('should preserve omitted fields on update', async () => {
      routineService.listSegments.mockResolvedValueOnce([
        { id: '1', name: 'Old', startMinute: 60, daysOfWeek: 127 },
      ]);
      routineService.updateSegment.mockResolvedValueOnce({ id: '1' });
      
      await getHandler('update_evkat_segment')(
        { segment: 'Old', name: 'New' },
        { authInfo: { scopes: ['routine:write'], extra: { ownerId: 'u1' } } }
      );
      
      expect(routineService.updateSegment).toHaveBeenCalledWith('u1', '1', {
        name: 'New',
        startMinute: 60,
        endMinute: undefined,
        theme: undefined,
        colorToken: undefined,
        daysOfWeek: 127,
        notes: undefined,
      });
    });
  });
});
