import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useQuickLogSession, useSportWeek } from "./useSport";
import { sportService } from "@/services/sport-service";
import type { SportLogResponse } from "@/types/sport/sport";

vi.mock("@/services/sport-service", () => ({
  sportService: {
    getLogsForPeriod: vi.fn(),
    logWorkout: vi.fn(),
  },
}));

const ok = <T,>(data: T) => ({ success: true, code: 200, message: "ok", data });

const WEEK_KEY = ["sport", "logs", "2026-10-12", "2026-10-18"];
const OTHER_WEEK_KEY = ["sport", "logs", "2026-10-19", "2026-10-25"];
const STATS_KEY = ["sport", "stats", "", ""];

const body = {
  sessionId: "run",
  executedDate: "2026-10-15",
  actualDuration: 30,
  completed: true,
  intensity: 6,
};

const serverLog: SportLogResponse = {
  id: "real-1",
  sessionId: "run",
  executedDate: "2026-10-15",
  actualDuration: 30,
  completed: true,
  intensity: 6,
  notes: null,
  caloriesBurned: null,
  createdAt: "2026-10-15T10:00:00Z",
};

describe("sport week and quick log hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const cachedLogs = (key: unknown[]) =>
    queryClient.getQueryData<{ data: SportLogResponse[] }>(key)?.data;

  describe("useSportWeek", () => {
    it("queries the Monday..Sunday week of the date under the existing logs key", async () => {
      vi.mocked(sportService.getLogsForPeriod).mockResolvedValue(ok([]));
      const { result } = renderHook(() => useSportWeek(new Date(2026, 9, 15, 9, 0)), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(sportService.getLogsForPeriod).toHaveBeenCalledWith("2026-10-12", "2026-10-18");
      expect(queryClient.getQueryData(WEEK_KEY)).toBeDefined();
      expect(result.current.data).toEqual([]);
    });
  });

  describe("useQuickLogSession", () => {
    it("posts the body unchanged", async () => {
      vi.mocked(sportService.logWorkout).mockResolvedValue(ok(serverLog));
      const { result } = renderHook(() => useQuickLogSession(), { wrapper });
      result.current.mutate(body);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(sportService.logWorkout).toHaveBeenCalledTimes(1);
      expect(sportService.logWorkout).toHaveBeenCalledWith(body);
    });

    it("adds the log optimistically to the week cache that contains the date only", async () => {
      let resolve!: (value: ReturnType<typeof ok<SportLogResponse>>) => void;
      vi.mocked(sportService.logWorkout).mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      queryClient.setQueryData(WEEK_KEY, ok([]));
      queryClient.setQueryData(OTHER_WEEK_KEY, ok([]));

      const { result } = renderHook(() => useQuickLogSession(), { wrapper });
      result.current.mutate(body);

      await waitFor(() => expect(cachedLogs(WEEK_KEY)).toHaveLength(1));
      expect(cachedLogs(WEEK_KEY)![0]).toMatchObject({
        sessionId: "run",
        executedDate: "2026-10-15",
        actualDuration: 30,
        completed: true,
        intensity: 6,
      });
      expect(cachedLogs(OTHER_WEEK_KEY)).toEqual([]);

      resolve(ok(serverLog));
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // The optimistic row is replaced by the server row (real id) on success.
      expect(cachedLogs(WEEK_KEY)!.map((l) => l.id)).toEqual(["real-1"]);
    });

    it("replaces an existing log of the same session and date (upsert) instead of duplicating it", async () => {
      vi.mocked(sportService.logWorkout).mockResolvedValue(ok({ ...serverLog, completed: true }));
      queryClient.setQueryData(
        WEEK_KEY,
        ok([{ ...serverLog, id: "old", completed: false, intensity: 3 }]),
      );
      const { result } = renderHook(() => useQuickLogSession(), { wrapper });
      result.current.mutate(body);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(cachedLogs(WEEK_KEY)).toHaveLength(1);
      expect(cachedLogs(WEEK_KEY)![0]).toMatchObject({ completed: true, intensity: 6 });
    });

    it("rolls the caches back when the request fails", async () => {
      vi.mocked(sportService.logWorkout).mockRejectedValue(new Error("Boom"));
      const previous = [{ ...serverLog, id: "keep", executedDate: "2026-10-12" }];
      queryClient.setQueryData(WEEK_KEY, ok(previous));

      const { result } = renderHook(() => useQuickLogSession(), { wrapper });
      result.current.mutate(body);
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(cachedLogs(WEEK_KEY)).toEqual(previous);
    });

    it("invalidates the logs and stats queries when settled", async () => {
      vi.mocked(sportService.logWorkout).mockResolvedValue(ok(serverLog));
      queryClient.setQueryData(STATS_KEY, ok({}));
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useQuickLogSession(), { wrapper });
      result.current.mutate(body);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sport", "logs"] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sport", "stats"] });
      });
    });

    it("also invalidates after a failure", async () => {
      vi.mocked(sportService.logWorkout).mockRejectedValue(new Error("Boom"));
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useQuickLogSession(), { wrapper });
      result.current.mutate(body);
      await waitFor(() => expect(result.current.isError).toBe(true));
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sport", "logs"] }),
      );
    });
  });
});
