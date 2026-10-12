import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useCreateGoal,
  useDeleteGoal,
  useGoal,
  useGoals,
  useRestoreGoal,
  useUpdateGoal,
} from "./useGoals";
import { goalService } from "@/services/goal-service";
import { alertStore } from "@/stores/alert-store";

vi.mock("@/services/goal-service", () => ({
  goalService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
  },
}));

describe("useGoals hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("useGoals passes the filter to the service", async () => {
    vi.mocked(goalService.list).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: [],
    });
    const { result } = renderHook(() => useGoals({ status: "active", limit: 200 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(goalService.list).toHaveBeenCalledWith({ status: "active", limit: 200 });
  });

  it("useGoal is disabled without an id", () => {
    renderHook(() => useGoal(""), { wrapper });
    expect(goalService.get).not.toHaveBeenCalled();
  });

  it("keeps different filters in different cache entries under ['goals']", async () => {
    vi.mocked(goalService.list).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: [],
    });
    renderHook(() => useGoals({ status: "active" }), { wrapper });
    renderHook(() => useGoals({ status: "done" }), { wrapper });
    await waitFor(() => expect(goalService.list).toHaveBeenCalledTimes(2));
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys.every((k) => k[0] === "goals")).toBe(true);
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(2);
  });

  const mutations: Array<[string, () => unknown, (m: unknown) => void, () => void]> = [
    [
      "useCreateGoal",
      () => useCreateGoal(),
      (m) =>
        (m as ReturnType<typeof useCreateGoal>).mutate({
          title: "G",
          horizon: "month",
          periodStart: "2026-10-01",
          periodEnd: "2026-10-31",
        }),
      () => vi.mocked(goalService.create).mockResolvedValue({ data: {} } as never),
    ],
    [
      "useUpdateGoal",
      () => useUpdateGoal(),
      (m) => (m as ReturnType<typeof useUpdateGoal>).mutate({ id: "1", body: { status: "done" } }),
      () => vi.mocked(goalService.update).mockResolvedValue({ data: {} } as never),
    ],
    [
      "useDeleteGoal",
      () => useDeleteGoal(),
      (m) => (m as ReturnType<typeof useDeleteGoal>).mutate("1"),
      () => vi.mocked(goalService.remove).mockResolvedValue({} as never),
    ],
    [
      "useRestoreGoal",
      () => useRestoreGoal(),
      (m) => (m as ReturnType<typeof useRestoreGoal>).mutate("1"),
      () => vi.mocked(goalService.restore).mockResolvedValue({ data: {} } as never),
    ],
  ];

  mutations.forEach(([name, useHook, run, arrange]) => {
    it(`${name} invalidates goals and items (progress depends on items)`, async () => {
      arrange();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useHook(), { wrapper });
      run(result.current);
      await waitFor(() => expect((result.current as { isSuccess: boolean }).isSuccess).toBe(true));
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["goals"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["items"] });
    });
  });

  it("raises exactly one error alert on failure", async () => {
    vi.mocked(goalService.update).mockRejectedValueOnce(new Error("Boom"));
    const alertSpy = vi.spyOn(alertStore.getState(), "show");
    const { result } = renderHook(() => useUpdateGoal(), { wrapper });
    result.current.mutate({ id: "1", body: { status: "done" } });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", message: "Boom" }),
    );
  });

  it("raises no alert when the caller renders the error inline", async () => {
    vi.mocked(goalService.create).mockRejectedValueOnce(new Error("Boom"));
    const alertSpy = vi.spyOn(alertStore.getState(), "show");
    const { result } = renderHook(() => useCreateGoal({ inlineErrors: true }), { wrapper });
    result.current.mutate({
      title: "G",
      horizon: "month",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
