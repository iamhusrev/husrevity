import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  ReminderListRequest,
  ReminderListResponse,
  ReminderRequest,
  ReminderResponse,
  ReorderItem,
} from "@/types/reminder/reminder";
import { REMINDER_ENDPOINTS } from "@/utils/api-endpoints";

export const reminderService = {
  async listLists(): Promise<ApiResponse<ReminderListResponse[]>> {
    const res = await apiClient.get(REMINDER_ENDPOINTS.LISTS);
    return res.data;
  },

  async createList(body: ReminderListRequest): Promise<ApiResponse<ReminderListResponse>> {
    const res = await apiClient.post(REMINDER_ENDPOINTS.LISTS, body);
    return res.data;
  },

  async updateList(
    id: number,
    body: ReminderListRequest,
  ): Promise<ApiResponse<ReminderListResponse>> {
    const res = await apiClient.put(REMINDER_ENDPOINTS.LIST_BY_ID(id), body);
    return res.data;
  },

  async deleteList(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(REMINDER_ENDPOINTS.LIST_BY_ID(id));
    return res.data;
  },

  async restoreList(id: number): Promise<ApiResponse<ReminderListResponse>> {
    const res = await apiClient.patch(REMINDER_ENDPOINTS.LIST_RESTORE(id));
    return res.data;
  },

  async reorderLists(items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(REMINDER_ENDPOINTS.REORDER_LISTS, { items });
    return res.data;
  },

  async listReminders(listId: number): Promise<ApiResponse<ReminderResponse[]>> {
    const res = await apiClient.get(REMINDER_ENDPOINTS.LIST_REMINDERS(listId));
    return res.data;
  },

  async create(body: ReminderRequest): Promise<ApiResponse<ReminderResponse>> {
    const res = await apiClient.post(REMINDER_ENDPOINTS.REMINDERS, body);
    return res.data;
  },

  async update(id: number, body: ReminderRequest): Promise<ApiResponse<ReminderResponse>> {
    const res = await apiClient.put(REMINDER_ENDPOINTS.BY_ID(id), body);
    return res.data;
  },

  async remove(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(REMINDER_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async restore(id: number): Promise<ApiResponse<ReminderResponse>> {
    const res = await apiClient.patch(REMINDER_ENDPOINTS.RESTORE(id));
    return res.data;
  },

  async toggle(id: number): Promise<ApiResponse<ReminderResponse>> {
    const res = await apiClient.post(REMINDER_ENDPOINTS.TOGGLE(id));
    return res.data;
  },

  async reorder(items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(REMINDER_ENDPOINTS.REORDER, { items });
    return res.data;
  },
};
