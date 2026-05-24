import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { PlanItemRequest, PlanItemResponse, PlanRequest, PlanResponse } from "@/types/plan/plan";
import { PLAN_ENDPOINTS } from "@/utils/api-endpoints";

export const planService = {
  async listPlans(): Promise<ApiResponse<PlanResponse[]>> {
    const res = await apiClient.get(PLAN_ENDPOINTS.ALL);
    return res.data;
  },

  async getPlan(id: number): Promise<ApiResponse<PlanResponse>> {
    const res = await apiClient.get(PLAN_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async createPlan(body: PlanRequest): Promise<ApiResponse<PlanResponse>> {
    const res = await apiClient.post(PLAN_ENDPOINTS.ALL, body);
    return res.data;
  },

  async updatePlan(id: number, body: PlanRequest): Promise<ApiResponse<PlanResponse>> {
    const res = await apiClient.put(PLAN_ENDPOINTS.BY_ID(id), body);
    return res.data;
  },

  async deletePlan(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PLAN_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async listItems(planId: number): Promise<ApiResponse<PlanItemResponse[]>> {
    const res = await apiClient.get(PLAN_ENDPOINTS.ITEMS(planId));
    return res.data;
  },

  async createItem(planId: number, body: PlanItemRequest): Promise<ApiResponse<PlanItemResponse>> {
    const res = await apiClient.post(PLAN_ENDPOINTS.ITEMS(planId), body);
    return res.data;
  },

  async updateItem(id: number, body: PlanItemRequest): Promise<ApiResponse<PlanItemResponse>> {
    const res = await apiClient.put(PLAN_ENDPOINTS.ITEM_BY_ID(id), body);
    return res.data;
  },

  async deleteItem(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PLAN_ENDPOINTS.ITEM_BY_ID(id));
    return res.data;
  },
};
