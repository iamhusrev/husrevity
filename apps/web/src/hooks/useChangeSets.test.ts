import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useChangeSets, useUndoChangeSet } from "./useChangeSets";
import { changeSetService } from "@/services/change-set-service";

vi.mock("@/services/change-set-service", () => ({
  changeSetService: {
    list: vi.fn(),
    undo: vi.fn(),
  },
}));

describe("useChangeSets & useUndoChangeSet", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("useChangeSets fetches change sets with limit", async () => {
    const mockList = [
      {
        id: "cs-1",
        source: "mcp",
        label: "Plan day",
        status: "applied",
        createdAt: "2026-10-12T10:00:00Z",
        entryCount: 2,
      },
    ];
    vi.mocked(changeSetService.list).mockResolvedValue({
      success: true,
      data: mockList as any,
      code: 200,
      message: "",
    });

    const { result } = renderHook(() => useChangeSets(5), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(changeSetService.list).toHaveBeenCalledWith(5);
    expect(result.current.data).toEqual(mockList);
  });

  it("useUndoChangeSet calls undo service and invalidates change-sets, today, and items", async () => {
    const mockUndoRes = {
      id: "cs-1",
      status: "undone",
      undoneEntries: 2,
      conflicts: [],
    };
    vi.mocked(changeSetService.undo).mockResolvedValue({
      success: true,
      data: mockUndoRes as any,
      code: 200,
      message: "",
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUndoChangeSet(), { wrapper });

    result.current.mutate("cs-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(changeSetService.undo).toHaveBeenCalledWith("cs-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["change-sets"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["today"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["items"] });
    // Goal progress counts items, so an undo must refresh it too.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["goals"] });
  });
});
