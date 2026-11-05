import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { learningService } from "@/services/learning-service";
import {
  LearningItemRequest,
  LearningSubtopicRequest,
  LearningTopicRequest,
  LearningTopicResponse,
} from "@/types/learning/learning";
import { ApiResponse } from "@/types/common/api-response";
import {
  applyItemMove,
  applyItemOrder,
  applySubtopicOrder,
  applyTopicOrder,
  ItemMove,
  ItemOrder,
  TopicOrder,
} from "@/views/learning/learning-order";
const LEARNING_KEYS = { topics: ["learning", "topics"] as const };
const invalidate = (qc: ReturnType<typeof useQueryClient>) => () =>
  qc.invalidateQueries({ queryKey: LEARNING_KEYS.topics });
export function useLearningTopics() {
  return useQuery({
    queryKey: LEARNING_KEYS.topics,
    queryFn: () => learningService.listTopics(),
    select: (d) => d.data,
  });
}
export function useCreateLearningTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LearningTopicRequest) => learningService.createTopic(body),
    onSuccess: invalidate(qc),
  });
}
export function useUpdateLearningTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LearningTopicRequest }) =>
      learningService.updateTopic(id, body),
    onSuccess: invalidate(qc),
  });
}
export function useDeleteLearningTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => learningService.deleteTopic(id),
    onSuccess: invalidate(qc),
  });
}
export function useCreateLearningSubtopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, body }: { topicId: string; body: LearningSubtopicRequest }) =>
      learningService.createSubtopic(topicId, body),
    onSuccess: invalidate(qc),
  });
}
export function useUpdateLearningSubtopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LearningSubtopicRequest }) =>
      learningService.updateSubtopic(id, body),
    onSuccess: invalidate(qc),
  });
}
export function useDeleteLearningSubtopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => learningService.deleteSubtopic(id),
    onSuccess: invalidate(qc),
  });
}
export function useCreateLearningItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, body }: { topicId: string; body: LearningItemRequest }) =>
      learningService.createItem(topicId, body),
    onSuccess: invalidate(qc),
  });
}
export function useUpdateLearningItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LearningItemRequest }) =>
      learningService.updateItem(id, body),
    onSuccess: invalidate(qc),
  });
}
export function useDeleteLearningItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => learningService.deleteItem(id),
    onSuccess: invalidate(qc),
  });
}
export function useToggleLearningItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => learningService.toggleItem(id),
    onSuccess: invalidate(qc),
  });
}

type TopicsCache = ApiResponse<LearningTopicResponse[]>;

const ORDER_MUTATION_KEY = ["learning", "order"] as const;

export interface OptimisticLearningOptions {
  /** Called after the cache is rolled back, e.g. to show an error toast. */
  onError?: (error: unknown) => void;
}

/**
 * Mutation that applies `apply` to the cached topic list right away, rolls the cache back to the
 * snapshot if the request fails, and refetches once it settles either way.
 *
 * Reorders can overlap (a second drag before the first returns). Then a snapshot taken by the
 * later one contains the earlier one's unconfirmed order, and an early refetch would overwrite the
 * newer optimistic state. So rollback and refetch only happen when no other reorder is in flight;
 * the last one to settle refetches, and that list is the server's truth.
 */
function useOptimisticLearning<TVars>(
  mutationFn: (vars: TVars) => Promise<unknown>,
  apply: (topics: LearningTopicResponse[], vars: TVars) => LearningTopicResponse[],
  options: OptimisticLearningOptions = {},
) {
  const qc = useQueryClient();
  // While a mutation's own callbacks run it still counts as pending, so <= 1 means "alone".
  const isAlone = () => qc.isMutating({ mutationKey: ORDER_MUTATION_KEY }) <= 1;
  return useMutation({
    mutationKey: ORDER_MUTATION_KEY,
    mutationFn,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey: LEARNING_KEYS.topics });
      const previous = qc.getQueryData<TopicsCache>(LEARNING_KEYS.topics);
      if (previous?.data)
        qc.setQueryData<TopicsCache>(LEARNING_KEYS.topics, {
          ...previous,
          data: apply(previous.data, vars),
        });
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous && isAlone()) qc.setQueryData(LEARNING_KEYS.topics, context.previous);
      options.onError?.(error);
    },
    onSettled: () => {
      if (isAlone()) return invalidate(qc)();
    },
  });
}

export function useReorderLearningTopics(options?: OptimisticLearningOptions) {
  return useOptimisticLearning(
    (order: TopicOrder) => learningService.reorderTopics(order),
    applyTopicOrder,
    options,
  );
}

export function useReorderLearningSubtopics(options?: OptimisticLearningOptions) {
  return useOptimisticLearning(
    ({ topicId, orderedIds }: { topicId: string; orderedIds: string[] }) =>
      learningService.reorderSubtopics(topicId, orderedIds),
    (topics, { topicId, orderedIds }) => applySubtopicOrder(topics, topicId, orderedIds),
    options,
  );
}

/** Reorders the items of one subtopic, or the direct items of a topic when no subtopicId is given. */
export function useReorderLearningItems(options?: OptimisticLearningOptions) {
  return useOptimisticLearning(
    (order: ItemOrder) =>
      order.subtopicId
        ? learningService.reorderSubtopicItems(order.subtopicId, order.orderedIds)
        : learningService.reorderItems(order.topicId, order.orderedIds),
    applyItemOrder,
    options,
  );
}

export function useMoveLearningItem(options?: OptimisticLearningOptions) {
  return useOptimisticLearning(
    ({ itemId, ...move }: { itemId: string } & ItemMove) => learningService.moveItem(itemId, move),
    (topics, { itemId, ...move }) => applyItemMove(topics, itemId, move),
    options,
  );
}
