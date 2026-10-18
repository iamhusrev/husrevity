import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { AxiosError } from "axios";
import TrashPage from "./TrashPage";
import { alertStore } from "@/stores/alert-store";
import type { TrashEntry } from "@/types/trash/trash";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Returns the English fallback with `{{x}}` filled from the options, or the key when the
  // call has no fallback string, so assertions can read natural text.
  const t = (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
    const vars = (typeof fallback === "object" && fallback ? fallback : options) as
      | Record<string, unknown>
      | undefined;
    const text = typeof fallback === "string" ? fallback : key;
    return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars?.[name] ?? ""));
  };
  return { ...actual, useTranslation: () => ({ t, i18n: { language: "en" } }) };
});

vi.mock("@/components/common/PageBreadcrumb", () => ({
  default: ({ pageTitle }: { pageTitle: string }) => <h1>{pageTitle}</h1>,
}));

vi.mock("@/utils/i18n-date", () => ({
  getDateLocale: () => "en-US",
  formatDateTime: (value: string) => `exact:${value}`,
}));

const { useTrashMock, restoreMutate, restoreState, trashResult } = vi.hoisted(() => ({
  useTrashMock: vi.fn(),
  restoreMutate: vi.fn(),
  restoreState: { isPending: false, variables: undefined as TrashEntry | undefined },
  trashResult: {
    data: undefined as TrashEntry[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
}));

vi.mock("@/hooks/useTrash", () => ({
  useTrash: (kinds: string[]) => {
    useTrashMock(kinds);
    return trashResult;
  },
  useRestoreDeleted: () => ({
    mutate: restoreMutate,
    isPending: restoreState.isPending,
    variables: restoreState.variables,
  }),
}));

const task: TrashEntry = {
  kind: "task",
  id: "12",
  title: "Write spec",
  deletedAt: "2026-10-15T09:00:00.000Z",
  projectId: "7",
  projectName: "Apollo",
  restoreTool: "restore_task",
  restorePath: "/tasks/12/restore",
};
const project: TrashEntry = {
  kind: "project",
  id: "7",
  title: "Apollo",
  deletedAt: "2026-10-17T11:00:00.000Z",
  projectId: null,
  projectName: null,
  restoreTool: "restore_project",
  restorePath: "/projects/7/restore",
};
const goal: TrashEntry = {
  kind: "goal",
  id: "3",
  title: "Run a marathon",
  deletedAt: "2026-10-18T11:40:00.000Z",
  projectId: null,
  projectName: null,
  restoreTool: "restore_goal",
  restorePath: "/goals/3/restore",
};

// Titles render in a <p>; the project name of a task is a <span>, so "Apollo" stays unambiguous.
const rowOf = (title: string) =>
  screen.getByText(title, { selector: "p" }).closest("li") as HTMLElement;

const showAlert = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T12:00:00Z") });
  useTrashMock.mockReset();
  restoreMutate.mockReset();
  restoreState.isPending = false;
  restoreState.variables = undefined;
  trashResult.data = [task, project, goal];
  trashResult.isLoading = false;
  trashResult.isError = false;
  trashResult.hasNextPage = false;
  trashResult.isFetchingNextPage = false;
  trashResult.refetch.mockReset();
  trashResult.fetchNextPage.mockReset();
  showAlert.mockReset();
  alertStore.setState({ show: showAlert });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TrashPage rows", () => {
  it("renders a row per entry with its kind badge, title and project name when present", () => {
    render(<TrashPage />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const taskRow = rowOf("Write spec");
    expect(within(taskRow).getByText("Task")).toBeTruthy();
    expect(within(taskRow).getByText("Apollo")).toBeTruthy();

    const goalRow = rowOf("Run a marathon");
    expect(within(goalRow).getByText("Goal")).toBeTruthy();
    // No project line for a non-task kind.
    expect(within(goalRow).queryByText(/Apollo/)).toBeNull();
  });

  it("shows how long ago each entry was deleted and exposes the exact date", () => {
    render(<TrashPage />);
    const taskRow = rowOf("Write spec");
    expect(within(taskRow).getByText("Deleted 3 days ago")).toBeTruthy();
    const time = within(taskRow).getByText("Deleted 3 days ago").closest("time");
    expect(time?.getAttribute("dateTime")).toBe("2026-10-15T09:00:00.000Z");
    expect(time?.getAttribute("title")).toBe("exact:2026-10-15T09:00:00.000Z");
    expect(within(rowOf("Apollo")).getByText("Deleted yesterday")).toBeTruthy();
  });

  it("explains that deleted items are kept until restored", () => {
    render(<TrashPage />);
    expect(screen.getByText(/kept here until you restore them/)).toBeTruthy();
  });
});

describe("TrashPage states", () => {
  it("shows a friendly empty state when nothing is deleted", () => {
    trashResult.data = [];
    render(<TrashPage />);
    expect(screen.getByText("Nothing deleted")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows skeletons while loading, never the empty state", () => {
    trashResult.data = undefined;
    trashResult.isLoading = true;
    render(<TrashPage />);
    expect(screen.getAllByTestId("trash-skeleton").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("trash-skeleton")[0].className).toContain(
      "motion-safe:animate-pulse",
    );
    expect(screen.queryByText("Nothing deleted")).toBeNull();
  });

  it("shows an inline error row with Retry and no empty state on error", () => {
    trashResult.data = undefined;
    trashResult.isError = true;
    render(<TrashPage />);
    expect(screen.getByText("Deleted items could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("Nothing deleted")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(trashResult.refetch).toHaveBeenCalledTimes(1);
  });
});

describe("TrashPage kind filter", () => {
  it("offers All plus the six kinds as toggle buttons with All pressed by default", () => {
    render(<TrashPage />);
    const group = screen.getByRole("group", { name: "Filter by kind" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual([
      "All",
      "Task",
      "Project",
      "Reminder",
      "Reminder list",
      "Calendar event",
      "Goal",
    ]);
    expect(chips[0].getAttribute("aria-pressed")).toBe("true");
    expect(chips.slice(1).every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(useTrashMock).toHaveBeenLastCalledWith([]);
  });

  it("selecting a kind presses only that chip and queries that kind; All clears it", () => {
    render(<TrashPage />);
    const group = screen.getByRole("group", { name: "Filter by kind" });
    fireEvent.click(within(group).getByRole("button", { name: "Project" }));
    expect(
      within(group).getByRole("button", { name: "Project" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(group).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(useTrashMock).toHaveBeenLastCalledWith(["project"]);

    fireEvent.click(within(group).getByRole("button", { name: "All" }));
    expect(useTrashMock).toHaveBeenLastCalledWith([]);
  });
});

describe("TrashPage restore", () => {
  it("restores the row's own entry, hides it and shows a success alert", async () => {
    restoreMutate.mockImplementation((_entry: TrashEntry, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    render(<TrashPage />);
    const button = within(rowOf("Write spec")).getByRole("button", { name: "Restore Write spec" });
    // Comfortable touch target.
    expect(button.className).toMatch(/\bh-10\b|min-h-\[?4/);
    fireEvent.click(button);

    expect(restoreMutate).toHaveBeenCalledTimes(1);
    expect(restoreMutate.mock.calls[0][0]).toEqual(task);
    await waitFor(() => expect(screen.queryByText("Write spec")).toBeNull());
    expect(rowOf("Apollo")).toBeTruthy();
    expect(rowOf("Run a marathon")).toBeTruthy();
    expect(showAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Restored", message: "Write spec" }),
    );
  });

  it("disables the buttons and says Restoring… on the pending row", () => {
    restoreState.isPending = true;
    restoreState.variables = project;
    render(<TrashPage />);
    const pending = within(rowOf("Apollo")).getByRole("button", { name: "Restoring Apollo…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    const other = within(rowOf("Write spec")).getByRole("button", { name: "Restore Write spec" });
    expect((other as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the row and shows the server message when the restore fails (409)", async () => {
    const conflict = new AxiosError(
      "Request failed with status code 409",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 409,
        statusText: "Conflict",
        headers: {},
        config: {} as never,
        data: { success: false, message: "A live project already uses the code APOLLO" },
      },
    );
    restoreMutate.mockImplementation(
      (_entry: TrashEntry, options: { onError: (err: unknown) => void }) =>
        options.onError(conflict),
    );
    render(<TrashPage />);
    fireEvent.click(within(rowOf("Apollo")).getByRole("button", { name: "Restore Apollo" }));

    await waitFor(() =>
      expect(showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "A live project already uses the code APOLLO",
        }),
      ),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(within(rowOf("Apollo")).getByRole("button", { name: "Restore Apollo" })).toBeTruthy();
  });
});

describe("TrashPage accessibility and stale rows", () => {
  it("gives every restore button its own accessible name", () => {
    render(<TrashPage />);
    const names = screen
      .getAllByRole("button", { name: /^Restore / })
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Restore Write spec", "Restore Apollo", "Restore Run a marathon"]);
  });

  it("announces the load error as an alert", () => {
    trashResult.isError = true;
    render(<TrashPage />);
    expect(screen.getByRole("alert").textContent).toContain("Deleted items could not be loaded.");
  });

  it("announces the loading state to assistive tech", () => {
    trashResult.isLoading = true;
    render(<TrashPage />);
    expect(screen.getByRole("status").textContent).toContain("Loading deleted items…");
  });

  it("refetches the list when the restore finds the entry already gone (404)", async () => {
    const gone = new AxiosError(
      "Request failed with status code 404",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: {} as never,
        data: { success: false, message: "Task not found" },
      },
    );
    restoreMutate.mockImplementation(
      (_entry: TrashEntry, options: { onError: (err: unknown) => void }) => options.onError(gone),
    );
    render(<TrashPage />);
    fireEvent.click(
      within(rowOf("Write spec")).getByRole("button", { name: "Restore Write spec" }),
    );

    await waitFor(() => expect(trashResult.refetch).toHaveBeenCalledTimes(1));
  });

  it("does not refetch on other restore errors such as a 409 conflict", async () => {
    const conflict = new AxiosError(
      "Request failed with status code 409",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 409,
        statusText: "Conflict",
        headers: {},
        config: {} as never,
        data: { success: false, message: "clash" },
      },
    );
    restoreMutate.mockImplementation(
      (_entry: TrashEntry, options: { onError: (err: unknown) => void }) =>
        options.onError(conflict),
    );
    render(<TrashPage />);
    fireEvent.click(within(rowOf("Apollo")).getByRole("button", { name: "Restore Apollo" }));

    await waitFor(() => expect(showAlert).toHaveBeenCalled());
    expect(trashResult.refetch).not.toHaveBeenCalled();
  });
});

describe("TrashPage load more", () => {
  it("hides Load more when there is no cursor", () => {
    render(<TrashPage />);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows Load more with a cursor and fetches the next page", () => {
    trashResult.hasNextPage = true;
    render(<TrashPage />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(trashResult.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("disables Load more while the next page is loading", () => {
    trashResult.hasNextPage = true;
    trashResult.isFetchingNextPage = true;
    render(<TrashPage />);
    const button = screen.getByRole("button", { name: "Loading…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
