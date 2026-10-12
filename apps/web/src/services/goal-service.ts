import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { GoalListFilter, GoalRequest, GoalResponse, GoalUpdateRequest } from "@/types/goal/goal";
import { GOAL_ENDPOINTS } from "@/utils/api-endpoints";

export const goalService = {
  async list(filter?: GoalListFilter): Promise<ApiResponse<GoalResponse[]>> {
    const res = await apiClient.get(GOAL_ENDPOINTS.GOALS, { params: filter });
    return res.data;
  },

  async get(id: string): Promise<ApiResponse<GoalResponse>> {
    const res = await apiClient.get(GOAL_ENDPOINTS.GOAL_BY_ID(id));
    return res.data;
  },

  async create(body: GoalRequest): Promise<ApiResponse<GoalResponse>> {
    const res = await apiClient.post(GOAL_ENDPOINTS.GOALS, body);
    return res.data;
  },

  async update(id: string, body: GoalUpdateRequest): Promise<ApiResponse<GoalResponse>> {
    const res = await apiClient.patch(GOAL_ENDPOINTS.GOAL_BY_ID(id), body);
    return res.data;
  },

  async remove(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(GOAL_ENDPOINTS.GOAL_BY_ID(id));
    return res.data;
  },

  async restore(id: string): Promise<ApiResponse<GoalResponse>> {
    const res = await apiClient.patch(GOAL_ENDPOINTS.GOAL_RESTORE(id));
    return res.data;
  },
};
