import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import en from "@/messages/en.json";
import SportStatsView from "./SportStatsView";

// Resolve keys against the real English bundle so the test proves the keys
// exist (a missing key would fall back to the raw key, e.g. "UNKNOWN").
function lookup(key: string): string | undefined {
  let node: unknown = en;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) =>
        lookup(key) ?? (typeof fallback === "string" ? fallback : key),
      i18n: { language: "en" },
    }),
  };
});

const { statsResult, refetch } = vi.hoisted(() => ({
  refetch: vi.fn(),
  statsResult: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/hooks/useSport", () => ({
  useSportStats: () => statsResult,
}));

beforeEach(() => {
  refetch.mockReset();
  statsResult.refetch = refetch;
  statsResult.isError = false;
  statsResult.isLoading = false;
  statsResult.data = undefined;
});

afterEach(cleanup);

describe("SportStatsView", () => {
  it("shows an inline error with Retry instead of the empty state when the query fails", () => {
    statsResult.isError = true;
    render(<SportStatsView />);

    expect(screen.getByText("Stats could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No data yet.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("labels free workouts as Free, never the raw UNKNOWN key", () => {
    statsResult.data = {
      totalCompleted: 4,
      avgDuration: 30,
      totalHours: 2,
      activityBreakdown: { UNKNOWN: 3, RUNNING: 1 },
      intensityDist: { "5": 4 },
      weeklyTrend: [],
    };
    render(<SportStatsView />);

    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN")).toBeNull();
  });
});
