import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  LearningItemRequest,
  LearningItemResponse,
  LearningItemMoveRequest,
  LearningTopicReorderRequest,
  LearningSubtopicRequest,
  LearningSubtopicResponse,
  LearningTopicRequest,
  LearningTopicResponse,
} from "@/types/learning/learning";
import { LEARNING_ENDPOINTS } from "@/utils/api-endpoints";

export const learningService = {
  async listTopics(): Promise<ApiResponse<LearningTopicResponse[]>> {
    return (await apiClient.get(LEARNING_ENDPOINTS.TOPICS)).data;
  },
  async createTopic(body: LearningTopicRequest): Promise<ApiResponse<LearningTopicResponse>> {
    return (await apiClient.post(LEARNING_ENDPOINTS.TOPICS, body)).data;
  },
  async updateTopic(
    id: string,
    body: LearningTopicRequest,
  ): Promise<ApiResponse<LearningTopicResponse>> {
    return (await apiClient.put(LEARNING_ENDPOINTS.TOPIC_BY_ID(id), body)).data;
  },
  async deleteTopic(id: string): Promise<ApiResponse<void>> {
    return (await apiClient.delete(LEARNING_ENDPOINTS.TOPIC_BY_ID(id))).data;
  },
  async reorderTopics(body: LearningTopicReorderRequest): Promise<ApiResponse<void>> {
    return (await apiClient.patch(LEARNING_ENDPOINTS.TOPICS_REORDER, body)).data;
  },
  async createSubtopic(
    topicId: string,
    body: LearningSubtopicRequest,
  ): Promise<ApiResponse<LearningSubtopicResponse>> {
    return (await apiClient.post(LEARNING_ENDPOINTS.TOPIC_SUBTOPICS(topicId), body)).data;
  },
  async updateSubtopic(
    id: string,
    body: LearningSubtopicRequest,
  ): Promise<ApiResponse<LearningSubtopicResponse>> {
    return (await apiClient.put(LEARNING_ENDPOINTS.SUBTOPIC_BY_ID(id), body)).data;
  },
  async deleteSubtopic(id: string): Promise<ApiResponse<void>> {
    return (await apiClient.delete(LEARNING_ENDPOINTS.SUBTOPIC_BY_ID(id))).data;
  },
  async reorderSubtopics(topicId: string, orderedIds: string[]): Promise<ApiResponse<void>> {
    return (
      await apiClient.patch(LEARNING_ENDPOINTS.TOPIC_SUBTOPICS_REORDER(topicId), { orderedIds })
    ).data;
  },
  async createItem(
    topicId: string,
    body: LearningItemRequest,
  ): Promise<ApiResponse<LearningItemResponse>> {
    return (await apiClient.post(LEARNING_ENDPOINTS.TOPIC_ITEMS(topicId), body)).data;
  },
  async updateItem(
    id: string,
    body: LearningItemRequest,
  ): Promise<ApiResponse<LearningItemResponse>> {
    return (await apiClient.put(LEARNING_ENDPOINTS.ITEM_BY_ID(id), body)).data;
  },
  async deleteItem(id: string): Promise<ApiResponse<void>> {
    return (await apiClient.delete(LEARNING_ENDPOINTS.ITEM_BY_ID(id))).data;
  },
  /** Reorders the direct items of a topic (those without a subtopic). */
  async reorderItems(topicId: string, orderedIds: string[]): Promise<ApiResponse<void>> {
    return (await apiClient.patch(LEARNING_ENDPOINTS.TOPIC_ITEMS_REORDER(topicId), { orderedIds }))
      .data;
  },
  async reorderSubtopicItems(subtopicId: string, orderedIds: string[]): Promise<ApiResponse<void>> {
    return (
      await apiClient.patch(LEARNING_ENDPOINTS.SUBTOPIC_ITEMS_REORDER(subtopicId), { orderedIds })
    ).data;
  },
  async moveItem(id: string, body: LearningItemMoveRequest): Promise<ApiResponse<void>> {
    return (await apiClient.patch(LEARNING_ENDPOINTS.ITEM_MOVE(id), body)).data;
  },
  async toggleItem(id: string): Promise<ApiResponse<LearningItemResponse>> {
    return (await apiClient.post(LEARNING_ENDPOINTS.ITEM_TOGGLE(id))).data;
  },
};
