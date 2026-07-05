import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { SPORT_ENDPOINTS } from "@/utils/api-endpoints";
import {
  GenerateAiProgramRequest,
  SportLogRequest,
  SportLogResponse,
  SportLogUpdateRequest,
  SportProfileRequest,
  SportProfileResponse,
  SportProgramRequest,
  SportProgramResponse,
  SportProgramUpdateRequest,
  SportSessionRequest,
  SportSessionReorderItem,
  SportSessionResponse,
  SportSessionUpdateRequest,
  SportStatsResponse,
} from "@/types/sport/sport";

export const sportService = {
  // ─── Profile ────────────────────────────────────────────────────────────
  async getProfile(): Promise<ApiResponse<SportProfileResponse>> {
    const res = await apiClient.get(SPORT_ENDPOINTS.PROFILE);
    return res.data;
  },

  async updateProfile(
    body: SportProfileRequest,
  ): Promise<ApiResponse<SportProfileResponse>> {
    const res = await apiClient.put(SPORT_ENDPOINTS.PROFILE, body);
    return res.data;
  },

  // ─── Programs ───────────────────────────────────────────────────────────
  async listPrograms(): Promise<ApiResponse<SportProgramResponse[]>> {
    const res = await apiClient.get(SPORT_ENDPOINTS.PROGRAMS);
    return res.data;
  },

  async createProgram(
    body: SportProgramRequest,
  ): Promise<ApiResponse<SportProgramResponse>> {
    const res = await apiClient.post(SPORT_ENDPOINTS.PROGRAMS, body);
    return res.data;
  },

  async getProgram(id: string): Promise<ApiResponse<SportProgramResponse>> {
    const res = await apiClient.get(SPORT_ENDPOINTS.PROGRAM_BY_ID(id));
    return res.data;
  },

  async updateProgram(
    id: string,
    body: SportProgramUpdateRequest,
  ): Promise<ApiResponse<SportProgramResponse>> {
    const res = await apiClient.put(SPORT_ENDPOINTS.PROGRAM_BY_ID(id), body);
    return res.data;
  },

  async deleteProgram(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(SPORT_ENDPOINTS.PROGRAM_BY_ID(id));
    return res.data;
  },

  async activateProgram(
    id: string,
    isActive: boolean,
  ): Promise<ApiResponse<SportProgramResponse>> {
    const res = await apiClient.post(SPORT_ENDPOINTS.PROGRAM_ACTIVATE(id), {
      isActive,
    });
    return res.data;
  },

  async generateAiProgram(
    body: GenerateAiProgramRequest,
  ): Promise<ApiResponse<SportProgramResponse>> {
    const res = await apiClient.post(SPORT_ENDPOINTS.PROGRAM_GENERATE_AI, body);
    return res.data;
  },

  // ─── Sessions ───────────────────────────────────────────────────────────
  async createSession(
    body: SportSessionRequest,
  ): Promise<ApiResponse<SportSessionResponse>> {
    const res = await apiClient.post(SPORT_ENDPOINTS.SESSIONS, body);
    return res.data;
  },

  async updateSession(
    id: string,
    body: SportSessionUpdateRequest,
  ): Promise<ApiResponse<SportSessionResponse>> {
    const res = await apiClient.put(SPORT_ENDPOINTS.SESSION_BY_ID(id), body);
    return res.data;
  },

  async deleteSession(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(SPORT_ENDPOINTS.SESSION_BY_ID(id));
    return res.data;
  },

  async reorderSessions(
    items: SportSessionReorderItem[],
  ): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(SPORT_ENDPOINTS.SESSIONS_REORDER, { items });
    return res.data;
  },

  // ─── Logs ───────────────────────────────────────────────────────────────
  async logWorkout(body: SportLogRequest): Promise<ApiResponse<SportLogResponse>> {
    const res = await apiClient.post(SPORT_ENDPOINTS.LOGS, body);
    return res.data;
  },

  async getLogsForPeriod(
    from: string,
    to: string,
  ): Promise<ApiResponse<SportLogResponse[]>> {
    const res = await apiClient.get(SPORT_ENDPOINTS.LOGS_FOR_PERIOD(from, to));
    return res.data;
  },

  async updateLog(
    id: string,
    body: SportLogUpdateRequest,
  ): Promise<ApiResponse<SportLogResponse>> {
    const res = await apiClient.put(SPORT_ENDPOINTS.LOG_BY_ID(id), body);
    return res.data;
  },

  async deleteLog(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(SPORT_ENDPOINTS.LOG_BY_ID(id));
    return res.data;
  },

  // ─── Stats ──────────────────────────────────────────────────────────────
  async getStats(from?: string, to?: string): Promise<ApiResponse<SportStatsResponse>> {
    const res = await apiClient.get(SPORT_ENDPOINTS.STATS(from, to));
    return res.data;
  },
};
