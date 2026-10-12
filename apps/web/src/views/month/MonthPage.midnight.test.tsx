import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import MonthPage from "./MonthPage";
import * as useItemsModule from "@/hooks/useItems";

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

describe("MonthPage across Istanbul midnight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    for (const name of ["useCompleteItem", "useCreateItem", "useDeleteItem"] as const) {
      vi.spyOn(useItemsModule, name).mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as never);
    }
    vi.spyOn(useItemsModule, "useUpdateItemFields").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useScheduleItem").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves the 'today' highlight to the new Istanbul day without a remount", () => {
    // 23:59:30 Istanbul on Wed 2026-10-14.
    vi.setSystemTime(new Date("2026-10-14T20:59:30Z"));
    render(<MonthPage initialYear={2026} initialMonth={10} />);
    expect(screen.getByTestId("cell-2026-10-14")).toHaveAttribute("data-today", "true");

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(screen.getByTestId("cell-2026-10-15")).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("cell-2026-10-14")).not.toHaveAttribute("data-today");
  });

  it("rolls the highlight into the next month's grid across a month boundary", () => {
    // 23:59:30 Istanbul on 2026-10-31; the October grid shows Nov 1 as a trailing day.
    vi.setSystemTime(new Date("2026-10-31T20:59:30Z"));
    render(<MonthPage initialYear={2026} initialMonth={10} />);
    expect(screen.getByTestId("cell-2026-10-31")).toHaveAttribute("data-today", "true");

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(screen.getByTestId("cell-2026-10-31")).not.toHaveAttribute("data-today");
    expect(screen.getByTestId("cell-2026-11-01")).toHaveAttribute("data-today", "true");
  });
});
