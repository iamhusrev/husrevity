import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { TodayResponse } from "@/types/today/today";
import { TODAY_ENDPOINTS } from "@/utils/api-endpoints";

export const todayService = {
  async getToday(): Promise<ApiResponse<TodayResponse>> {
    const res = await apiClient.get(TODAY_ENDPOINTS.TODAY);
    return res.data;
  },
};
