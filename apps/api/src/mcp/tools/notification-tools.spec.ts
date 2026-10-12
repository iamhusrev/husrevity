import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNotificationTools } from './notification-tools';

describe('notification-tools', () => {
  let server: McpServer;
  let notificationService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    notificationService = {
      listForOwner: jest.fn(),
      unreadCount: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    registerNotificationTools(server, { notificationService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  it('list_notifications throws without auth', async () => {
    await expect(getHandler('list_notifications')({}, {})).rejects.toThrow('Unauthorized');
  });

  it('list_notifications calls service when valid', async () => {
    notificationService.listForOwner.mockResolvedValueOnce([]);
    await getHandler('list_notifications')(
      { unread: true },
      { authInfo: { scopes: ['notifications:read'], extra: { ownerId: 'u1' } } }
    );
    expect(notificationService.listForOwner).toHaveBeenCalledWith('u1', { unread: true, limit: undefined });
  });

  it('mark_notification_read calls service', async () => {
    notificationService.markRead.mockResolvedValueOnce(undefined);
    await getHandler('mark_notification_read')(
      { id: 'n1' },
      { authInfo: { scopes: ['notifications:write'], extra: { ownerId: 'u1' } } }
    );
    expect(notificationService.markRead).toHaveBeenCalledWith('u1', 'n1');
  });
});
