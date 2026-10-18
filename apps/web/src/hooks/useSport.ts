import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sportService } from "@/services/sport-service";
import type { ApiResponse } from "@/types/common/api-response";
import { weekRange, type QuickLogBody } from "@/views/sport/sport-schedule";
import {
  GenerateAiProgramRequest,
  SportLogRequest,
  SportLogResponse,
  SportLogUpdateRequest,
  SportProfileRequest,
  SportProgramRequest,
  SportProgramUpdateRequest,
  SportSessionRequest,
  SportSessionReorderItem,
  SportSessionUpdateRequest,
} from "@/types/sport/sport";

const SPORT_KEYS = {
  profile: ["sport", "profile"] as const,
  programs: ["sport", "programs"] as const,
  program: (id: string) => ["sport", "programs", id] as const,
  logs: (from: string, to: string) => ["sport", "logs", from, to] as const,
  stats: (from?: string, to?: string) => ["sport", "stats", from ?? "", to ?? ""] as const,
};

// ─── Profile ────────────────────────────────────────────────────────────────

export function useSportProfile() {
  return useQuery({
    queryKey: SPORT_KEYS.profile,
    queryFn: () => sportService.getProfile(),
    select: (d) => d.data,
  });
}

export function useUpdateSportProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SportProfileRequest) => sportService.updateProfile(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SPORT_KEYS.profile }),
  });
}

// ─── Programs ───────────────────────────────────────────────────────────────

export function useSportPrograms() {
  return useQuery({
    queryKey: SPORT_KEYS.programs,
    queryFn: () => sportService.listPrograms(),
    select: (d) => d.data,
  });
}

export function useGetSportProgram(id: string) {
  return useQuery({
    queryKey: SPORT_KEYS.program(id),
    queryFn: () => sportService.getProgram(id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

export function useCreateSportProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SportProgramRequest) => sportService.createProgram(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SPORT_KEYS.programs }),
  });
}

export function useUpdateSportProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SportProgramUpdateRequest }) =>
      sportService.updateProgram(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: SPORT_KEYS.programs });
      qc.invalidateQueries({ queryKey: SPORT_KEYS.program(vars.id) });
    },
  });
}

export function useDeleteSportProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sportService.deleteProgram(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SPORT_KEYS.programs }),
  });
}

export function useActivateSportProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      sportService.activateProgram(id, isActive),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: SPORT_KEYS.programs });
      qc.invalidateQueries({ queryKey: SPORT_KEYS.program(vars.id) });
    },
  });
}

export function useGenerateSportProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateAiProgramRequest) => sportService.generateAiProgram(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SPORT_KEYS.programs }),
  });
}

// ─── Sessions ───────────────────────────────────────────────────────────────
// Sessions live inside a program's `sessions[]`; mutations invalidate that
// program's detail query (and the programs list, since cards show session
// counts).

export function useCreateSportSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SportSessionRequest) => sportService.createSession(body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: SPORT_KEYS.programs });
      if (vars.programId) {
        qc.invalidateQueries({ queryKey: SPORT_KEYS.program(vars.programId) });
      }
    },
  });
}

export function useUpdateSportSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: SportSessionUpdateRequest;
      programId?: string;
    }) => sportService.updateSession(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: SPORT_KEYS.programs });
      if (vars.programId) {
        qc.invalidateQueries({ queryKey: SPORT_KEYS.program(vars.programId) });
      }
    },
  });
}

export function useDeleteSportSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; programId?: string }) => sportService.deleteSession(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: SPORT_KEYS.programs });
      if (vars.programId) {
        qc.invalidateQueries({ queryKey: SPORT_KEYS.program(vars.programId) });
      }
    },
  });
}

export function useReorderSportSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ items }: { items: SportSessionReorderItem[]; programId?: string }) =>
      sportService.reorderSessions(items),
    onSuccess: (_, vars) => {
      if (vars.programId) {
        qc.invalidateQueries({ queryKey: SPORT_KEYS.program(vars.programId) });
      }
    },
  });
}

