import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import WeekPage from "./WeekPage";
import * as useItemsModule from "@/hooks/useItems";
import { ItemResponse } from "@/types/item/item";

vi.mock("react-dnd", () => ({
  DndProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDrop: () => [{ isOver: false, canDrop: false }, () => undefined],
  useDrag: () => [{ isDragging: false }, () => undefined],
}));
vi.mock("react-dnd-html5-backend", () => ({ HTML5Backend: {} }));
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: "tr" },
    }),
  };
});

const slippedCandidate: ItemResponse = {
  id: "t1",
  kind: "task",
  title: "Call",
  notes: null,
  context: null,
  projectId: null,
  blockId: null,
  scheduledAt: "2026-10-14T10:00:00+03:00",
  durationMin: null,
  dueAt: null,
  notifyMinutesBefore: null,
  rrule: null,
  status: "open",
  completedAt: null,
  payload: {},
  source: "web",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

describe("WeekPage across Istanbul midnight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 23:59:30 Istanbul on Wed 2026-10-14.
    vi.setSystemTime(new Date("2026-10-14T20:59:30Z"));
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [slippedCandidate],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useScheduleItem").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useUpdateItemFields").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves 'today' and the slipped count to the new Istanbul day without a remount", () => {
    render(<WeekPage />);
    expect(screen.getByTestId("week-day-2026-10-14")).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("week-summary-slipped")).toHaveTextContent("0");

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(screen.getByTestId("week-day-2026-10-15")).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("week-day-2026-10-14")).not.toHaveAttribute("data-today");
    expect(screen.getByTestId("week-summary-slipped")).toHaveTextContent("1");
  });
});
