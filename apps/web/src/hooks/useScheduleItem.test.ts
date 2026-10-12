import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useScheduleItem } from "./useItems";
import { itemService } from "@/services/item-service";

vi.mock("@/services/item-service", () => ({
  itemService: {
    updateItem: vi.fn(),
  },
}));

describe("useScheduleItem", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("calls itemService.updateItem with scheduledAt and durationMin", async () => {
    const updateItemMock = vi.mocked(itemService.updateItem).mockResolvedValue({
      success: true,
      data: {} as any,
      code: 200,
      message: "",
    });

    const { result } = renderHook(() => useScheduleItem(), { wrapper });

    result.current.mutate({
      id: "item-123",
      scheduledAt: "2026-10-12T14:30:00+03:00",
      durationMin: 45,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateItemMock).toHaveBeenCalledWith("item-123", {
      scheduledAt: "2026-10-12T14:30:00+03:00",
      durationMin: 45,
    });
  });

  it("invalidates items, item detail, and today queries on success", async () => {
    vi.mocked(itemService.updateItem).mockResolvedValue({
      success: true,
      data: {} as any,
      code: 200,
      message: "",
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useScheduleItem(), { wrapper });

    result.current.mutate({
      id: "item-123",
      scheduledAt: "2026-10-12T14:30:00+03:00",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["items"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item", "item-123"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["today"] });
  });

  it("displays an alert in alertStore on mutation error", async () => {
    const error = new Error("Failed to schedule item");
    vi.mocked(itemService.updateItem).mockRejectedValueOnce(error);

    const { alertStore } = await import("@/stores/alert-store");
    const alertSpy = vi.spyOn(alertStore.getState(), "show");

    const { result } = renderHook(() => useScheduleItem(), { wrapper });

    result.current.mutate({
      id: "item-123",
      scheduledAt: "2026-10-12T14:30:00+03:00",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: "Failed to schedule item",
      }),
    );
  });
});
