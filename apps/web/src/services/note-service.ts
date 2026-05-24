import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { NoteFilters, NoteRequest, NoteResponse, NoteTagDto, TagRequest } from "@/types/note/note";
import { ReorderItem } from "@/types/common/reorder";
import { NOTE_ENDPOINTS } from "@/utils/api-endpoints";

export const noteService = {
  async list(filters?: NoteFilters): Promise<ApiResponse<NoteResponse[]>> {
    const res = await apiClient.get(NOTE_ENDPOINTS.LIST, { params: filters });
    return res.data;
  },

  async getById(id: number): Promise<ApiResponse<NoteResponse>> {
    const res = await apiClient.get(NOTE_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async create(body: NoteRequest): Promise<ApiResponse<NoteResponse>> {
    const res = await apiClient.post(NOTE_ENDPOINTS.CREATE, body);
    return res.data;
  },

  async update(id: number, body: NoteRequest): Promise<ApiResponse<NoteResponse>> {
    const res = await apiClient.put(NOTE_ENDPOINTS.UPDATE(id), body);
    return res.data;
  },

  async remove(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(NOTE_ENDPOINTS.DELETE(id));
    return res.data;
  },

  async listTags(): Promise<ApiResponse<NoteTagDto[]>> {
    const res = await apiClient.get(NOTE_ENDPOINTS.TAGS);
    return res.data;
  },

  async createTag(body: TagRequest): Promise<ApiResponse<NoteTagDto>> {
    const res = await apiClient.post(NOTE_ENDPOINTS.TAGS, body);
    return res.data;
  },

  async deleteTag(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(NOTE_ENDPOINTS.TAG_BY_ID(id));
    return res.data;
  },

  async reorder(items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(NOTE_ENDPOINTS.REORDER, { items });
    return res.data;
  },
};
