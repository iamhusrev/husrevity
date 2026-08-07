import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { UserSummary } from "@/types/user/user";
import { USER_DIRECTORY_ENDPOINTS } from "@/utils/api-endpoints";

export const userDirectoryService = {
  async listUsers(): Promise<ApiResponse<UserSummary[]>> {
    const res = await apiClient.get(USER_DIRECTORY_ENDPOINTS.LIST);
    return res.data;
  },
};
