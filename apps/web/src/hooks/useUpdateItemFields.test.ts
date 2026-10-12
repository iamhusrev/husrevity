import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useUpdateItemFields } from "./useItems";
import { itemService } from "@/services/item-service";
import { alertStore } from "@/stores/alert-store";

vi.mock("@/services/item-service", () => ({
  itemService: {
    updateItem: vi.fn(),
  },
}));

describe("useUpdateItemFields", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("shows exactly one error alert when the update fails", async () => {
    vi.mocked(itemService.updateItem).mockRejectedValueOnce(new Error("Update failed"));
    const alertSpy = vi.spyOn(alertStore.getState(), "show");

    const { result } = renderHook(() => useUpdateItemFields(), { wrapper });
    result.current.mutate({ id: "item-1", body: { dueAt: "2026-10-15T14:00:00+03:00" } });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", message: "Update failed" }),
    );
  });
});
