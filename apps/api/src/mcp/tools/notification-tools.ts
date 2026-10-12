import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NotificationService } from '../../notification/notification.service';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';

export interface NotificationToolDeps {
  notificationService: NotificationService;
}

export function registerNotificationTools(server: McpServer, deps: NotificationToolDeps) {
  server.registerTool<any, any>(
    'list_notifications',
    {
      description: 'List notifications for the user.',
      inputSchema: {
        unread: z.boolean().optional().describe('Filter by unread only'),
        limit: z.number().int().min(1).max(200).optional().describe('Max number of notifications to return'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notifications:read');
      const notifications = await deps.notificationService.listForOwner(ownerId, {
        unread: params.unread,
        limit: params.limit,
      });
      return textResult(notifications);
    },
  );

  server.registerTool<any, any>(
    'get_unread_notification_count',
    {
      description: 'Get the count of unread notifications.',
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notifications:read');
      const count = await deps.notificationService.unreadCount(ownerId);
      return textResult({ unreadCount: count });
    },
  );

  server.registerTool<any, any>(
    'mark_notification_read',
    {
      description: 'Mark a specific notification as read.',
      inputSchema: {
        id: z.string().describe('Notification ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notifications:write');
      await deps.notificationService.markRead(ownerId, params.id);
      return textResult({ success: true });
    },
  );

  server.registerTool<any, any>(
    'mark_all_notifications_read',
    {
      description: 'Mark all unread notifications as read.',
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notifications:write');
      const affected = await deps.notificationService.markAllRead(ownerId);
      return textResult({ success: true, affected });
    },
  );
}
