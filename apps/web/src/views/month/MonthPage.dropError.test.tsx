import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import MonthPage from "./MonthPage";
import * as useItemsModule from "@/hooks/useItems";
import { itemService } from "@/services/item-service";
import { alertStore } from "@/stores/alert-store";
import { ItemResponse } from "@/types/item/item";

interface DropSpec {
  drop: (d: unknown) => void;
}
const dnd = vi.hoisted(() => ({ drops: [] as unknown[] }));

vi.mock("react-dnd", () => ({
  DndProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDrop: (factory: () => unknown) => {
    dnd.drops.push(factory());
    return [{ isOver: false, canDrop: false }, () => undefined];
  },
  useDrag: () => [{ isDragging: false }, () => undefined],
}));
vi.mock("react-dnd-html5-backend", () => ({ HTML5Backend: {} }));
vi.mock("@/services/item-service", () => ({
  itemService: { updateItem: vi.fn() },
}));

const dueOnly: ItemResponse = {
  id: "d1",
  kind: "task",
  title: "Pay bill",
  notes: null,
  context: null,
  projectId: null,
  blockId: null,
  scheduledAt: null,
  durationMin: null,
  dueAt: "2026-10-12T14:00:00+03:00",
  notifyMinutesBefore: null,
  rrule: null,
  status: "open",
  completedAt: null,
  payload: {},
  source: "web",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

describe("MonthPage dueAt drop failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnd.drops.length = 0;
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [dueOnly],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it("surfaces a single error alert when moving a dueAt task fails", async () => {
    vi.mocked(itemService.updateItem).mockRejectedValueOnce(new Error("Move failed"));
    const alertSpy = vi.spyOn(alertStore.getState(), "show");
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MonthPage initialYear={2026} initialMonth={10} />
      </QueryClientProvider>,
    );

    // The October 2026 grid starts on Monday 2026-09-28, so the last registered
    // specs are the 35 day cells; index 17 is 2026-10-15.
    const cells = dnd.drops.slice(-35) as DropSpec[];
    cells[17].drop({ id: "d1", title: "Pay bill", fromYmd: "2026-10-12", item: dueOnly });

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", message: "Move failed" }),
    );
  });
});
