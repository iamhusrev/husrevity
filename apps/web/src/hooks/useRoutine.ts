import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routineService } from "@/services/routine-service";
import {
  RoutineActivityRequest,
  RoutineReorderItem,
  RoutineSegmentRequest,
} from "@/types/routine/routine";

const ROUTINE_KEYS = {
  segments: ["routine", "segments"] as const,
};

export function useRoutineSegments() {
  return useQuery({
    queryKey: ROUTINE_KEYS.segments,
    queryFn: () => routineService.listSegments(),
    select: (d) => d.data,
  });
}

export function useCreateRoutineSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoutineSegmentRequest) =>
      routineService.createSegment(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINE_KEYS.segments }),
  });
}

export function useUpdateRoutineSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoutineSegmentRequest }) =>
      routineService.updateSegment(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINE_KEYS.segments }),
  });
}

export function useDeleteRoutineSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => routineService.deleteSegment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINE_KEYS.segments }),
  });
}

export function useReorderRoutineSegments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: RoutineReorderItem[]) =>
      routineService.reorderSegments(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINE_KEYS.segments }),
  });
}

export function useCreateRoutineActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      segmentId,
      body,
    }: {
      segmentId: string;
      body: RoutineActivityRequest;
    }) => routineService.createActivity(segmentId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINE_KEYS.segments }),
  });
}

export function useUpdateRoutineActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoutineActivityRequest }) =>
      routineService.updateActivity(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINE_KEYS.segments }),
  });
}

export function useDeleteRoutineActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => routineService.deleteActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINE_KEYS.segments }),
  });
}
