import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  CompleteItemRequest,
  ItemListFilter,
  ItemRequest,
  ItemResponse,
  ParsedQuickAddDraft,
} from "@/types/item/item";
import { ITEM_ENDPOINTS } from "@/utils/api-endpoints";

export const itemService = {
  async listItems(filter?: ItemListFilter): Promise<ApiResponse<ItemResponse[]>> {
    const res = await apiClient.get(ITEM_ENDPOINTS.ITEMS, { params: filter });
    return res.data;
  },

  async getItem(id: string): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.get(ITEM_ENDPOINTS.ITEM_BY_ID(id));
    return res.data;
  },

  async createItem(body: ItemRequest): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.post(ITEM_ENDPOINTS.ITEMS, body);
    return res.data;
  },

  async updateItem(id: string, body: Partial<ItemRequest>): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.patch(ITEM_ENDPOINTS.ITEM_BY_ID(id), body);
    return res.data;
  },

  async deleteItem(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(ITEM_ENDPOINTS.ITEM_BY_ID(id));
    return res.data;
  },

  async completeItem(id: string, body: CompleteItemRequest): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.post(ITEM_ENDPOINTS.ITEM_COMPLETE(id), body);
    return res.data;
  },

  async parseQuickAdd(text: string): Promise<ApiResponse<ParsedQuickAddDraft>> {
    const res = await apiClient.post(ITEM_ENDPOINTS.PARSE_QUICK_ADD, { text });
    return res.data;
  },
};
