import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  RoutineActivityRequest,
  RoutineActivityResponse,
  RoutineReorderItem,
  RoutineSegmentRequest,
  RoutineSegmentResponse,
} from "@/types/routine/routine";
import { ROUTINE_ENDPOINTS } from "@/utils/api-endpoints";

export const routineService = {
  async listSegments(): Promise<ApiResponse<RoutineSegmentResponse[]>> {
    const res = await apiClient.get(ROUTINE_ENDPOINTS.SEGMENTS);
    return res.data;
  },

  async createSegment(
    body: RoutineSegmentRequest,
  ): Promise<ApiResponse<RoutineSegmentResponse>> {
    const res = await apiClient.post(ROUTINE_ENDPOINTS.SEGMENTS, body);
    return res.data;
  },

  async updateSegment(
    id: string,
    body: RoutineSegmentRequest,
  ): Promise<ApiResponse<RoutineSegmentResponse>> {
    const res = await apiClient.put(ROUTINE_ENDPOINTS.SEGMENT_BY_ID(id), body);
    return res.data;
  },

  async deleteSegment(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(ROUTINE_ENDPOINTS.SEGMENT_BY_ID(id));
    return res.data;
  },

  async reorderSegments(
    items: RoutineReorderItem[],
  ): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(ROUTINE_ENDPOINTS.SEGMENTS_REORDER, {
      items,
    });
    return res.data;
  },

  async createActivity(
    segmentId: string,
    body: RoutineActivityRequest,
  ): Promise<ApiResponse<RoutineActivityResponse>> {
    const res = await apiClient.post(
      ROUTINE_ENDPOINTS.SEGMENT_ACTIVITIES(segmentId),
      body,
    );
    return res.data;
  },

  async updateActivity(
    id: string,
    body: RoutineActivityRequest,
  ): Promise<ApiResponse<RoutineActivityResponse>> {
    const res = await apiClient.put(ROUTINE_ENDPOINTS.ACTIVITY_BY_ID(id), body);
    return res.data;
  },

  async deleteActivity(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(ROUTINE_ENDPOINTS.ACTIVITY_BY_ID(id));
    return res.data;
  },

  async reorderActivities(
    segmentId: string,
    items: RoutineReorderItem[],
  ): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(
      ROUTINE_ENDPOINTS.SEGMENT_ACTIVITIES_REORDER(segmentId),
      { items },
    );
    return res.data;
  },
};
