import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  ListSectionRequest,
  ListSectionResponse,
  TodoListItemRequest,
  TodoListItemResponse,
  TodoListRequest,
  TodoListResponse,
} from "@/types/list/list";
import { ReorderItem } from "@/types/common/reorder";
import { LIST_ENDPOINTS } from "@/utils/api-endpoints";

export const listService = {
  async listLists(): Promise<ApiResponse<TodoListResponse[]>> {
    const res = await apiClient.get(LIST_ENDPOINTS.ALL);
    return res.data;
  },

  async getList(id: number): Promise<ApiResponse<TodoListResponse>> {
    const res = await apiClient.get(LIST_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async createList(body: TodoListRequest): Promise<ApiResponse<TodoListResponse>> {
    const res = await apiClient.post(LIST_ENDPOINTS.ALL, body);
    return res.data;
  },

  async updateList(id: number, body: TodoListRequest): Promise<ApiResponse<TodoListResponse>> {
    const res = await apiClient.put(LIST_ENDPOINTS.BY_ID(id), body);
    return res.data;
  },

  async deleteList(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(LIST_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async restoreList(id: number): Promise<ApiResponse<TodoListResponse>> {
    const res = await apiClient.patch(LIST_ENDPOINTS.RESTORE(id));
    return res.data;
  },

  async reorderLists(items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(LIST_ENDPOINTS.REORDER, { items });
    return res.data;
  },

  async listItems(listId: number): Promise<ApiResponse<TodoListItemResponse[]>> {
    const res = await apiClient.get(LIST_ENDPOINTS.ITEMS(listId));
    return res.data;
  },

  async createItem(
    listId: number,
    body: TodoListItemRequest,
  ): Promise<ApiResponse<TodoListItemResponse>> {
    const res = await apiClient.post(LIST_ENDPOINTS.ITEMS(listId), body);
    return res.data;
  },

  async updateItem(
    id: number,
    body: TodoListItemRequest,
  ): Promise<ApiResponse<TodoListItemResponse>> {
    const res = await apiClient.put(LIST_ENDPOINTS.ITEM_BY_ID(id), body);
    return res.data;
  },

  async toggleItem(id: number): Promise<ApiResponse<TodoListItemResponse>> {
    const res = await apiClient.post(LIST_ENDPOINTS.ITEM_TOGGLE(id));
    return res.data;
  },

  async deleteItem(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(LIST_ENDPOINTS.ITEM_BY_ID(id));
    return res.data;
  },

  async restoreItem(id: number): Promise<ApiResponse<TodoListItemResponse>> {
    const res = await apiClient.patch(LIST_ENDPOINTS.ITEM_RESTORE(id));
    return res.data;
  },

  async reorderItems(listId: number, items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(LIST_ENDPOINTS.ITEMS_REORDER(listId), { items });
    return res.data;
  },

  async listSections(listId: number): Promise<ApiResponse<ListSectionResponse[]>> {
    const res = await apiClient.get(LIST_ENDPOINTS.SECTIONS(listId));
    return res.data;
  },

  async createSection(
    listId: number,
    body: ListSectionRequest,
  ): Promise<ApiResponse<ListSectionResponse>> {
    const res = await apiClient.post(LIST_ENDPOINTS.SECTIONS(listId), body);
    return res.data;
  },

  async updateSection(
    id: number,
    body: ListSectionRequest,
  ): Promise<ApiResponse<ListSectionResponse>> {
    const res = await apiClient.put(LIST_ENDPOINTS.SECTION_BY_ID(id), body);
    return res.data;
  },

  async deleteSection(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(LIST_ENDPOINTS.SECTION_BY_ID(id));
    return res.data;
  },

  async reorderSections(listId: number, items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(LIST_ENDPOINTS.SECTIONS_REORDER(listId), { items });
    return res.data;
  },
};