// ─── Logs ───────────────────────────────────────────────────────────────────

export function useSportLogs(from: string, to: string) {
  return useQuery({
    queryKey: SPORT_KEYS.logs(from, to),
    queryFn: () => sportService.getLogsForPeriod(from, to),
    select: (d) => d.data,
    enabled: Boolean(from && to),
  });
}

/** Logs of the Monday..Sunday week that contains `date` (same cache key shape as `useSportLogs`). */
export function useSportWeek(date: Date) {
  const { from, to } = weekRange(date);
  return useSportLogs(from, to);
}

type LogsCache = ApiResponse<SportLogResponse[]> | undefined;

/** True when the `["sport","logs",from,to]` key covers `date`. */
function logsKeyCovers(key: readonly unknown[], date: string): boolean {
  const [, , from, to] = key;
  return typeof from === "string" && typeof to === "string" && from <= date && date <= to;
}

/** Replaces the log of the same session and date if there is one (the API upserts), else appends. */
function upsertLog(logs: SportLogResponse[], log: SportLogResponse): SportLogResponse[] {
  const index = logs.findIndex(
    (l) => l.sessionId === log.sessionId && l.executedDate === log.executedDate,
  );
  if (index === -1) return [...logs, log];
  return logs.map((l, i) => (i === index ? log : l));
}

/**
 * One-tap log of a planned session: `POST /sport/logs` (an upsert per
 * session and date). The row is written optimistically into every cached
 * logs range that contains the date, swapped for the server row on success
 * and rolled back on error; logs and stats are invalidated when settled.
 */
export function useQuickLogSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuickLogBody) => sportService.logWorkout(body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["sport", "logs"] });
      const optimistic: SportLogResponse = {
        id: `optimistic-${Date.now()}`,
        sessionId: body.sessionId,
        executedDate: body.executedDate,
        actualDuration: body.actualDuration,
        completed: body.completed,
        intensity: body.intensity,
        notes: null,
        caloriesBurned: null,
        createdAt: new Date().toISOString(),
      };
      const previous = qc
        .getQueriesData<LogsCache>({ queryKey: ["sport", "logs"] })
        .filter(([key]) => logsKeyCovers(key, body.executedDate));
      for (const [key, cache] of previous) {
        if (!cache) continue;
        qc.setQueryData<LogsCache>(key, {
          ...cache,
          data: upsertLog(cache.data ?? [], optimistic),
        });
      }
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: (res, _body, context) => {
      const saved = res.data;
      if (!saved || !context) return;
      for (const [key] of context.previous) {
        qc.setQueryData<LogsCache>(key, (cache) =>
          cache
            ? {
                ...cache,
                data: upsertLog(
                  (cache.data ?? []).filter((l) => l.id !== context.optimisticId),
                  saved,
                ),
              }
            : cache,
        );
      }
    },
    onError: (_err, _body, context) => {
      for (const [key, cache] of context?.previous ?? []) qc.setQueryData(key, cache);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["sport", "logs"] });
      qc.invalidateQueries({ queryKey: ["sport", "stats"] });
    },
  });
}

export function useCreateSportLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SportLogRequest) => sportService.logWorkout(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sport", "logs"] });
      qc.invalidateQueries({ queryKey: ["sport", "stats"] });
    },
  });
}

export function useUpdateSportLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SportLogUpdateRequest }) =>
      sportService.updateLog(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sport", "logs"] });
      qc.invalidateQueries({ queryKey: ["sport", "stats"] });
    },
  });
}

export function useDeleteSportLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sportService.deleteLog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sport", "logs"] });
      qc.invalidateQueries({ queryKey: ["sport", "stats"] });
    },
  });
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function useSportStats(from?: string, to?: string) {
  return useQuery({
    queryKey: SPORT_KEYS.stats(from, to),
    queryFn: () => sportService.getStats(from, to),
    select: (d) => d.data,
  });
}
