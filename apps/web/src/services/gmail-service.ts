import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  GmailAccountResponse,
  GmailAuthorizeUrlResponse,
  GmailMessageDetail,
  GmailMessagePage,
  GmailSendRequest,
  GmailSendResponse,
  GoogleCalendarEvent,
  GoogleContact,
  GoogleDriveFile,
} from "@/types/gmail/gmail";
import { GMAIL_ENDPOINTS } from "@/utils/api-endpoints";

export interface GmailMessageQuery {
  page?: number;
  size?: number;
}

export const gmailService = {
  async listAccounts(): Promise<ApiResponse<GmailAccountResponse[]>> {
    const res = await apiClient.get(GMAIL_ENDPOINTS.ACCOUNTS);
    return res.data;
  },

  async removeAccount(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(GMAIL_ENDPOINTS.ACCOUNT_BY_ID(id));
    return res.data;
  },

  async listMessages(
    accountId: number,
    query?: GmailMessageQuery,
  ): Promise<ApiResponse<GmailMessagePage>> {
    const res = await apiClient.get(GMAIL_ENDPOINTS.MESSAGES(accountId), {
      params: query,
    });
    return res.data;
  },

  async getMessage(accountId: number, mid: string): Promise<ApiResponse<GmailMessageDetail>> {
    const res = await apiClient.get(GMAIL_ENDPOINTS.MESSAGE_DETAIL(accountId, mid));
    return res.data;
  },

  async sendMessage(
    accountId: number,
    body: GmailSendRequest,
  ): Promise<ApiResponse<GmailSendResponse>> {
    const res = await apiClient.post(GMAIL_ENDPOINTS.SEND(accountId), body);
    return res.data;
  },

  async syncAccount(accountId: number): Promise<ApiResponse<{ synced: number }>> {
    const res = await apiClient.post(GMAIL_ENDPOINTS.SYNC(accountId));
    return res.data;
  },

  async markRead(accountId: number, mid: string): Promise<ApiResponse<void>> {
    const res = await apiClient.post(GMAIL_ENDPOINTS.MESSAGE_READ(accountId, mid));
    return res.data;
  },

  async markUnread(accountId: number, mid: string): Promise<ApiResponse<void>> {
    const res = await apiClient.post(GMAIL_ENDPOINTS.MESSAGE_UNREAD(accountId, mid));
    return res.data;
  },

  async star(accountId: number, mid: string): Promise<ApiResponse<void>> {
    const res = await apiClient.post(GMAIL_ENDPOINTS.MESSAGE_STAR(accountId, mid));
    return res.data;
  },

  async unstar(accountId: number, mid: string): Promise<ApiResponse<void>> {
    const res = await apiClient.post(GMAIL_ENDPOINTS.MESSAGE_UNSTAR(accountId, mid));
    return res.data;
  },

  async getAuthorizeUrl(
    provider: "google" | "microsoft" = "google",
  ): Promise<ApiResponse<GmailAuthorizeUrlResponse>> {
    const res = await apiClient.post(GMAIL_ENDPOINTS.AUTHORIZE_URL, null, {
      params: { provider },
    });
    return res.data;
  },

  async listCalendar(
    accountId: number,
    range: { from?: string; to?: string },
  ): Promise<ApiResponse<GoogleCalendarEvent[]>> {
    const res = await apiClient.get(GMAIL_ENDPOINTS.CALENDAR(accountId), { params: range });
    return res.data;
  },

  async listContacts(accountId: number): Promise<ApiResponse<GoogleContact[]>> {
    const res = await apiClient.get(GMAIL_ENDPOINTS.CONTACTS(accountId));
    return res.data;
  },

  async listDrive(accountId: number): Promise<ApiResponse<GoogleDriveFile[]>> {
    const res = await apiClient.get(GMAIL_ENDPOINTS.DRIVE(accountId));
    return res.data;
  },
};
