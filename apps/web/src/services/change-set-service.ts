import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  ChangeSetDetailResponse,
  ChangeSetSummaryResponse,
  UndoResponse,
} from "@/types/change-set/change-set";
import { CHANGE_SET_ENDPOINTS } from "@/utils/api-endpoints";

export const changeSetService = {
  async list(limit?: number, before?: string): Promise<ApiResponse<ChangeSetSummaryResponse[]>> {
    const res = await apiClient.get(CHANGE_SET_ENDPOINTS.LIST(limit, before));
    return res.data;
  },

  async get(id: string): Promise<ApiResponse<ChangeSetDetailResponse>> {
    const res = await apiClient.get(CHANGE_SET_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async undo(id: string): Promise<ApiResponse<UndoResponse>> {
    const res = await apiClient.post(CHANGE_SET_ENDPOINTS.UNDO(id));
    return res.data;
  },
};
