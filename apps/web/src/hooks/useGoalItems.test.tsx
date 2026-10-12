import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDeleteItem, useGoalItems, useUpdateItemFields } from "./useItems";
import { itemService } from "@/services/item-service";

vi.mock("@/services/item-service", () => ({
  itemService: {
    listItems: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

describe("goal related item hooks", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  it("useGoalItems lists items by goalId under ['items','goal',id]", async () => {
    vi.mocked(itemService.listItems).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: [],
    });
    const { result } = renderHook(() => useGoalItems("42"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(itemService.listItems).toHaveBeenCalledWith({ goalId: "42" });
    expect(queryClient.getQueryCache().getAll()[0].queryKey).toEqual(["items", "goal", "42"]);
  });

  it("useGoalItems is disabled without a goal id", () => {
    renderHook(() => useGoalItems(""), { wrapper });
    expect(itemService.listItems).not.toHaveBeenCalled();
  });

  it("attaching a goal refreshes goal progress", async () => {
    vi.mocked(itemService.updateItem).mockResolvedValue({ data: {} } as never);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateItemFields(), { wrapper });
    result.current.mutate({ id: "1", body: { goalId: "9" } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["goals"] });
  });

  it("deleting an item refreshes goal progress", async () => {
    vi.mocked(itemService.deleteItem).mockResolvedValue({} as never);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteItem(), { wrapper });
    result.current.mutate("1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["goals"] });
  });
});
