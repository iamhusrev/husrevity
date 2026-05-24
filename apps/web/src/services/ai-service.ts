import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { AiConversation, AiMessage, AiMessagePage } from "@/types/ai/ai";
import { SuggestionItem, SuggestionsRequest } from "@/types/ai/suggestion";
import { AI_ENDPOINTS } from "@/utils/api-endpoints";

export const aiService = {
  async listConversations(): Promise<ApiResponse<AiConversation[]>> {
    const res = await apiClient.get(AI_ENDPOINTS.CONVERSATIONS);
    return res.data;
  },

  async createConversation(title?: string): Promise<ApiResponse<AiConversation>> {
    const res = await apiClient.post(AI_ENDPOINTS.CONVERSATIONS, { title });
    return res.data;
  },

  async renameConversation(id: number, title: string): Promise<ApiResponse<AiConversation>> {
    const res = await apiClient.patch(AI_ENDPOINTS.CONVERSATION_BY_ID(id), { title });
    return res.data;
  },

  async deleteConversation(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(AI_ENDPOINTS.CONVERSATION_BY_ID(id));
    return res.data;
  },

  async listMessages(
    conversationId: number,
    page = 0,
    size = 50,
  ): Promise<ApiResponse<AiMessagePage>> {
    const res = await apiClient.get(AI_ENDPOINTS.MESSAGES(conversationId), {
      params: { page, size },
    });
    return res.data;
  },

  async sendMessage(conversationId: number, content: string): Promise<ApiResponse<AiMessage>> {
    const res = await apiClient.post(AI_ENDPOINTS.MESSAGES(conversationId), { content });
    return res.data;
  },

  async getSuggestions(body: SuggestionsRequest): Promise<ApiResponse<SuggestionItem[]>> {
    const res = await apiClient.post(AI_ENDPOINTS.SUGGESTIONS, body);
    return res.data;
  },
};
