import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changeSetService } from "@/services/change-set-service";

const CHANGE_SET_KEYS = {
  all: ["change-sets"] as const,
  list: (limit?: number) => ["change-sets", limit ?? 5] as const,
  detail: (id: string) => ["change-set", id] as const,
};

export function useChangeSets(limit = 5) {
  return useQuery({
    queryKey: CHANGE_SET_KEYS.list(limit),
    queryFn: () => changeSetService.list(limit),
    select: (d) => d.data,
    refetchOnMount: true,
    refetchInterval: 60_000,
  });
}

export function useUndoChangeSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => changeSetService.undo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANGE_SET_KEYS.all });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      // Goal progress counts items (directly and through linked projects).
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
