import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useCreateTask,
  useDeleteProject,
  useDeleteTask,
  useRestoreProject,
  useRestoreTask,
  useUpdateProject,
  useUpdateTask,
} from "./useProjects";
import { projectService } from "@/services/project-service";

vi.mock("@/services/project-service", () => ({
  projectService: {
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    restoreProject: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    restoreTask: vi.fn(),
  },
}));

describe("project mutations refresh goal progress", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.clearAllMocks();
    for (const fn of Object.values(projectService)) {
      (fn as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });
    }
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  async function expectGoalsInvalidated(run: () => void, isSuccess: () => boolean) {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    run();
    await waitFor(() => expect(isSuccess()).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["goals"] });
  }

  it("useUpdateProject invalidates goals (goalId may have changed)", async () => {
    const { result } = renderHook(() => useUpdateProject(), { wrapper });
    await expectGoalsInvalidated(
      () => result.current.mutate({ id: 1, body: { goalId: "9" } as never }),
      () => result.current.isSuccess,
    );
  });

  it("useDeleteProject invalidates goals", async () => {
    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    await expectGoalsInvalidated(
      () => result.current.mutate(1),
      () => result.current.isSuccess,
    );
  });

  it("useRestoreProject invalidates goals", async () => {
    const { result } = renderHook(() => useRestoreProject(), { wrapper });
    await expectGoalsInvalidated(
      () => result.current.mutate(1),
      () => result.current.isSuccess,
    );
  });

  it("task mutations invalidate goals (tasks are mirrored into items)", async () => {
    const create = renderHook(() => useCreateTask(), { wrapper });
    await expectGoalsInvalidated(
      () => create.result.current.mutate({ projectId: 1, body: {} as never }),
      () => create.result.current.isSuccess,
    );
    const update = renderHook(() => useUpdateTask(), { wrapper });
    await expectGoalsInvalidated(
      () => update.result.current.mutate({ id: 2, projectId: 1, body: {} as never }),
      () => update.result.current.isSuccess,
    );
    const del = renderHook(() => useDeleteTask(), { wrapper });
    await expectGoalsInvalidated(
      () => del.result.current.mutate({ id: 2, projectId: 1 }),
      () => del.result.current.isSuccess,
    );
    const restore = renderHook(() => useRestoreTask(), { wrapper });
    await expectGoalsInvalidated(
      () => restore.result.current.mutate({ id: 2, projectId: 1 }),
      () => restore.result.current.isSuccess,
    );
  });
});
