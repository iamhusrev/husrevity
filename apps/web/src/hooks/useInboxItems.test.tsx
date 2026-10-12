import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useInboxItems, useUpdateItemFields, useCompleteItem, useDeleteItem } from "./useItems";
import { itemService } from "@/services/item-service";

vi.mock("@/services/item-service", () => ({
  itemService: {
    listItems: vi.fn(),
    updateItem: vi.fn(),
    completeItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

describe("useInboxItems", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("queries the items endpoint with inbox=true and nothing else", async () => {
    vi.mocked(itemService.listItems).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: [{ id: "7", title: "Loose task" }] as never,
    });

    const { result } = renderHook(() => useInboxItems(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(itemService.listItems).toHaveBeenCalledWith({ inbox: true });
    expect(result.current.data).toEqual([{ id: "7", title: "Loose task" }]);
  });

  it("is refetched after update, complete and delete mutations", async () => {
    vi.mocked(itemService.listItems).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: [],
    });
    vi.mocked(itemService.updateItem).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: {} as never,
    });
    vi.mocked(itemService.completeItem).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: {} as never,
    });
    vi.mocked(itemService.deleteItem).mockResolvedValue({
      success: true,
      code: 204,
      message: "ok",
      data: undefined as never,
    });

    const inbox = renderHook(() => useInboxItems(), { wrapper });
    const update = renderHook(() => useUpdateItemFields(), { wrapper });
    const complete = renderHook(() => useCompleteItem(), { wrapper });
    const remove = renderHook(() => useDeleteItem(), { wrapper });
    await waitFor(() => expect(inbox.result.current.isSuccess).toBe(true));
    expect(itemService.listItems).toHaveBeenCalledTimes(1);

    update.result.current.mutate({ id: "7", body: { dueAt: "2026-10-14T00:00:00+03:00" } });
    await waitFor(() => expect(itemService.listItems).toHaveBeenCalledTimes(2));

    complete.result.current.mutate({ id: "7" });
    await waitFor(() => expect(itemService.listItems).toHaveBeenCalledTimes(3));

    remove.result.current.mutate("7");
    await waitFor(() => expect(itemService.listItems).toHaveBeenCalledTimes(4));
  });
});
