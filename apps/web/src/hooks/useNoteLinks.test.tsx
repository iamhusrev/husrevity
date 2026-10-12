import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAddNoteLink, useNoteLinks, useNotesLinkedTo, useRemoveNoteLink } from "./useNoteLinks";
import { noteLinkService } from "@/services/note-link-service";
import { alertStore } from "@/stores/alert-store";

vi.mock("@/services/note-link-service", () => ({
  noteLinkService: {
    listForNote: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    notesLinkedTo: vi.fn(),
  },
}));

describe("note link hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("useNoteLinks loads the links of a note and is disabled for an empty id", async () => {
    vi.mocked(noteLinkService.listForNote).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: [],
    });
    const { result } = renderHook(() => useNoteLinks("5"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteLinkService.listForNote).toHaveBeenCalledWith("5");

    vi.clearAllMocks();
    renderHook(() => useNoteLinks(""), { wrapper });
    expect(noteLinkService.listForNote).not.toHaveBeenCalled();
  });

  it("useNotesLinkedTo queries by target", async () => {
    vi.mocked(noteLinkService.notesLinkedTo).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: [],
    });
    const { result } = renderHook(() => useNotesLinkedTo("goal", "9"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteLinkService.notesLinkedTo).toHaveBeenCalledWith("goal", "9");
  });

  it("add calls the service and invalidates note-links", async () => {
    vi.mocked(noteLinkService.add).mockResolvedValue({ data: {} } as never);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddNoteLink("5"), { wrapper });
    result.current.mutate({ targetType: "project", targetId: "2" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteLinkService.add).toHaveBeenCalledWith("5", { targetType: "project", targetId: "2" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["note-links"] });
  });

  it("remove calls the service and invalidates note-links", async () => {
    vi.mocked(noteLinkService.remove).mockResolvedValue({} as never);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRemoveNoteLink("5"), { wrapper });
    result.current.mutate("77");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteLinkService.remove).toHaveBeenCalledWith("5", "77");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["note-links"] });
  });

  it("remove raises exactly one error alert", async () => {
    vi.mocked(noteLinkService.remove).mockRejectedValueOnce(new Error("Nope"));
    const alertSpy = vi.spyOn(alertStore.getState(), "show");
    const { result } = renderHook(() => useRemoveNoteLink("5"), { wrapper });
    result.current.mutate("77");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("add with inlineErrors raises no alert", async () => {
    vi.mocked(noteLinkService.add).mockRejectedValueOnce(new Error("Cap"));
    const alertSpy = vi.spyOn(alertStore.getState(), "show");
    const { result } = renderHook(() => useAddNoteLink("5", { inlineErrors: true }), { wrapper });
    result.current.mutate({ targetType: "goal", targetId: "1" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
