import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import SportProgramDetail from "./SportProgramDetail";
import { CROSSFIT_A } from "./session-description.fixture";
import type { SportSessionResponse } from "@/types/sport/sport";

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

const { mutation, reorderMutate, programResult } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  reorderMutate: vi.fn(),
  programResult: {
    data: {
      id: "p1",
      name: "Program",
      description: "",
      programType: "WEEKLY",
      isActive: true,
      sessions: [] as SportSessionResponse[],
    },
    isLoading: false,
  },
}));

vi.mock("@/hooks/useSport", () => ({
  useActivateSportProgram: () => mutation(),
  useDeleteSportProgram: () => mutation(),
  useGetSportProgram: () => programResult,
  useCreateSportSession: () => mutation(),
  useUpdateSportSession: () => mutation(),
  useDeleteSportSession: () => mutation(),
  useReorderSportSessions: () => ({
    mutateAsync: vi.fn(),
    mutate: reorderMutate,
    isPending: false,
  }),
}));

function session(over: Partial<SportSessionResponse>): SportSessionResponse {
  return {
    id: "s",
    programId: "p1",
    activityType: "STRENGTH",
    location: "EV",
    name: "Session",
    plannedDayOfWeek: 0,
    plannedDuration: 30,
    difficulty: "MODERATE",
    description: "Easy run.",
    position: 0,
    createdAt: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const crossfit = session({
  id: "s1",
  name: "CrossFit A",
  plannedDayOfWeek: 2,
  position: 0,
  description: CROSSFIT_A,
});
const easyRun = session({ id: "s2", name: "Easy Run", plannedDayOfWeek: 0, position: 1 });

beforeEach(() => {
  reorderMutate.mockReset();
  programResult.data.sessions = [crossfit, easyRun];
});

afterEach(cleanup);

describe("SportProgramDetail sessions", () => {
  it("lists sessions by planned weekday first (Monday before Wednesday), not by position", () => {
    render(<SportProgramDetail programId="p1" onBack={() => {}} />);
    const monday = screen.getByText("Easy Run");
    const wednesday = screen.getByText("CrossFit A");
    expect(
      monday.compareDocumentPosition(wednesday) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the full warm-up text inside a collapsible <details>, not a clamped line", () => {
    render(<SportProgramDetail programId="p1" onBack={() => {}} />);
    const warmUpLine = screen.getByText("2 dk ip atlama ya da olduğun yerde koşu");
    expect(warmUpLine.closest("details")).not.toBeNull();
    expect(screen.getByText("Form bozulursa yavaşla.")).toBeInTheDocument();
    expect(document.querySelector("[class*='line-clamp']")).toBeNull();
  });

  it("keeps edit and delete reachable without hover (no bare opacity-0 class)", () => {
    render(<SportProgramDetail programId="p1" onBack={() => {}} />);
    const bareOpacityZero = /(^|\s)opacity-0(\s|$)/;
    const buttons = [
      ...screen.getAllByRole("button", { name: "common.edit" }),
      ...screen.getAllByRole("button", { name: "Delete session" }),
    ];
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button.className).not.toMatch(bareOpacityZero);
      expect(button.className).toMatch(/\b(h-9|h-10|min-h-9|min-h-10)\b/);
    }
  });

  it("moves a session up with a button and sends swapped positions to the reorder mutation", () => {
    // Same weekday so the move is visible; display order is by position: first then second.
    programResult.data.sessions = [
      session({ id: "a", name: "First", plannedDayOfWeek: 1, position: 0 }),
      session({ id: "b", name: "Second", plannedDayOfWeek: 1, position: 1 }),
    ];
    render(<SportProgramDetail programId="p1" onBack={() => {}} />);

    const moveUpButtons = screen.getAllByRole("button", { name: "Move up" });
    expect(moveUpButtons[0]).toBeDisabled();
    fireEvent.click(moveUpButtons[1]);

    expect(reorderMutate).toHaveBeenCalledTimes(1);
    expect(reorderMutate).toHaveBeenCalledWith({
      programId: "p1",
      items: [
        { id: "b", position: 0 },
        { id: "a", position: 1 },
      ],
    });
  });

  it("moves a session down and disables the last row's move-down button", () => {
    programResult.data.sessions = [
      session({ id: "a", name: "First", plannedDayOfWeek: 1, position: 0 }),
      session({ id: "b", name: "Second", plannedDayOfWeek: 1, position: 1 }),
    ];
    render(<SportProgramDetail programId="p1" onBack={() => {}} />);

    const moveDownButtons = screen.getAllByRole("button", { name: "Move down" });
    expect(moveDownButtons[1]).toBeDisabled();
    fireEvent.click(moveDownButtons[0]);

    expect(reorderMutate).toHaveBeenCalledWith({
      programId: "p1",
      items: [
        { id: "b", position: 0 },
        { id: "a", position: 1 },
      ],
    });
  });
});
