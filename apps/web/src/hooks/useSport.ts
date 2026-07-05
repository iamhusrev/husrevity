import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sportService } from "@/services/sport-service";
import {
  GenerateAiProgramRequest,
  SportLogRequest,
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
    mutationFn: ({ id }: { id: string; programId?: string }) =>
      sportService.deleteSession(id),
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
