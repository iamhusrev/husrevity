import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import DashboardPage from "./page";
import * as useTodayModule from "@/hooks/useToday";
import * as useItemsModule from "@/hooks/useItems";
import { alertStore } from "@/stores/alert-store";

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { firstName: "Husrev" } }),
}));

vi.mock("@/components/common/PageBreadcrumb", () => ({
  default: () => <div data-testid="breadcrumb" />,
}));

vi.mock("@/components/dashboard/TodaySuggestionsCard", () => ({
  default: () => <div data-testid="today-suggestions" />,
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: string | any) => {
        const map: Record<string, string> = {
          "today.dueToday.title": "Due Today",
          "today.timeline.title": "Timeline",
          "common.done": "Done",
          "common.error": "Error",
        };
        if (map[key]) return map[key];
        if (typeof fallback === "string") return fallback;
        return key;
      },
    }),
  };
});

const mockTodayData = {
  date: "2026-10-12",
  currentBlock: null,
  timeline: [
    {
      itemId: "evt-1",
      title: "Team Standup",
      kind: "event",
      scheduledAt: "2026-10-12T10:00:00Z",
      durationMin: 30,
    },
  ],
  dueToday: [
    {
      itemId: "item-task-1",
      title: "Pay monthly bill",
      kind: "task",
      dueAt: "2026-10-12T18:00:00Z",
    },
  ],
};

describe("DashboardPage - due today items", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    vi.clearAllMocks();
    alertStore.getState().close();
    vi.spyOn(useTodayModule, "useToday").mockReturnValue({
      data: mockTodayData,
      isLoading: false,
    } as any);
  });

  const renderDashboard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>,
    );

  it("renders an accessible complete button for each due-today row but not for timeline rows", () => {
    renderDashboard();

    // Timeline row has no complete button
    expect(screen.queryByRole("button", { name: /Done.*Team Standup/i })).not.toBeInTheDocument();

    // Due-today row has a complete button with accessible name
    const completeButton = screen.getByRole("button", { name: /Done.*Pay monthly bill/i });
    expect(completeButton).toBeInTheDocument();
  });

  it("clicking the complete button calls completeItem mutation with item id", async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as any);

    renderDashboard();

    const completeButton = screen.getByRole("button", { name: /Done.*Pay monthly bill/i });
    await user.click(completeButton);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-task-1" }),
      expect.any(Object),
    );
  });

  it("sends today's date as occursOn so recurring items can be completed", async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as any);

    renderDashboard();

    await user.click(screen.getByRole("button", { name: /Done.*Pay monthly bill/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      { id: "item-task-1", occursOn: "2026-10-12" },
      expect.any(Object),
    );
  });

  it("disables the button while completion mutation is pending", () => {
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      variables: { id: "item-task-1" },
    } as any);

    renderDashboard();

    const completeButton = screen.getByRole("button", { name: /Done.*Pay monthly bill/i });
    expect(completeButton).toBeDisabled();
  });

  it("displays an alert on mutation error", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(alertStore.getState(), "show");

    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: (_vars: any, options: any) => {
        options?.onError?.(new Error("Network failed"));
      },
      isPending: false,
    } as any);

    renderDashboard();

    const completeButton = screen.getByRole("button", { name: /Done.*Pay monthly bill/i });
    await user.click(completeButton);

    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
      }),
    );
  });
});
