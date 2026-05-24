import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  TimeBlockRequest,
  TimeBlockResponse,
} from "@/types/time-block/time-block";
import { TIME_BLOCK_ENDPOINTS } from "@/utils/api-endpoints";

export const timeBlockService = {
  async listByDate(date: string): Promise<ApiResponse<TimeBlockResponse[]>> {
    const res = await apiClient.get(TIME_BLOCK_ENDPOINTS.LIST, {
      params: { date },
    });
    return res.data;
  },

  async listByRange(
    from: string,
    to: string,
  ): Promise<ApiResponse<TimeBlockResponse[]>> {
    const res = await apiClient.get(TIME_BLOCK_ENDPOINTS.LIST, {
      params: { from, to },
    });
    return res.data;
  },

  async create(body: TimeBlockRequest): Promise<ApiResponse<TimeBlockResponse>> {
    const res = await apiClient.post(TIME_BLOCK_ENDPOINTS.LIST, body);
    return res.data;
  },

  async update(
    id: string,
    body: TimeBlockRequest,
  ): Promise<ApiResponse<TimeBlockResponse>> {
    const res = await apiClient.put(TIME_BLOCK_ENDPOINTS.BY_ID(id), body);
    return res.data;
  },

  async toggleComplete(id: string): Promise<ApiResponse<TimeBlockResponse>> {
    const res = await apiClient.patch(TIME_BLOCK_ENDPOINTS.COMPLETE(id));
    return res.data;
  },

  async delete(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(TIME_BLOCK_ENDPOINTS.BY_ID(id));
    return res.data;
  },
};
