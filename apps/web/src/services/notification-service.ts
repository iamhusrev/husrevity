import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  NotificationDiagnostics,
  NotificationResponse,
  PushSubscriptionPayload,
  ResyncResult,
  TestNotificationResult,
  UnreadCountResponse,
  VapidKeyResponse,
} from "@/types/notification/notification";
import { NOTIFICATION_ENDPOINTS } from "@/utils/api-endpoints";

export const notificationService = {
  async list(
    params: { unread?: boolean; limit?: number } = {},
  ): Promise<ApiResponse<NotificationResponse[]>> {
    const res = await apiClient.get(NOTIFICATION_ENDPOINTS.LIST, { params });
    return res.data;
  },

  async unreadCount(): Promise<ApiResponse<UnreadCountResponse>> {
    const res = await apiClient.get(NOTIFICATION_ENDPOINTS.UNREAD_COUNT);
    return res.data;
  },

  async markRead(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(NOTIFICATION_ENDPOINTS.MARK_READ(id));
    return res.data;
  },

  async markAllRead(): Promise<ApiResponse<{ updated: number }>> {
    const res = await apiClient.patch(NOTIFICATION_ENDPOINTS.MARK_ALL_READ);
    return res.data;
  },

  async getVapidPublicKey(): Promise<ApiResponse<VapidKeyResponse>> {
    const res = await apiClient.get(NOTIFICATION_ENDPOINTS.VAPID_PUBLIC_KEY);
    return res.data;
  },

  async subscribe(body: PushSubscriptionPayload): Promise<ApiResponse<void>> {
    const res = await apiClient.post(
      NOTIFICATION_ENDPOINTS.PUSH_SUBSCRIPTIONS,
      body,
    );
    return res.data;
  },

  async unsubscribe(endpoint: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(
      NOTIFICATION_ENDPOINTS.PUSH_SUBSCRIPTIONS,
      { data: { endpoint } },
    );
    return res.data;
  },

  async getDiagnostics(): Promise<ApiResponse<NotificationDiagnostics>> {
    const res = await apiClient.get(NOTIFICATION_ENDPOINTS.DIAGNOSTICS);
    return res.data;
  },

  async sendTest(): Promise<ApiResponse<TestNotificationResult>> {
    const res = await apiClient.post(NOTIFICATION_ENDPOINTS.TEST);
    return res.data;
  },

  async resync(): Promise<ApiResponse<ResyncResult>> {
    const res = await apiClient.post(NOTIFICATION_ENDPOINTS.RESYNC);
    return res.data;
  },
};
