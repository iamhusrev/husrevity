import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTimeBlockTools } from './time-block-tools';

describe('time-block-tools', () => {
  let server: McpServer;
  let timeBlockService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    timeBlockService = {
      listForDate: jest.fn(),
      listForRange: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      toggleComplete: jest.fn(),
    };
    registerTimeBlockTools(server, { timeBlockService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  describe('list_time_blocks', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('list_time_blocks')({}, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('list_time_blocks')({}, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should throw if neither date nor from+to are provided', async () => {
      await expect(
        getHandler('list_time_blocks')({}, { authInfo: { scopes: ['timeblocks:read'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Provide either date or both from and to');
    });

    it('should call listForDate if date is provided', async () => {
      timeBlockService.listForDate.mockResolvedValueOnce([]);
      await getHandler('list_time_blocks')(
        { date: '2026-10-09' },
        { authInfo: { scopes: ['timeblocks:read'], extra: { ownerId: 'u1' } } }
      );
      expect(timeBlockService.listForDate).toHaveBeenCalledWith('u1', '2026-10-09');
    });

    it('should call listForRange if from and to are provided', async () => {
      timeBlockService.listForRange.mockResolvedValueOnce([]);
      await getHandler('list_time_blocks')(
        { from: '2026-10-09T00:00:00Z', to: '2026-10-09T23:59:59Z' },
        { authInfo: { scopes: ['timeblocks:read'], extra: { ownerId: 'u1' } } }
      );
      expect(timeBlockService.listForRange).toHaveBeenCalledWith('u1', '2026-10-09T00:00:00Z', '2026-10-09T23:59:59Z');
    });
  });

  describe('create_time_block', () => {
    it('should call service with ownerId when valid', async () => {
      timeBlockService.create.mockResolvedValueOnce({ id: 'tb1' });
      await getHandler('create_time_block')(
        { title: 'T', startAt: '2026-10-09T10:00:00Z', endAt: '2026-10-09T11:00:00Z' },
        { authInfo: { scopes: ['timeblocks:write'], extra: { ownerId: 'u1' } } }
      );
      expect(timeBlockService.create).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'T' }));
    });
  });

  describe('update_time_block', () => {
    it('should perform a full replace', async () => {
      timeBlockService.update.mockResolvedValueOnce({ id: 'tb1' });
      await getHandler('update_time_block')(
        { id: 'tb1', title: 'T', startAt: '2026-10-09T10:00:00Z', endAt: '2026-10-09T11:00:00Z' },
        { authInfo: { scopes: ['timeblocks:write'], extra: { ownerId: 'u1' } } }
      );
      expect(timeBlockService.update).toHaveBeenCalledWith('u1', 'tb1', {
        title: 'T',
        startAt: '2026-10-09T10:00:00Z',
        endAt: '2026-10-09T11:00:00Z',
        notes: undefined,
        category: undefined,
        colorToken: undefined,
        notifyMinutesBefore: undefined,
      });
    });
  });

  describe('toggle_time_block_complete', () => {
    it('should call toggleComplete on service', async () => {
      timeBlockService.toggleComplete.mockResolvedValueOnce({ id: 'tb1', completedAt: '2026-10-09' });
      await getHandler('toggle_time_block_complete')(
        { id: 'tb1' },
        { authInfo: { scopes: ['timeblocks:write'], extra: { ownerId: 'u1' } } }
      );
      expect(timeBlockService.toggleComplete).toHaveBeenCalledWith('u1', 'tb1');
    });
  });
});
