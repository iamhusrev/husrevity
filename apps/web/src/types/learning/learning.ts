export interface LearningItemResponse {
  id: string;
  topicId: string;
  subtopicId: string | null;
  text: string;
  url: string | null;
  notes: string | null;
  estimatedMinutes: number | null;
  reviewAt: string | null;
  notifyMinutesBefore: number | null;
  completedAt: string | null;
  position: number;
}
export interface LearningSubtopicResponse {
  id: string;
  topicId: string;
  title: string;
  description: string | null;
  position: number;
  items: LearningItemResponse[];
  itemCount: number;
  completedCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface LearningTopicResponse {
  id: string;
  title: string;
  description: string | null;
  position: number;
  items: LearningItemResponse[];
  subtopics: LearningSubtopicResponse[];
  itemCount: number;
  completedCount: number;
  /** The year the topic is filed under, always resolved by the API (stored year, else creation year). */
  year: number;
  createdAt: string;
  updatedAt: string;
}
export interface LearningTopicRequest {
  title: string;
  description?: string | null;
  /** Omit to leave the year untouched on update; null resets it to the creation year. 2000-2100. */
  year?: number | null;
}
export interface LearningSubtopicRequest {
  title: string;
  description?: string | null;
}
export interface LearningItemRequest {
  text: string;
  url?: string | null;
  notes?: string | null;
  estimatedMinutes?: number | null;
  reviewAt?: string | null;
  notifyMinutesBefore?: number | null;
  position?: number;
  subtopicId?: string | null;
}
/** Body of every learning reorder call: the complete id list of one parent, first = top priority. */
export interface LearningReorderRequest {
  orderedIds: string[];
}
export interface LearningTopicReorderRequest extends LearningReorderRequest {
  /** When set, `orderedIds` covers that year's topics only. */
  year?: number;
}
export interface LearningItemMoveRequest {
  /** Target subtopic of the same topic, or null for the topic's direct item list. */
  subtopicId: string | null;
  /** Zero-based index in the target list. */
  index: number;
}
