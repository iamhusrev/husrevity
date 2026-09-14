import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { learningService } from "@/services/learning-service";
import { LearningItemRequest, LearningReorderItem, LearningSubtopicRequest, LearningTopicRequest } from "@/types/learning/learning";
const LEARNING_KEYS = { topics: ["learning", "topics"] as const };
const invalidate = (qc: ReturnType<typeof useQueryClient>) => () => qc.invalidateQueries({ queryKey: LEARNING_KEYS.topics });
export function useLearningTopics() { return useQuery({ queryKey: LEARNING_KEYS.topics, queryFn: () => learningService.listTopics(), select: (d) => d.data }); }
export function useCreateLearningTopic() { const qc = useQueryClient(); return useMutation({ mutationFn: (body: LearningTopicRequest) => learningService.createTopic(body), onSuccess: invalidate(qc) }); }
export function useUpdateLearningTopic() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, body }: { id: string; body: LearningTopicRequest }) => learningService.updateTopic(id, body), onSuccess: invalidate(qc) }); }
export function useDeleteLearningTopic() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => learningService.deleteTopic(id), onSuccess: invalidate(qc) }); }
export function useReorderLearningTopics() { const qc = useQueryClient(); return useMutation({ mutationFn: (items: LearningReorderItem[]) => learningService.reorderTopics(items), onSuccess: invalidate(qc) }); }
export function useCreateLearningSubtopic() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ topicId, body }: { topicId: string; body: LearningSubtopicRequest }) => learningService.createSubtopic(topicId, body), onSuccess: invalidate(qc) }); }
export function useUpdateLearningSubtopic() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, body }: { id: string; body: LearningSubtopicRequest }) => learningService.updateSubtopic(id, body), onSuccess: invalidate(qc) }); }
export function useDeleteLearningSubtopic() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => learningService.deleteSubtopic(id), onSuccess: invalidate(qc) }); }
export function useReorderLearningSubtopics() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ topicId, items }: { topicId: string; items: LearningReorderItem[] }) => learningService.reorderSubtopics(topicId, items), onSuccess: invalidate(qc) }); }
export function useCreateLearningItem() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ topicId, body }: { topicId: string; body: LearningItemRequest }) => learningService.createItem(topicId, body), onSuccess: invalidate(qc) }); }
export function useUpdateLearningItem() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, body }: { id: string; body: LearningItemRequest }) => learningService.updateItem(id, body), onSuccess: invalidate(qc) }); }
export function useDeleteLearningItem() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => learningService.deleteItem(id), onSuccess: invalidate(qc) }); }
export function useReorderLearningItems() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ topicId, items }: { topicId: string; items: LearningReorderItem[] }) => learningService.reorderItems(topicId, items), onSuccess: invalidate(qc) }); }
export function useToggleLearningItem() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => learningService.toggleItem(id), onSuccess: invalidate(qc) }); }
