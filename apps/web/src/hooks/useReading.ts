import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readingService } from "@/services/reading-service";
import {
  ReadingLogRequest,
  ReadingReorderItem,
  ReadingTrackRequest,
} from "@/types/reading/reading";

const READING_KEYS = {
  tracks: ["reading", "tracks"] as const,
  logs: (from: string, to: string) => ["reading", "logs", from, to] as const,
  logsAll: ["reading", "logs"] as const,
};

export function useReadingTracks() {
  return useQuery({
    queryKey: READING_KEYS.tracks,
    queryFn: () => readingService.listTracks(),
    select: (d) => d.data,
  });
}

export function useReadingLogs(from: string, to: string) {
  return useQuery({
    queryKey: READING_KEYS.logs(from, to),
    queryFn: () => readingService.listLogs(from, to),
    select: (d) => d.data,
    enabled: Boolean(from && to),
  });
}

export function useCreateReadingTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReadingTrackRequest) =>
      readingService.createTrack(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: READING_KEYS.tracks }),
  });
}

export function useUpdateReadingTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReadingTrackRequest }) =>
      readingService.updateTrack(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: READING_KEYS.tracks }),
  });
}

export function useDeleteReadingTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => readingService.deleteTrack(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: READING_KEYS.tracks });
      qc.invalidateQueries({ queryKey: READING_KEYS.logsAll });
    },
  });
}

export function useReorderReadingTracks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ReadingReorderItem[]) =>
      readingService.reorderTracks(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: READING_KEYS.tracks }),
  });
}

export function useUpsertReadingLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      trackId,
      date,
      body,
    }: {
      trackId: string;
      date: string;
      body: ReadingLogRequest;
    }) => readingService.upsertLog(trackId, date, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: READING_KEYS.logsAll }),
  });
}

export function useDeleteReadingLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, date }: { trackId: string; date: string }) =>
      readingService.deleteLog(trackId, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: READING_KEYS.logsAll }),
  });
}
