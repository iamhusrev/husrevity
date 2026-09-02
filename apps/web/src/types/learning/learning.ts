export interface LearningItemResponse {
  id: string; topicId: string; text: string; url: string | null; notes: string | null;
  estimatedMinutes: number | null; reviewAt: string | null; notifyMinutesBefore: number | null;
  completedAt: string | null; position: number;
}
export interface LearningTopicResponse {
  id: string; title: string; description: string | null; position: number; items: LearningItemResponse[];
  itemCount: number; completedCount: number; createdAt: string; updatedAt: string;
}
export interface LearningTopicRequest { title: string; description?: string | null; }
export interface LearningItemRequest {
  text: string; url?: string | null; notes?: string | null; estimatedMinutes?: number | null;
  reviewAt?: string | null; notifyMinutesBefore?: number | null; position?: number;
}
export interface LearningReorderItem { id: string; position: number; }
