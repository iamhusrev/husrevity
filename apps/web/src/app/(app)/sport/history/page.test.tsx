import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import SportHistoryPage from "./page";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
      i18n: { language: "en" },
    }),
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/common/PageBreadcrumb", () => ({
  default: ({ pageTitle }: { pageTitle: string }) => <h1>{pageTitle}</h1>,
}));

vi.mock("@/views/sport/SportStatsView", () => ({
  default: () => <div data-testid="stats-view" />,
}));

const { logsResult, refetch } = vi.hoisted(() => ({
  refetch: vi.fn(),
  logsResult: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/hooks/useSport", () => ({
  useSportLogs: () => logsResult,
  useSportPrograms: () => ({ data: [], isLoading: false }),
  useCreateSportLog: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useUpdateSportLog: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useDeleteSportLog: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  refetch.mockReset();
  logsResult.refetch = refetch;
  logsResult.isError = false;
  logsResult.isLoading = false;
  logsResult.data = [];
});

afterEach(cleanup);

describe("SportHistoryPage workout log", () => {
  it("shows the empty state when there are no logs", () => {
    render(<SportHistoryPage />);
    expect(screen.getByText("Bu ay için henüz antrenman kaydın yok.")).toBeInTheDocument();
  });

  it("shows an inline error with Retry instead of the empty state when the logs query fails", () => {
    logsResult.isError = true;
    render(<SportHistoryPage />);

    expect(screen.getByText("Antrenmanlar yüklenemedi.")).toBeInTheDocument();
    expect(screen.queryByText("Bu ay için henüz antrenman kaydın yok.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("SportHistoryPage tabs", () => {
  it("switches between the workout log and the stats view and links back to today", () => {
    render(<SportHistoryPage />);
    expect(screen.getByRole("link", { name: "Bugüne dön" })).toHaveAttribute("href", "/sport");
    expect(screen.getByRole("tab", { name: "Antrenman günlüğü" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByTestId("stats-view")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "İstatistikler" }));
    expect(screen.getByTestId("stats-view")).toBeInTheDocument();
    expect(screen.queryByText("Bu ay için henüz antrenman kaydın yok.")).toBeNull();
  });
});
