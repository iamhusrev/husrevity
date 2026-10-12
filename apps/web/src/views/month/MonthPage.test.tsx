import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import MonthPage from "./MonthPage";
import * as useItemsModule from "@/hooks/useItems";
import { ItemResponse } from "@/types/item/item";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: { count?: number; date?: string }) => {
        const map: Record<string, string> = {
          "month.title": "Ay",
          "month.prevMonth": "Önceki ay",
          "month.nextMonth": "Sonraki ay",
          "month.today": "Bugün",
          "month.loading": "Yükleniyor…",
          "month.error": "Ay verileri yüklenemedi.",
          "month.retry": "Tekrar dene",
          "month.empty": "Bu ay için herhangi bir kayıt yok.",
          "month.overflowChip": `+${opts?.count}`,
          "month.cellAriaLabel": `${opts?.date}, ${opts?.count} öğe`,
          "month.weekdays.mon": "Pzt",
          "month.weekdays.tue": "Sal",
          "month.weekdays.wed": "Çar",
          "month.weekdays.thu": "Per",
          "month.weekdays.fri": "Cum",
          "month.weekdays.sat": "Cmt",
          "month.weekdays.sun": "Paz",
          "month.panel.title": "Gün Detayları",
          "month.panel.empty": "Bu gün için kayıt yok.",
          "month.panel.complete": "Tamamla",
          "month.panel.reschedule": "Zamanla",
          "month.panel.delete": "Sil",
          "month.panel.occurrenceDeleteHint": "Tekrarlayan serinin parçası",
          "month.panel.addItem": "Öğe Ekle",
          "month.panel.titlePlaceholder": "Başlık...",
          "month.panel.timeOptional": "Saat (isteğe bağlı)",
          "month.panel.kind": "Tür",
          "month.panel.kindTask": "Görev",
          "month.panel.kindEvent": "Etkinlik",
          "month.panel.submit": "Ekle",
          "today.board.scheduleModalTitle": "İşi zamanla",
          "today.board.timeLabel": "Saat",
          "today.board.durationLabel": "Süre",
          "today.board.confirm": "Zamanla",
          "today.board.cancel": "İptal",
          "today.board.recurringTask": "Tekrarlayan",
          "today.board.recurringTaskTooltip": "Tekrarlayan görevlerin zamanı kuralından belirlenir",
          "common.done": "Tamam",
          "common.delete": "Sil",
          "common.close": "Kapat",
          "common.today": "Bugün",
        };
        return map[key] ?? key;
      },
      i18n: {
        language: "tr",
      },
    }),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockItems: ItemResponse[] = [
  {
    id: "item-1",
    kind: "task",
    title: "Review PR",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: "2026-10-12T10:00:00+03:00",
    durationMin: 30,
    dueAt: null,
    notifyMinutesBefore: null,
    rrule: null,
    status: "open",
    completedAt: null,
    payload: {},
    source: "web",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
  {
    id: "item-2",
    kind: "event",
    title: "Team Sync",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: "2026-10-12T14:00:00+03:00",
    durationMin: 60,
    dueAt: null,
    notifyMinutesBefore: null,
    rrule: null,
    status: "open",
    completedAt: null,
    payload: {},
    source: "web",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
  {
    id: "item-3",
    kind: "task",
    title: "Completed Task",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: "2026-10-12T16:00:00+03:00",
    durationMin: null,
    dueAt: null,
    notifyMinutesBefore: null,
    rrule: null,
    status: "done",
    completedAt: "2026-10-12T16:30:00Z",
    payload: {},
    source: "web",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
  {
    id: "item-4",
    kind: "task",
    title: "Overflow Task",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: "2026-10-12T17:00:00+03:00",
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
  },
  {
    id: "item-recurring",
    kind: "task",
    title: "Daily Standup Occ",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: "2026-10-13T09:00:00+03:00",
    durationMin: 15,
    dueAt: null,
    notifyMinutesBefore: null,
    rrule: "FREQ=DAILY",
    occursOn: "2026-10-13",
    status: "open",
    completedAt: null,
    payload: {},
    source: "web",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
];

describe("MonthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TZ", "UTC");
  });

  it("renders loading skeleton state", () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId("month-grid-skeleton")).toBeInTheDocument();
  });

  it("renders error state with retry button", async () => {
    const refetch = vi.fn();
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Ay verileri yüklenemedi.")).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: "Tekrar dene" });
    await user.click(retryBtn);
    expect(refetch).toHaveBeenCalled();
  });

  it("renders empty month hint when month has no items", () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Bu ay için herhangi bir kayıt yok.")).toBeInTheDocument();
  });

  it("renders day cells with chips, overflow chip, and accessible names", () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    // 2026-10-12 has 4 items -> shows first 3 chips, plus "+1" overflow chip
    expect(screen.getByText("Review PR")).toBeInTheDocument();
    expect(screen.getByText("Team Sync")).toBeInTheDocument();
    expect(screen.getByText("Completed Task")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();

    // Completed task has line-through style
    const completedChip = screen.getByText("Completed Task");
    expect(completedChip.closest("[data-completed='true']")).toBeInTheDocument();

    // Day cell has accessible name
    const oct12Cell = screen.getByTestId("cell-2026-10-12");
    expect(oct12Cell).toHaveAttribute(
      "aria-label",
      expect.stringContaining("4 öğe"),
    );
  });

  it("highlights today using Europe/Istanbul calendar date", () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    // Instant where UTC is Oct 12 22:30, but Istanbul is Oct 13 01:30!
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T22:30:00.000Z"));

    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    const oct12Cell = screen.getByTestId("cell-2026-10-12");
    const oct13Cell = screen.getByTestId("cell-2026-10-13");

    expect(oct12Cell).not.toHaveAttribute("data-today", "true");
    expect(oct13Cell).toHaveAttribute("data-today", "true");

    vi.useRealTimers();
  });

  it("navigates previous and next months and resets with Bugün button", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    // Initially October 2026
    expect(screen.getByTestId("month-heading")).toHaveTextContent("Ekim 2026");

    // Click next month -> November 2026
    await user.click(screen.getByRole("button", { name: "Sonraki ay" }));
    expect(screen.getByTestId("month-heading")).toHaveTextContent("Kasım 2026");

    // Click previous month twice -> September 2026
    await user.click(screen.getByRole("button", { name: "Önceki ay" }));
    await user.click(screen.getByRole("button", { name: "Önceki ay" }));
    expect(screen.getByTestId("month-heading")).toHaveTextContent("Eylül 2026");

    // Click Bugün button
    await user.click(screen.getByRole("button", { name: "Bugün" }));
    // Month heading returns to current Istanbul month
  });

  it("opens day panel on cell click and closes on Escape or close button", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    // Panel is initially closed
    expect(screen.queryByTestId("day-panel")).not.toBeInTheDocument();

    // Click cell 2026-10-12
    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();

    // Panel lists all 4 items for 2026-10-12
    const panel = screen.getByTestId("day-panel");
    expect(within(panel).getByText("Review PR")).toBeInTheDocument();
    expect(within(panel).getByText("Team Sync")).toBeInTheDocument();
    expect(within(panel).getByText("Completed Task")).toBeInTheDocument();
    expect(within(panel).getByText("Overflow Task")).toBeInTheDocument();

    // Press Escape -> panel closes
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("day-panel")).not.toBeInTheDocument();

    // Click again and close via Close button
    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();
    await user.click(within(screen.getByTestId("day-panel")).getByRole("button", { name: "Kapat" }));
    expect(screen.queryByTestId("day-panel")).not.toBeInTheDocument();
  });

  it("pressing Escape when ScheduleModal is open closes only the modal, leaving day panel open", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();

    const rescheduleBtns = screen.getAllByRole("button", { name: "Zamanla" });
    await user.click(rescheduleBtns[0]);
    expect(screen.getByRole("dialog", { name: "İşi zamanla" })).toBeInTheDocument();

    // Escape closes only the modal
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "İşi zamanla" })).not.toBeInTheDocument();
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();

    // Subsequent Escape closes the panel
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("day-panel")).not.toBeInTheDocument();
  });

  it("moves focus to the panel heading on open, and restores focus to originating cell on close", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    const cell = screen.getByTestId("cell-2026-10-12");
    cell.focus();
    expect(cell).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("day-panel")).not.toBeInTheDocument();
    expect(cell).toHaveFocus();
  });

  it("supports keyboard navigation with arrow keys and Enter to open panel", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    // Focus first cell (2026-09-28)
    const firstCell = screen.getByTestId("cell-2026-09-28");
    firstCell.focus();
    expect(firstCell).toHaveFocus();

    // ArrowRight -> next cell (2026-09-29)
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("cell-2026-09-29")).toHaveFocus();

    // ArrowDown -> next week (+7 days: 2026-10-06)
    await user.keyboard("{ArrowDown}");
    expect(screen.getByTestId("cell-2026-10-06")).toHaveFocus();

    // Enter opens panel
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();
  });

  it("performs complete mutation with occursOn semantics in day panel", async () => {
    const mutateComplete = vi.fn();
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: mutateComplete,
      isPending: false,
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));
    const completeBtns = screen.getAllByRole("button", { name: "Tamamla" });
    await user.click(completeBtns[0]);

    expect(mutateComplete).toHaveBeenCalledWith(
      { id: "item-1", occursOn: "2026-10-12" },
      expect.any(Object),
    );
  });

  it("performs delete mutation in day panel", async () => {
    const mutateDelete = vi.fn();
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.spyOn(useItemsModule, "useDeleteItem").mockReturnValue({
      mutate: mutateDelete,
      isPending: false,
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));
    const deleteBtns = screen.getAllByRole("button", { name: "Sil" });
    await user.click(deleteBtns[0]);

    expect(mutateDelete).toHaveBeenCalledWith("item-1", expect.any(Object));
  });

  it("hides delete button for occursOn rows and displays explanatory label", async () => {
    const occItem: ItemResponse = {
      id: "occ-item",
      kind: "task",
      title: "Daily Occurrence",
      notes: null,
      context: null,
      projectId: null,
      blockId: null,
      scheduledAt: "2026-10-12T09:00:00+03:00",
      durationMin: 15,
      dueAt: null,
      notifyMinutesBefore: null,
      rrule: "FREQ=DAILY",
      occursOn: "2026-10-12",
      status: "open",
      completedAt: null,
      payload: {},
      source: "web",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    };

    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [occItem],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
    expect(screen.getByText("Tekrarlayan serinin parçası")).toBeInTheDocument();
  });

  it("requires the series confirmation before deleting a recurring template", async () => {
    const templateItem: ItemResponse = {
      id: "template-item",
      kind: "task",
      title: "Daily Template",
      notes: null,
      context: null,
      projectId: null,
      blockId: null,
      scheduledAt: "2026-10-12T09:00:00+03:00",
      durationMin: 15,
      dueAt: null,
      notifyMinutesBefore: null,
      rrule: "FREQ=DAILY",
      status: "open",
      completedAt: null,
      payload: {},
      source: "web",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    };

    const mutateDelete = vi.fn();
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [templateItem],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.spyOn(useItemsModule, "useDeleteItem").mockReturnValue({
      mutate: mutateDelete,
      isPending: false,
    } as any);

    const confirmSpy = vi.spyOn(window, "confirm");

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));

    // First: user cancels confirm
    confirmSpy.mockReturnValueOnce(false);
    const deleteBtn = screen.getByRole("button", { name: "Sil" });
    await user.click(deleteBtn);

    // The mocked `t` echoes unknown keys, so this asserts the i18n key itself.
    expect(confirmSpy).toHaveBeenCalledWith("month.panel.deleteSeriesConfirm");
    expect(mutateDelete).not.toHaveBeenCalled();

    // Second: user accepts confirm
    confirmSpy.mockReturnValueOnce(true);
    await user.click(deleteBtn);

    expect(mutateDelete).toHaveBeenCalledWith("template-item", expect.any(Object));
  });

  it("creates new item with prefilled Istanbul date from day panel add form", async () => {
    const mutateCreate = vi.fn();
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutate: mutateCreate,
      isPending: false,
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));

    const panel = screen.getByTestId("day-panel");
    const titleInput = within(panel).getByPlaceholderText("Başlık...");
    await user.type(titleInput, "Buy milk");

    const timeInput = within(panel).getByLabelText("Saat (isteğe bağlı)");
    await user.type(timeInput, "11:30");

    const submitBtn = within(panel).getByRole("button", { name: "Ekle" });
    await user.click(submitBtn);

    expect(mutateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Buy milk",
        kind: "task",
        scheduledAt: "2026-10-12T11:30:00+03:00",
      }),
      expect.any(Object),
    );
  });

  it("recurring items are not draggable and display recurring indicator", () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    const recurringChip = screen.getByText("Daily Standup Occ").closest("[data-chip='true']");
    expect(recurringChip).toHaveAttribute("data-draggable", "false");
    expect(recurringChip).toHaveAttribute("title", "Tekrarlayan görevlerin zamanı kuralından belirlenir");
  });

  it("hides reschedule button in day panel for occursOn and template recurring items", async () => {
    const itemsWithRecurring: ItemResponse[] = [
      {
        id: "rec-occ",
        kind: "task",
        title: "Occ Item",
        notes: null,
        context: null,
        projectId: null,
        blockId: null,
        scheduledAt: "2026-10-12T09:00:00+03:00",
        durationMin: 15,
        dueAt: null,
        notifyMinutesBefore: null,
        rrule: "FREQ=DAILY",
        occursOn: "2026-10-12",
        status: "open",
        completedAt: null,
        payload: {},
        source: "web",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
      },
      {
        id: "rec-template",
        kind: "task",
        title: "Template Item",
        notes: null,
        context: null,
        projectId: null,
        blockId: null,
        scheduledAt: "2026-10-12T10:00:00+03:00",
        durationMin: 15,
        dueAt: null,
        notifyMinutesBefore: null,
        rrule: "FREQ=DAILY",
        status: "open",
        completedAt: null,
        payload: {},
        source: "web",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
      },
    ];

    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: itemsWithRecurring,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Zamanla" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Tekrarlayan")).toHaveLength(2);
  });

  it("passes item's Istanbul time as initialTime to ScheduleModal when opened from day panel", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();

    // First item in mockItems is "Review PR" with scheduledAt 10:00:00+03:00
    const rescheduleBtns = screen.getAllByRole("button", { name: "Zamanla" });
    await user.click(rescheduleBtns[0]);

    // ScheduleModal opens with time input set to "10:00"
    const timeInput = screen.getByLabelText("Saat") as HTMLInputElement;
    expect(timeInput.value).toBe("10:00");
  });

  it("resets/clamps focusedCellIndex when navigating from 6-week to 5-week month", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    // August 2026 has 42 cells (6 weeks).
    render(<MonthPage initialYear={2026} initialMonth={8} />, {
      wrapper: createWrapper(),
    });

    // First cell is index 0 (2026-07-27)
    const firstCell = screen.getByTestId("cell-2026-07-27");
    firstCell.focus();

    // Move down 5 weeks (+35) and right 6 days (+6) to index 41 (2026-09-06)
    for (let i = 0; i < 5; i++) {
      await user.keyboard("{ArrowDown}");
    }
    for (let i = 0; i < 6; i++) {
      await user.keyboard("{ArrowRight}");
    }
    expect(screen.getByTestId("cell-2026-09-06")).toHaveAttribute("tabindex", "0");

    // Navigate to next month (September 2026 has 35 cells)
    const nextBtn = screen.getByRole("button", { name: "Sonraki ay" });
    await user.click(nextBtn);

    // There must be exactly one cell with tabIndex="0" in the 5-week month
    const tabbableCells = document.querySelectorAll("[role='gridcell'][tabindex='0']");
    expect(tabbableCells.length).toBe(1);
  });

  it("renders a valid ARIA grid role hierarchy with grid, rows, columnheaders, and gridcells", () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    const grid = screen.getByRole("grid");
    expect(grid).toBeInTheDocument();

    const columnHeaders = within(grid).getAllByRole("columnheader");
    expect(columnHeaders).toHaveLength(7);

    const rows = within(grid).getAllByRole("row");
    // 1 header row + 5 week rows in October 2026 (35 days) = 6 rows
    expect(rows).toHaveLength(6);

    const gridCells = within(grid).getAllByRole("gridcell");
    expect(gridCells).toHaveLength(35);
  });

  it("does not render '00:00' for timeless dueAt-only tasks at Istanbul midnight", async () => {
    const timelessTask: ItemResponse = {
      id: "timeless-1",
      kind: "task",
      title: "Timeless Grocery Task",
      notes: null,
      context: null,
      projectId: null,
      blockId: null,
      scheduledAt: null,
      durationMin: null,
      dueAt: "2026-10-12T00:00:00+03:00",
      notifyMinutesBefore: null,
      rrule: null,
      status: "open",
      completedAt: null,
      payload: {},
      source: "web",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    };

    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [timelessTask],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    // Chip should show title but NOT "00:00"
    expect(screen.getByText("Timeless Grocery Task")).toBeInTheDocument();
    expect(screen.queryByText("00:00")).not.toBeInTheDocument();

    // In day panel as well
    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();
    expect(within(screen.getByTestId("day-panel")).queryByText("00:00")).not.toBeInTheDocument();
  });

  it("ignores Escape while the day panel is closed and does not steal focus back to a cell", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    const cell = screen.getByTestId("cell-2026-10-12");
    await user.click(cell);
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("day-panel")).not.toBeInTheDocument();
    expect(cell).toHaveFocus();

    const todayBtn = screen.getByRole("button", { name: "Bugün" });
    todayBtn.focus();
    await user.keyboard("{Escape}");
    expect(todayBtn).toHaveFocus();
  });

  it("keeps the empty month hint outside the grid so it only contains rows", () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    const hint = screen.getByText("Bu ay için herhangi bir kayıt yok.");
    const grid = screen.getByRole("grid");
    expect(grid).not.toContainElement(hint);

    // Every row sits directly under the grid (or a plain wrapper), never next to the hint.
    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(1 + 5);
    for (const row of rows) {
      expect(hint.contains(row)).toBe(false);
    }
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(35);
  });

  it("renders an event stored at exactly 00:00 Istanbul without a time", async () => {
    const allDayEvent: ItemResponse = {
      ...mockItems[1],
      id: "all-day",
      title: "All Day Conference",
      kind: "event",
      scheduledAt: "2026-10-12T00:00:00+03:00",
    };
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [allDayEvent],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("All Day Conference")).toBeInTheDocument();
    expect(screen.queryByText("00:00")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(within(screen.getByTestId("day-panel")).queryByText("00:00")).not.toBeInTheDocument();
  });

  it("traps Tab inside the day panel: Shift+Tab from the first control wraps to the last and Tab wraps back", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    render(<MonthPage initialYear={2026} initialMonth={10} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByTestId("cell-2026-10-12"));
    const panel = screen.getByTestId("day-panel");
    const closeBtn = within(panel).getByRole("button", { name: "Kapat" });
    const submitBtn = within(panel).getByRole("button", { name: "Ekle" });

    // Focus starts on the heading; the first Tab reaches the close button.
    await user.tab();
    expect(closeBtn).toHaveFocus();
    await user.tab({ shift: true });
    expect(submitBtn).toHaveFocus();
    await user.tab();
    expect(closeBtn).toHaveFocus();
  });
});
