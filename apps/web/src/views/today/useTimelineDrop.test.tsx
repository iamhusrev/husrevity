import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDrop } from "react-dnd";
import type { DropTargetHookSpec, DropTargetMonitor, XYCoord } from "react-dnd";
import { useTimelineDrop } from "./TodayBoard";
import type { DragPayload, UseTimelineDropParams } from "./TodayBoard";

vi.mock("react-dnd");

type DropSpec = DropTargetHookSpec<DragPayload, void, { isOver: boolean }>;

const GRID_TOP = 100;

const baseItem: DragPayload = {
  id: "task-1",
  title: "Pay monthly bill",
  durationMin: 45,
  isRecurring: false,
};

function fakeMonitor(offset: XYCoord | null): DropTargetMonitor<DragPayload, void> {
  return {
    getClientOffset: () => offset,
    isOver: () => false,
  } as unknown as DropTargetMonitor<DragPayload, void>;
}

function fakeGrid(): HTMLDivElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ top: GRID_TOP }) as DOMRect;
  return el;
}

describe("useTimelineDrop (real useDrop spec, react-dnd mocked)", () => {
  const specs: DropSpec[] = [];
  const depsHistory: unknown[][] = [];
  const dropConnector = vi.fn();
  let onSchedule: UseTimelineDropParams["onSchedule"];

  const latestSpec = (): DropSpec => specs[specs.length - 1];
  const latestDeps = (): unknown[] => depsHistory[depsHistory.length - 1];

  const setup = (overrides: Partial<UseTimelineDropParams> = {}) => {
    const initialProps: UseTimelineDropParams = {
      todayDate: "2026-10-12",
      isPending: false,
      onSchedule,
      ...overrides,
    };
    const rendered = renderHook((props: UseTimelineDropParams) => useTimelineDrop(props), {
      initialProps,
    });
    act(() => {
      rendered.result.current.setGridRef(fakeGrid());
    });
    return { ...rendered, initialProps };
  };

  beforeEach(() => {
    specs.length = 0;
    depsHistory.length = 0;
    dropConnector.mockReset();
    onSchedule = vi.fn();

    vi.mocked(useDrop).mockImplementation(((
      specArg: DropSpec | (() => DropSpec),
      deps?: unknown[],
    ) => {
      specs.push(typeof specArg === "function" ? specArg() : specArg);
      depsHistory.push(deps ?? []);
      return [{ isOver: false }, dropConnector];
    }) as unknown as typeof useDrop);
  });

  it("registers the timeline grid as the drop target connector", () => {
    const { result } = setup();
    const el = fakeGrid();
    act(() => {
      result.current.setGridRef(el);
    });
    expect(dropConnector).toHaveBeenLastCalledWith(el);
  });

  describe("canDrop", () => {
    it("is true for a plain item when the date is loaded and nothing is pending", () => {
      setup();
      expect(latestSpec().canDrop?.(baseItem, fakeMonitor(null))).toBe(true);
    });

    it("is false for a recurring item", () => {
      setup();
      const recurring = { ...baseItem, isRecurring: true };
      expect(latestSpec().canDrop?.(recurring, fakeMonitor(null))).toBe(false);
    });

    it("is false when todayDate is not loaded", () => {
      setup({ todayDate: undefined });
      expect(latestSpec().canDrop?.(baseItem, fakeMonitor(null))).toBe(false);
    });

    it("is false while a schedule mutation is pending", () => {
      setup({ isPending: true });
      expect(latestSpec().canDrop?.(baseItem, fakeMonitor(null))).toBe(false);
    });
  });

  describe("drop", () => {
    it("ignores a drop without a client offset", () => {
      setup();
      act(() => {
        latestSpec().drop?.(baseItem, fakeMonitor(null));
      });
      expect(onSchedule).not.toHaveBeenCalled();
    });

    it("ignores a drop when todayDate is not loaded", () => {
      setup({ todayDate: undefined });
      act(() => {
        latestSpec().drop?.(baseItem, fakeMonitor({ x: 0, y: GRID_TOP + 600 }));
      });
      expect(onSchedule).not.toHaveBeenCalled();
    });

    it("snaps to 15 minutes and schedules the Istanbul ISO instant with the item duration", () => {
      setup();
      // 607 minutes below the grid top -> 10:07 -> snaps to 10:00
      act(() => {
        latestSpec().drop?.(baseItem, fakeMonitor({ x: 0, y: GRID_TOP + 607 }));
      });
      expect(onSchedule).toHaveBeenCalledTimes(1);
      expect(onSchedule).toHaveBeenCalledWith(
        { id: "task-1", scheduledAt: "2026-10-12T10:00:00+03:00", durationMin: 45 },
        expect.any(Object),
      );
    });

    it("snaps up to the next quarter hour", () => {
      setup();
      // 14:10 -> 14:15
      act(() => {
        latestSpec().drop?.(baseItem, fakeMonitor({ x: 0, y: GRID_TOP + 850 }));
      });
      expect(onSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: "2026-10-12T14:15:00+03:00" }),
        expect.any(Object),
      );
    });

    it("omits durationMin when the dropped item has none", () => {
      setup();
      act(() => {
        latestSpec().drop?.(
          { ...baseItem, id: "task-null", durationMin: null },
          fakeMonitor({ x: 0, y: GRID_TOP + 600 }),
        );
      });
      expect(onSchedule).toHaveBeenCalledWith(
        { id: "task-null", scheduledAt: "2026-10-12T10:00:00+03:00" },
        expect.any(Object),
      );
    });
  });

  describe("hover", () => {
    it("exposes the snapped preview minute computed from the pointer position", () => {
      const { result } = setup();
      act(() => {
        latestSpec().hover?.(baseItem, fakeMonitor({ x: 0, y: GRID_TOP + 607 }));
      });
      expect(result.current.dropPreviewMinute).toBe(600);
    });
  });

  describe("spec dependencies", () => {
    it("includes todayDate so a date that loads later is used by the new spec", () => {
      const { rerender, initialProps } = setup({ todayDate: undefined });
      expect(latestSpec().canDrop?.(baseItem, fakeMonitor(null))).toBe(false);

      rerender({ ...initialProps, todayDate: "2026-10-15" });

      expect(latestDeps()).toContain("2026-10-15");
      expect(latestSpec().canDrop?.(baseItem, fakeMonitor(null))).toBe(true);
      act(() => {
        // the grid element is attached in setup(); the rerender keeps the same ref
        latestSpec().drop?.(baseItem, fakeMonitor({ x: 0, y: GRID_TOP + 600 }));
      });
      expect(onSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: "2026-10-15T10:00:00+03:00" }),
        expect.any(Object),
      );
    });

    it("includes the pending flag and the scheduler", () => {
      const { rerender, initialProps } = setup();
      rerender({ ...initialProps, isPending: true });
      expect(latestDeps()).toContain(true);
      expect(latestDeps()).toContain(onSchedule);
      expect(latestSpec().canDrop?.(baseItem, fakeMonitor(null))).toBe(false);
    });
  });
});
