import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { timeBlockService } from "@/services/time-block-service";
import { TimeBlockRequest } from "@/types/time-block/time-block";

const TIME_BLOCK_KEYS = {
  all: ["time-blocks"] as const,
  byDate: (date: string) => ["time-blocks", "date", date] as const,
  byRange: (from: string, to: string) =>
    ["time-blocks", "range", from, to] as const,
};

export function useTimeBlocksForDate(date: string) {
  return useQuery({
    queryKey: TIME_BLOCK_KEYS.byDate(date),
    queryFn: () => timeBlockService.listByDate(date),
    select: (d) => d.data,
    enabled: Boolean(date),
  });
}

export function useTimeBlocksForRange(from: string, to: string) {
  return useQuery({
    queryKey: TIME_BLOCK_KEYS.byRange(from, to),
    queryFn: () => timeBlockService.listByRange(from, to),
    select: (d) => d.data,
    enabled: Boolean(from && to),
  });
}

export function useCreateTimeBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TimeBlockRequest) => timeBlockService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIME_BLOCK_KEYS.all }),
  });
}

export function useUpdateTimeBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TimeBlockRequest }) =>
      timeBlockService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIME_BLOCK_KEYS.all }),
  });
}

export function useToggleTimeBlockComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => timeBlockService.toggleComplete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIME_BLOCK_KEYS.all }),
  });
}

export function useDeleteTimeBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => timeBlockService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIME_BLOCK_KEYS.all }),
  });
}
