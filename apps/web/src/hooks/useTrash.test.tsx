import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useRestoreDeleted, useTrash } from "./useTrash";
import { trashService } from "@/services/trash-service";
import type { TrashEntry, TrashListResponse } from "@/types/trash/trash";

vi.mock("@/services/trash-service", () => ({
  trashService: { listDeleted: vi.fn(), restore: vi.fn() },
}));

const ok = <T,>(data: T) => ({ success: true, code: 200, message: "ok", data });

const entry = (overrides: Partial<TrashEntry>): TrashEntry => ({
  kind: "task",
  id: "12",
  title: "Write spec",
  deletedAt: "2026-03-01T10:00:00.000Z",
  projectId: null,
  projectName: null,
  restoreTool: "restore_task",
  restorePath: "/tasks/12/restore",
  ...overrides,
});

const page = (items: TrashEntry[], nextCursor: string | null): TrashListResponse => ({
  items,
  nextCursor,
});

describe("trash hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  describe("useTrash", () => {
    it("requests the first page without a cursor and flattens the entries", async () => {
      vi.mocked(trashService.listDeleted).mockResolvedValue(
        ok(page([entry({ id: "1" }), entry({ id: "2" })], null)),
      );
      const { result } = renderHook(() => useTrash([]), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(trashService.listDeleted).toHaveBeenCalledWith({ kinds: [], limit: 20 });
      expect(result.current.data?.map((e) => e.id)).toEqual(["1", "2"]);
      expect(result.current.hasNextPage).toBe(false);
    });

    it("keys the query by the selected kinds and sends them", async () => {
      vi.mocked(trashService.listDeleted).mockResolvedValue(ok(page([], null)));
      const { result } = renderHook(() => useTrash(["project", "goal"]), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(trashService.listDeleted).toHaveBeenCalledWith({
        kinds: ["project", "goal"],
        limit: 20,
      });
      expect(queryClient.getQueryData(["trash", ["project", "goal"]])).toBeDefined();
    });

    it("pages through nextCursor and stops when it is null", async () => {
      vi.mocked(trashService.listDeleted)
        .mockResolvedValueOnce(ok(page([entry({ id: "1" })], "cursor-2")))
        .mockResolvedValueOnce(ok(page([entry({ id: "2" })], null)));
      const { result } = renderHook(() => useTrash([]), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.hasNextPage).toBe(true);

      await result.current.fetchNextPage();
      await waitFor(() => expect(result.current.data?.map((e) => e.id)).toEqual(["1", "2"]));
      expect(trashService.listDeleted).toHaveBeenLastCalledWith({
        kinds: [],
        limit: 20,
        cursor: "cursor-2",
      });
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe("useRestoreDeleted", () => {
    it("PATCHes the entry's restorePath", async () => {
      vi.mocked(trashService.restore).mockResolvedValue(ok({}));
      const { result } = renderHook(() => useRestoreDeleted(), { wrapper });
      result.current.mutate(entry({ restorePath: "/projects/7/restore", kind: "project" }));
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(trashService.restore).toHaveBeenCalledWith("/projects/7/restore");
    });

    it.each([
      ["task", [["project-tasks"], ["task"], ["items"], ["today"], ["goals"]]],
      ["project", [["projects"], ["project-tasks"], ["goals"]]],
      ["reminder", [["reminders"], ["reminder-lists"]]],
      ["reminder_list", [["reminder-lists"], ["reminders"]]],
      ["calendar_event", [["calendar-events"], ["calendar-event"]]],
      ["goal", [["goals"], ["items"]]],
    ] as const)(
      "invalidates the trash list and the %s domain caches on success",
      async (kind, domainKeys) => {
        vi.mocked(trashService.restore).mockResolvedValue(ok({}));
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
        const { result } = renderHook(() => useRestoreDeleted(), { wrapper });
        result.current.mutate(entry({ kind }));
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["trash"] }));
        for (const key of domainKeys) {
          expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: key });
        }
      },
    );

    it("does not invalidate anything when the restore fails", async () => {
      vi.mocked(trashService.restore).mockRejectedValue(new Error("409"));
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useRestoreDeleted(), { wrapper });
      result.current.mutate(entry({}));
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
