import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ClaudeActivityStrip from "./ClaudeActivityStrip";
import * as useChangeSetsModule from "@/hooks/useChangeSets";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: any) => {
        const map: Record<string, string> = {
          "claudeActivity.title": "Claude Activity",
          "claudeActivity.sourceClaude": "Claude",
          "claudeActivity.sources.mcp": "Claude",
          "claudeActivity.sources.web": "Web",
          "claudeActivity.sources.telegram": "Telegram",
          "claudeActivity.sources.slack": "Slack",
          "claudeActivity.sources.system": "System",
          "claudeActivity.undo": "Undo",
          "claudeActivity.undoing": "Undoing…",
          "claudeActivity.undoNone": "No changes could be undone",
          "claudeActivity.status.applied": "Applied",
          "claudeActivity.status.undone": "Undone",
          "claudeActivity.status.partially_undone": "Partially undone",
          "claudeActivity.reasons.not_owner": "Not owner",
          "claudeActivity.reasons.no_access": "No access",
          "claudeActivity.reasons.modified_after": "Modified after",
          "common.error": "Error",
        };
        if (key === "claudeActivity.undoSuccess") {
          return `${opts?.count ?? 0} change undone`;
        }
        if (key === "claudeActivity.undoConflictWarning") {
          return `${opts?.count ?? 0} item skipped`;
        }
        if (key === "claudeActivity.timeAgo.minutesAgo") {
          return `${opts?.count ?? 0}m ago`;
        }
        return map[key] ?? key;
      },
    }),
  };
});

describe("ClaudeActivityStrip", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const renderStrip = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ClaudeActivityStrip />
      </QueryClientProvider>,
    );

  it("renders nothing when change sets list is empty or request fails", () => {
    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any);

    const { container } = renderStrip();
    expect(container.firstChild).toBeNull();

    // On error
    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as any);

    const { container: errorContainer } = renderStrip();
    expect(errorContainer.firstChild).toBeNull();
  });

  it("renders up to 5 change sets with source badge, label, and status", () => {
    const mockSets = [
      {
        id: "cs-1",
        source: "mcp",
        label: "Reorganized afternoon blocks",
        status: "applied",
        createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        entryCount: 3,
      },
      {
        id: "cs-2",
        source: "web",
        label: "Manual edit",
        status: "undone",
        createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        entryCount: 1,
      },
      {
        id: "cs-3",
        source: "custom_cli",
        label: "CLI edit",
        status: "undone",
        createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
        entryCount: 1,
      },
    ];

    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: mockSets,
      isLoading: false,
      isError: false,
    } as any);
    vi.spyOn(useChangeSetsModule, "useUndoChangeSet").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    renderStrip();

    expect(screen.getByText("Reorganized afternoon blocks")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument(); // mcp mapped to Claude
    expect(screen.getByText("Web")).toBeInTheDocument(); // web mapped to Web
    expect(screen.getByText("custom_cli")).toBeInTheDocument(); // unknown source shows raw name
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getAllByText("Undone")).toHaveLength(2);
  });

  it("renders Undo button only for applied or partially_undone items", () => {
    const mockSets = [
      {
        id: "cs-1",
        source: "mcp",
        label: "Plan morning",
        status: "applied",
        createdAt: new Date().toISOString(),
        entryCount: 2,
      },
      {
        id: "cs-2",
        source: "mcp",
        label: "Plan evening",
        status: "undone",
        createdAt: new Date().toISOString(),
        entryCount: 1,
      },
    ];

    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: mockSets,
      isLoading: false,
      isError: false,
    } as any);
    vi.spyOn(useChangeSetsModule, "useUndoChangeSet").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    renderStrip();

    const undoButtons = screen.getAllByRole("button", { name: /Undo/i });
    expect(undoButtons).toHaveLength(1);
  });

  it("clicking Undo triggers the mutation with changeSet id", async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();

    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: [
        {
          id: "cs-99",
          source: "mcp",
          label: "Adjusted schedule",
          status: "applied",
          createdAt: new Date().toISOString(),
          entryCount: 2,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(useChangeSetsModule, "useUndoChangeSet").mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as any);

    renderStrip();

    const undoBtn = screen.getByRole("button", { name: /Undo/i });
    await user.click(undoBtn);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith("cs-99", expect.any(Object));
  });

  it("displays undo result and conflict warning when undo returns conflicts", async () => {
    const user = userEvent.setup();

    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: [
        {
          id: "cs-10",
          source: "mcp",
          label: "Batch plan",
          status: "applied",
          createdAt: new Date().toISOString(),
          entryCount: 3,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(useChangeSetsModule, "useUndoChangeSet").mockReturnValue({
      mutate: (_id: string, options: any) => {
        options?.onSuccess?.({
          data: {
            id: "cs-10",
            status: "partially_undone",
            undoneEntries: 2,
            conflicts: [{ targetType: "item", targetId: "item-1", reason: "not_owner" }],
          },
        });
      },
      isPending: false,
    } as any);

    renderStrip();

    await user.click(screen.getByRole("button", { name: /Undo/i }));

    expect(screen.getByText("2 change undone")).toBeInTheDocument();
    expect(screen.getByText(/1 item skipped/i)).toBeInTheDocument();
    expect(screen.getByText("Not owner")).toBeInTheDocument();
  });

  it("displays alert on undo error (e.g. 404 path)", async () => {
    const user = userEvent.setup();
    const { alertStore } = await import("@/stores/alert-store");
    const alertSpy = vi.spyOn(alertStore.getState(), "show");

    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: [
        {
          id: "cs-404",
          source: "mcp",
          label: "Missing change set",
          status: "applied",
          createdAt: new Date().toISOString(),
          entryCount: 1,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(useChangeSetsModule, "useUndoChangeSet").mockReturnValue({
      mutate: (_id: string, options: any) => {
        options?.onError?.(new Error("Change set not found"));
      },
      isPending: false,
    } as any);

    renderStrip();

    await user.click(screen.getByRole("button", { name: /Undo/i }));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: "Change set not found",
      }),
    );
  });

  it("displays warning-style message when all entries conflict (undoneEntries === 0)", async () => {
    const user = userEvent.setup();

    vi.spyOn(useChangeSetsModule, "useChangeSets").mockReturnValue({
      data: [
        {
          id: "cs-conflict",
          source: "mcp",
          label: "Conflicted batch",
          status: "applied",
          createdAt: new Date().toISOString(),
          entryCount: 2,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(useChangeSetsModule, "useUndoChangeSet").mockReturnValue({
      mutate: (_id: string, options: any) => {
        options?.onSuccess?.({
          data: {
            id: "cs-conflict",
            status: "partially_undone",
            undoneEntries: 0,
            conflicts: [
              { targetType: "item", targetId: "item-1", reason: "not_owner" },
              { targetType: "item", targetId: "item-2", reason: "modified_after" },
            ],
          },
        });
      },
      isPending: false,
    } as any);

    renderStrip();

    await user.click(screen.getByRole("button", { name: /Undo/i }));

    // Should show "No changes could be undone" rather than "0 change undone"
    expect(screen.getByText("No changes could be undone")).toBeInTheDocument();
    expect(screen.queryByText("0 change undone")).not.toBeInTheDocument();
    expect(screen.getByText(/2 item skipped/i)).toBeInTheDocument();
    expect(screen.getByText("Not owner")).toBeInTheDocument();
    expect(screen.getByText("Modified after")).toBeInTheDocument();
  });
});
