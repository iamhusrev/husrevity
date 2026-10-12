import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useMonthDrop, UseMonthDropParams } from "./useMonthDrop";
import { ItemResponse } from "@/types/item/item";

// The default mutation hooks are always instantiated, so a provider is required.
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    children,
  );

describe("useMonthDrop", () => {
  const onSchedule = vi.fn();
  const onUpdateFields = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeItem = (overrides: Partial<ItemResponse> = {}): ItemResponse => ({
    id: "item-1",
    kind: "task",
    title: "Test Task",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: null,
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
    ...overrides,
  });

  it("moves a dueAt-only task by updating dueAt without writing scheduledAt", () => {
    const { result } = renderHook(() =>
      useMonthDrop({ onSchedule, onUpdateFields, isPending: false }),
      { wrapper },
    );

    const item = makeItem({
      dueAt: "2026-10-12T14:00:00+03:00",
      scheduledAt: null,
    });

    act(() => {
      result.current.handleDropOnDay(
        { id: item.id, title: item.title, fromYmd: "2026-10-12", item },
        "2026-10-15",
      );
    });

    expect(onUpdateFields).toHaveBeenCalledWith({
      id: "item-1",
      body: { dueAt: "2026-10-15T14:00:00+03:00" },
    });
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it("moves a scheduled task by updating scheduledAt only", () => {
    const { result } = renderHook(() =>
      useMonthDrop({ onSchedule, onUpdateFields, isPending: false }),
      { wrapper },
    );

    const item = makeItem({
      scheduledAt: "2026-10-12T10:30:00+03:00",
      durationMin: 45,
      dueAt: null,
    });

    act(() => {
      result.current.handleDropOnDay(
        { id: item.id, title: item.title, fromYmd: "2026-10-12", item },
        "2026-10-20",
      );
    });

    expect(onSchedule).toHaveBeenCalledWith({
      id: "item-1",
      scheduledAt: "2026-10-20T10:30:00+03:00",
      durationMin: 45,
    });
    expect(onUpdateFields).not.toHaveBeenCalled();
  });

  it("task with both scheduledAt and dueAt moves only the field that placed it on the grid", () => {
    const { result } = renderHook(() =>
      useMonthDrop({ onSchedule, onUpdateFields, isPending: false }),
      { wrapper },
    );

    // Placed on grid by scheduledAt on Oct 10
    const item = makeItem({
      scheduledAt: "2026-10-10T09:00:00+03:00",
      dueAt: "2026-10-15T18:00:00+03:00",
      durationMin: 30,
    });

    // Dropped from Oct 10 (scheduledAt's day) to Oct 12
    act(() => {
      result.current.handleDropOnDay(
        { id: item.id, title: item.title, fromYmd: "2026-10-10", item },
        "2026-10-12",
      );
    });

    expect(onSchedule).toHaveBeenCalledWith({
      id: "item-1",
      scheduledAt: "2026-10-12T09:00:00+03:00",
      durationMin: 30,
    });
    expect(onUpdateFields).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // Dropped from Oct 15 (dueAt's day) to Oct 18
    act(() => {
      result.current.handleDropOnDay(
        { id: item.id, title: item.title, fromYmd: "2026-10-15", item },
        "2026-10-18",
      );
    });

    expect(onUpdateFields).toHaveBeenCalledWith({
      id: "item-1",
      body: { dueAt: "2026-10-18T18:00:00+03:00" },
    });
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it("same-day drop is a no-op", () => {
    const { result } = renderHook(() =>
      useMonthDrop({ onSchedule, onUpdateFields, isPending: false }),
      { wrapper },
    );

    const item = makeItem({
      scheduledAt: "2026-10-12T10:00:00+03:00",
    });

    act(() => {
      result.current.handleDropOnDay(
        { id: item.id, title: item.title, fromYmd: "2026-10-12", item },
        "2026-10-12",
      );
    });

    expect(onSchedule).not.toHaveBeenCalled();
    expect(onUpdateFields).not.toHaveBeenCalled();
  });

  it("drop is ignored while mutation is pending", () => {
    const { result } = renderHook(() =>
      useMonthDrop({ onSchedule, onUpdateFields, isPending: true }),
      { wrapper },
    );

    const item = makeItem({
      scheduledAt: "2026-10-12T10:00:00+03:00",
    });

    act(() => {
      result.current.handleDropOnDay(
        { id: item.id, title: item.title, fromYmd: "2026-10-12", item },
        "2026-10-15",
      );
    });

    expect(onSchedule).not.toHaveBeenCalled();
    expect(onUpdateFields).not.toHaveBeenCalled();
  });

  it("keeps a stable hook order when handlers appear and disappear between renders", () => {
    const { result, rerender } = renderHook(
      (props: UseMonthDropParams) => useMonthDrop(props),
      { wrapper, initialProps: {} as UseMonthDropParams },
    );
    expect(() => rerender({ onSchedule, onUpdateFields })).not.toThrow();
    expect(() => rerender({ onSchedule })).not.toThrow();
    expect(() => rerender({})).not.toThrow();
    expect(result.current.isPending).toBe(false);
  });
});
