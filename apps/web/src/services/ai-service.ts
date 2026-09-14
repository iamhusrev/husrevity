import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { SuggestionItem, SuggestionsRequest } from "@/types/ai/suggestion";
import { DictateItemsRequest, DictateItemsResponse } from "@/types/ai/dictate";
import { AI_ENDPOINTS } from "@/utils/api-endpoints";

export const aiService = {
  async getSuggestions(body: SuggestionsRequest): Promise<ApiResponse<SuggestionItem[]>> {
    const res = await apiClient.post(AI_ENDPOINTS.SUGGESTIONS, body);
    return res.data;
  },

  async splitDictatedText(body: DictateItemsRequest): Promise<ApiResponse<DictateItemsResponse>> {
    const res = await apiClient.post(AI_ENDPOINTS.DICTATE_ITEMS, body);
    return res.data;
  },
};
