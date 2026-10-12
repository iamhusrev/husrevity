import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { goalService } from "@/services/goal-service";
import { GoalListFilter, GoalRequest, GoalUpdateRequest } from "@/types/goal/goal";
import { showErrorAlert } from "@/utils/mutation-error";

const GOAL_KEYS = {
  all: ["goals"] as const,
  list: (filter?: GoalListFilter) => ["goals", "list", filter ?? {}] as const,
  detail: (id: string) => ["goals", "detail", id] as const,
};

export interface GoalMutationOptions {
  /**
   * The caller renders the error next to its form field, so the hook raises no alert.
   * Without it the hook raises exactly one alert itself.
   */
  inlineErrors?: boolean;
}

export function useGoals(filter?: GoalListFilter) {
  return useQuery({
    queryKey: GOAL_KEYS.list(filter),
    queryFn: () => goalService.list(filter),
    select: (d) => d.data,
  });
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: GOAL_KEYS.detail(id),
    queryFn: () => goalService.get(id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

/** Goal progress is derived from items, and item lists carry goal links: refresh both. */
function useInvalidateGoalsAndItems() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: GOAL_KEYS.all });
    qc.invalidateQueries({ queryKey: ["items"] });
  };
}

export function useCreateGoal(options?: GoalMutationOptions) {
  const refresh = useInvalidateGoalsAndItems();
  return useMutation({
    mutationFn: (body: GoalRequest) => goalService.create(body),
    onSuccess: refresh,
    onError: options?.inlineErrors ? undefined : showErrorAlert,
  });
}

export function useUpdateGoal(options?: GoalMutationOptions) {
  const refresh = useInvalidateGoalsAndItems();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: GoalUpdateRequest }) =>
      goalService.update(id, body),
    onSuccess: refresh,
    onError: options?.inlineErrors ? undefined : showErrorAlert,
  });
}

export function useDeleteGoal() {
  const refresh = useInvalidateGoalsAndItems();
  return useMutation({
    mutationFn: (id: string) => goalService.remove(id),
    onSuccess: refresh,
    onError: showErrorAlert,
  });
}

export function useRestoreGoal() {
  const refresh = useInvalidateGoalsAndItems();
  return useMutation({
    mutationFn: (id: string) => goalService.restore(id),
    onSuccess: refresh,
    onError: showErrorAlert,
  });
}
