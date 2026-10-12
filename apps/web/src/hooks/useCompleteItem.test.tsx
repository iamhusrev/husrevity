import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCompleteItem } from "./useItems";
import { itemService } from "@/services/item-service";

vi.mock("@/services/item-service", () => ({
  itemService: {
    completeItem: vi.fn(),
  },
}));

describe("useCompleteItem", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("calls itemService.completeItem with id and occursOn, and invalidates 'today' query", async () => {
    vi.mocked(itemService.completeItem).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: { id: "item-123", status: "done" } as any,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCompleteItem(), { wrapper });

    result.current.mutate({ id: "item-123", occursOn: "2026-10-12" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(itemService.completeItem).toHaveBeenCalledWith("item-123", { occursOn: "2026-10-12" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["today"] });
  });

  it("calls itemService.completeItem without occursOn when not provided", async () => {
    vi.mocked(itemService.completeItem).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: { id: "item-456", status: "done" } as any,
    });

    const { result } = renderHook(() => useCompleteItem(), { wrapper });

    result.current.mutate({ id: "item-456" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(itemService.completeItem).toHaveBeenCalledWith("item-456", {});
  });
});

describe("useCompleteItem goal progress refresh", () => {
  it("invalidates the goals cache so progress bars refresh", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.mocked(itemService.completeItem).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: { id: "1", status: "done" } as never,
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCompleteItem(), { wrapper });
    result.current.mutate({ id: "1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["goals"] });
  });
});
