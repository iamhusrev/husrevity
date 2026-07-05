import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  ReadingLogRequest,
  ReadingLogResponse,
  ReadingReorderItem,
  ReadingTrackRequest,
  ReadingTrackResponse,
} from "@/types/reading/reading";
import { READING_ENDPOINTS } from "@/utils/api-endpoints";

export const readingService = {
  async listTracks(): Promise<ApiResponse<ReadingTrackResponse[]>> {
    const res = await apiClient.get(READING_ENDPOINTS.TRACKS);
    return res.data;
  },

  async createTrack(
    body: ReadingTrackRequest,
  ): Promise<ApiResponse<ReadingTrackResponse>> {
    const res = await apiClient.post(READING_ENDPOINTS.TRACKS, body);
    return res.data;
  },

  async updateTrack(
    id: string,
    body: ReadingTrackRequest,
  ): Promise<ApiResponse<ReadingTrackResponse>> {
    const res = await apiClient.put(READING_ENDPOINTS.TRACK_BY_ID(id), body);
    return res.data;
  },

  async deleteTrack(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(READING_ENDPOINTS.TRACK_BY_ID(id));
    return res.data;
  },

  async reorderTracks(
    items: ReadingReorderItem[],
  ): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(READING_ENDPOINTS.TRACKS_REORDER, {
      items,
    });
    return res.data;
  },

  async listLogs(
    from: string,
    to: string,
  ): Promise<ApiResponse<ReadingLogResponse[]>> {
    const res = await apiClient.get(READING_ENDPOINTS.LOGS(from, to));
    return res.data;
  },

  async upsertLog(
    trackId: string,
    date: string,
    body: ReadingLogRequest,
  ): Promise<ApiResponse<ReadingLogResponse>> {
    const res = await apiClient.put(
      READING_ENDPOINTS.LOG_FOR_DATE(trackId, date),
      body,
    );
    return res.data;
  },

  async deleteLog(trackId: string, date: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(
      READING_ENDPOINTS.LOG_FOR_DATE(trackId, date),
    );
    return res.data;
  },
};
