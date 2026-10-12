import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  CreateNoteLinkRequest,
  LinkedNote,
  NoteLinkResponse,
  NoteLinkTargetType,
} from "@/types/note-link/note-link";
import { NOTE_LINK_ENDPOINTS } from "@/utils/api-endpoints";

export const noteLinkService = {
  async listForNote(noteId: string): Promise<ApiResponse<NoteLinkResponse[]>> {
    const res = await apiClient.get(NOTE_LINK_ENDPOINTS.FOR_NOTE(noteId));
    return res.data;
  },

  async add(noteId: string, body: CreateNoteLinkRequest): Promise<ApiResponse<NoteLinkResponse>> {
    const res = await apiClient.post(NOTE_LINK_ENDPOINTS.FOR_NOTE(noteId), body);
    return res.data;
  },

  async remove(noteId: string, linkId: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(NOTE_LINK_ENDPOINTS.LINK_BY_ID(noteId, linkId));
    return res.data;
  },

  async notesLinkedTo(
    targetType: NoteLinkTargetType,
    targetId: string,
  ): Promise<ApiResponse<LinkedNote[]>> {
    const res = await apiClient.get(NOTE_LINK_ENDPOINTS.BY_TARGET, {
      params: { targetType, targetId },
    });
    return res.data;
  },
};
