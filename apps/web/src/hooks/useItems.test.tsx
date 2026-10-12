import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useItemsInRange, useCompleteItem, useScheduleItem } from "./useItems";
import { itemService } from "@/services/item-service";

vi.mock("@/services/item-service", () => ({
  itemService: {
    listItems: vi.fn(),
    completeItem: vi.fn(),
    updateItem: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useItemsInRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls itemService.listItems with inclusive Istanbul day boundary ISO instants", async () => {
    const mockItems = [
      {
        id: "1",
        title: "Test Task",
        kind: "task",
        scheduledAt: "2026-10-12T10:00:00+03:00",
      },
    ];
    vi.mocked(itemService.listItems).mockResolvedValueOnce({
      success: true,
      message: "OK",
      code: 200,
      data: mockItems as any,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useItemsInRange("2026-10-01", "2026-10-31"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(itemService.listItems).toHaveBeenCalledWith({
      from: "2026-10-01T00:00:00+03:00",
      to: "2026-10-31T23:59:59.999+03:00",
    });
    expect(result.current.data).toEqual(mockItems);
  });

  it("passes additional filter options (kind, context, status)", async () => {
    vi.mocked(itemService.listItems).mockResolvedValueOnce({
      success: true,
      message: "OK",
      code: 200,
      data: [],
    });

    const { wrapper } = createWrapper();
    renderHook(
      () =>
        useItemsInRange("2026-10-01", "2026-10-31", {
          kind: "event",
          status: "open",
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(itemService.listItems).toHaveBeenCalledWith({
        from: "2026-10-01T00:00:00+03:00",
        to: "2026-10-31T23:59:59.999+03:00",
        kind: "event",
        status: "open",
      }),
    );
  });

  it("is invalidated when useCompleteItem or useScheduleItem succeeds", async () => {
    const { queryClient, wrapper } = createWrapper();

    vi.mocked(itemService.listItems).mockResolvedValue({
      success: true,
      message: "OK",
      code: 200,
      data: [],
    });
    vi.mocked(itemService.completeItem).mockResolvedValue({
      success: true,
      message: "OK",
      code: 200,
      data: {} as any,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result: rangeResult } = renderHook(() => useItemsInRange("2026-10-01", "2026-10-31"), {
      wrapper,
    });
    await waitFor(() => expect(rangeResult.current.isSuccess).toBe(true));

    const { result: completeResult } = renderHook(() => useCompleteItem(), {
      wrapper,
    });
    completeResult.current.mutate({ id: "1" });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["items"],
      }),
    );
  });

  it("useUpdateItemFields updates partial body and invalidates items and today queries", async () => {
    const { queryClient, wrapper } = createWrapper();

    vi.mocked(itemService.updateItem).mockResolvedValue({
      success: true,
      message: "OK",
      code: 200,
      data: {} as any,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { useUpdateItemFields } = await import("./useItems");
    const { result } = renderHook(() => useUpdateItemFields(), { wrapper });

    result.current.mutate({
      id: "item-123",
      body: { dueAt: "2026-10-15T18:00:00+03:00" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(itemService.updateItem).toHaveBeenCalledWith("item-123", {
      dueAt: "2026-10-15T18:00:00+03:00",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["items"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item", "item-123"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["today"] });
  });
});
