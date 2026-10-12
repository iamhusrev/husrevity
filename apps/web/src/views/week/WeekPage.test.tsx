import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import WeekPage from "./WeekPage";
import * as useItemsModule from "@/hooks/useItems";
import { ItemResponse } from "@/types/item/item";

// Capture react-dnd registrations so drops can be triggered without a real backend.
interface DropSpec {
  accept: string;
  canDrop: (d: unknown) => boolean;
  drop: (d: unknown) => void;
}
interface DragSpec {
  canDrag: () => boolean;
  item: { id: string };
}
const dnd = vi.hoisted(() => ({
  drops: [] as unknown[],
  drags: [] as unknown[],
}));

vi.mock("react-dnd", () => ({
  DndProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDrop: (factory: () => unknown) => {
    dnd.drops.push(factory());
    return [{ isOver: false, canDrop: false }, () => undefined];
  },
  useDrag: (factory: () => unknown) => {
    dnd.drags.push(factory());
    return [{ isDragging: false }, () => undefined];
  },
}));
vi.mock("react-dnd-html5-backend", () => ({ HTML5Backend: {} }));

const TEMPLATES: Record<string, string> = {
  "week.prevWeek": "Önceki hafta",
  "week.nextWeek": "Sonraki hafta",
  "week.thisWeek": "Bu hafta",
  "week.loading": "Yükleniyor…",
  "week.error": "Hafta verileri yüklenemedi.",
  "week.retry": "Tekrar dene",
  "week.empty": "Bu hafta için kayıt yok.",
  "week.noItemsDay": "Kayıt yok",
  "week.dayAriaLabel": "{{date}}, {{count}} öğe, {{duration}}",
  "week.durationHours": "{{count}} saat",
  "week.durationMinutes": "{{count}} dk",
  "week.durationHoursMinutes": "{{hours}} saat {{minutes}} dk",
  "week.loadLabel": "Günlük yük: {{duration}} / {{capacity}}",
  "week.summary.label": "Hafta özeti",
  "week.summary.total": "Toplam",
  "week.summary.done": "Tamamlanan",
  "week.summary.open": "Açık",
  "week.summary.slipped": "Kayan",
  "week.weekdays.mon": "Pazartesi",
  "week.weekdays.tue": "Salı",
  "week.weekdays.wed": "Çarşamba",
  "week.weekdays.thu": "Perşembe",
  "week.weekdays.fri": "Cuma",
  "week.weekdays.sat": "Cumartesi",
  "week.weekdays.sun": "Pazar",
  "week.complete": "Tamamla",
  "week.schedule": "Zamanla",
  "week.addTo": "{{date}} gününe ekle",
  "week.titlePlaceholder": "Başlık...",
  "week.timeOptional": "Saat (isteğe bağlı)",
  "week.kind": "Tür",
  "week.kindTask": "Görev",
  "week.kindEvent": "Etkinlik",
  "week.submit": "Ekle",
  "week.cancel": "Vazgeç",
  "week.dragHint": "Sürükle",
  "today.board.scheduleModalTitle": "İşi zamanla",
  "today.board.timeLabel": "Saat",
  "today.board.durationLabel": "Süre",
  "today.board.confirm": "Onayla",
  "today.board.cancel": "İptal",
  "today.board.recurringTask": "Tekrarlayan",
  "today.board.recurringTaskTooltip": "Tekrarlayan görevlerin zamanı kuralından belirlenir",
  "today.board.minuteOption": "{{count}} dk",
  "common.close": "Kapat",
};

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        const tpl = TEMPLATES[key] ?? key;
        return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k] ?? ""));
      },
      i18n: { language: "tr" },
    }),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeItem(overrides: Partial<ItemResponse>): ItemResponse {
  return {
    id: "item",
    kind: "task",
    title: "Item",
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
  };
}

// Week of Mon 2026-10-12 .. Sun 2026-10-18. "Today" is Wed 2026-10-14 (Istanbul).
const NOW = new Date("2026-10-14T09:00:00Z");

describe("WeekPage", () => {
  const completeMutate = vi.fn();
  const createMutate = vi.fn();
  const scheduleMutate = vi.fn();
  const updateMutate = vi.fn();
  let rangeSpy: ReturnType<typeof vi.spyOn>;
  let updatePending = false;

  function mockItems(data: ItemResponse[] | undefined, state: Partial<{ isLoading: boolean; isError: boolean; refetch: () => void }> = {}) {
    rangeSpy = vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
      ...state,
    } as never);
  }

  function lastDropSpecs(): DropSpec[] {
    // Each render registers 7 columns in Monday..Sunday order.
    return dnd.drops.slice(-7) as DropSpec[];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    dnd.drops.length = 0;
    dnd.drags.length = 0;
    updatePending = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: completeMutate,
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutate: createMutate,
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useScheduleItem").mockReturnValue({
      mutate: scheduleMutate,
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useUpdateItemFields").mockImplementation(
      () => ({ mutate: updateMutate, isPending: updatePending }) as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the loading skeleton", () => {
    mockItems(undefined, { isLoading: true });
    render(<WeekPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("week-skeleton")).toBeInTheDocument();
  });

  it("renders the error state and retries", async () => {
    const refetch = vi.fn();
    mockItems(undefined, { isError: true, refetch });
    const user = userEvent.setup();
    render(<WeekPage />, { wrapper: createWrapper() });
    expect(screen.getByText("Hafta verileri yüklenemedi.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the empty week hint with zeroed summary and seven columns", () => {
    mockItems([]);
    render(<WeekPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("week-empty")).toBeInTheDocument();
    expect(screen.getByTestId("week-summary-total")).toHaveTextContent("0");
    expect(screen.getAllByTestId(/^week-day-2026-/)).toHaveLength(7);
  });

  it("queries the Monday..Sunday range of the current Istanbul week and shows the date range", () => {
    mockItems([]);
    render(<WeekPage />, { wrapper: createWrapper() });
    expect(rangeSpy).toHaveBeenCalledWith("2026-10-12", "2026-10-18");
    expect(screen.getByTestId("week-heading")).toHaveTextContent("12 Ekim – 18 Ekim 2026");
  });

  it("sorts chips by time, strikes completed items and gives each day an accessible name", () => {
    mockItems([
      makeItem({ id: "b", title: "Afternoon", scheduledAt: "2026-10-12T15:00:00+03:00", durationMin: 60 }),
      makeItem({ id: "a", title: "Morning", scheduledAt: "2026-10-12T09:00:00+03:00", durationMin: 60 }),
      makeItem({ id: "c", title: "Finished", scheduledAt: "2026-10-12T20:00:00+03:00", durationMin: null, status: "done" }),
    ]);
    render(<WeekPage />, { wrapper: createWrapper() });

    const monday = screen.getByTestId("week-day-2026-10-12");
    expect(monday).toHaveAccessibleName("Pazartesi 12 Ekim, 3 öğe, 2 saat 30 dk");
    const titles = within(monday)
      .getAllByText(/Morning|Afternoon|Finished/)
      .map((n) => n.textContent);
    expect(titles).toEqual(["Morning", "Afternoon", "Finished"]);
    expect(within(monday).getByText("Finished").closest("[data-completed='true']")).not.toBeNull();
    expect(within(monday).getByText("09:00")).toBeInTheDocument();
  });

  it("computes the summary: total, done, open and slipped", () => {
    mockItems([
      makeItem({ id: "1", scheduledAt: "2026-10-12T09:00:00+03:00" }), // slipped
      makeItem({ id: "2", dueAt: "2026-10-13T00:00:00+03:00" }), // slipped
      makeItem({ id: "3", scheduledAt: "2026-10-14T09:00:00+03:00" }), // today, not slipped
      makeItem({ id: "4", scheduledAt: "2026-10-16T09:00:00+03:00", status: "done" }),
    ]);
    render(<WeekPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("week-summary-total")).toHaveTextContent("4");
    expect(screen.getByTestId("week-summary-done")).toHaveTextContent("1");
    expect(screen.getByTestId("week-summary-open")).toHaveTextContent("3");
    expect(screen.getByTestId("week-summary-slipped")).toHaveTextContent("2");
  });

  it("ignores items that sit on no displayed column in the summary and the empty hint", () => {
    mockItems([
      // Scheduled Oct 5 with dueAt Oct 14: matched by the API range, but placed on Oct 5.
      makeItem({
        id: "out",
        scheduledAt: "2026-10-05T09:00:00+03:00",
        dueAt: "2026-10-14T00:00:00+03:00",
      }),
      // Previous week's item kept while the next week loads.
      makeItem({ id: "prev", scheduledAt: "2026-10-09T09:00:00+03:00" }),
    ]);
    render(<WeekPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("week-summary-total")).toHaveTextContent("0");
    expect(screen.getByTestId("week-summary-open")).toHaveTextContent("0");
    expect(screen.getByTestId("week-summary-slipped")).toHaveTextContent("0");
    expect(screen.getByTestId("week-empty")).toBeInTheDocument();
  });

  it("colours the load bar by threshold: ok <= 100%, warn > 100%, over > 125%", () => {
    const many = (prefix: string, day: string, n: number, minutes: number | null) =>
      Array.from({ length: n }, (_, i) =>
        makeItem({
          id: `${prefix}-${i}`,
          title: `${prefix}-${i}`,
          scheduledAt: `${day}T${String(8 + i).padStart(2, "0")}:00:00+03:00`,
          durationMin: minutes,
        }),
      );
    mockItems([
      ...many("mon", "2026-10-12", 8, 60), // 480 min = exactly 100% -> ok
      ...many("tue", "2026-10-13", 9, 60), // 540 -> warn
      ...many("wed", "2026-10-14", 11, 60), // 660 -> over
      ...many("thu", "2026-10-15", 2, null), // 60 -> ok, nulls count as 30
    ]);
    render(<WeekPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId("week-load-2026-10-12")).toHaveAttribute("data-level", "ok");
    expect(screen.getByTestId("week-load-2026-10-13")).toHaveAttribute("data-level", "warn");
    expect(screen.getByTestId("week-load-2026-10-14")).toHaveAttribute("data-level", "over");
    expect(screen.getByTestId("week-load-2026-10-15")).toHaveAttribute("data-level", "ok");
    expect(screen.getByTestId("week-load-2026-10-15")).toHaveAttribute("data-minutes", "60");
  });

  it("highlights today by the Istanbul day", () => {
    mockItems([]);
    render(<WeekPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("week-day-2026-10-14")).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("week-day-2026-10-13")).not.toHaveAttribute("data-today");
  });

  it("navigates to the previous and next week and back to this week", async () => {
    mockItems([]);
    const user = userEvent.setup();
    render(<WeekPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Sonraki hafta" }));
    expect(rangeSpy).toHaveBeenLastCalledWith("2026-10-19", "2026-10-25");
    await user.click(screen.getByRole("button", { name: "Önceki hafta" }));
    await user.click(screen.getByRole("button", { name: "Önceki hafta" }));
    expect(rangeSpy).toHaveBeenLastCalledWith("2026-10-05", "2026-10-11");
    await user.click(screen.getByRole("button", { name: "Bu hafta" }));
    expect(rangeSpy).toHaveBeenLastCalledWith("2026-10-12", "2026-10-18");
  });

  it("shows a week that crosses a month boundary", () => {
    mockItems([]);
    render(<WeekPage initialYmd="2026-10-29" />, { wrapper: createWrapper() });
    expect(rangeSpy).toHaveBeenCalledWith("2026-10-26", "2026-11-01");
    expect(screen.getByTestId("week-heading")).toHaveTextContent("26 Ekim – 1 Kasım 2026");
  });

  it("guards recurring rows: not draggable, no schedule button, drops ignored", () => {
    const recurring = makeItem({
      id: "r1",
      title: "Daily standup",
      rrule: "FREQ=DAILY",
      occursOn: "2026-10-12",
      scheduledAt: "2026-10-01T09:00:00+03:00",
    });
    mockItems([recurring]);
    render(<WeekPage />, { wrapper: createWrapper() });

    const chip = screen.getByText("Daily standup").closest("[data-chip]");
    expect(chip).toHaveAttribute("data-draggable", "false");
    expect(within(chip as HTMLElement).queryByRole("button", { name: /Zamanla/ })).toBeNull();
    expect(within(chip as HTMLElement).getByText("Tekrarlayan")).toBeInTheDocument();

    const dragSpec = (dnd.drags.slice(-1)[0] as DragSpec);
    expect(dragSpec.canDrag()).toBe(false);

    // Even a forced drop must not write anything.
    const tuesday = lastDropSpecs()[1];
    tuesday.drop({ id: "r1", title: "x", fromYmd: "2026-10-12", item: recurring });
    expect(updateMutate).not.toHaveBeenCalled();
    expect(scheduleMutate).not.toHaveBeenCalled();
  });

  it("moves a dueAt-only task by changing dueAt, preserving its Istanbul time", () => {
    const dueOnly = makeItem({ id: "d1", title: "Pay bill", dueAt: "2026-10-12T14:00:00+03:00" });
    mockItems([dueOnly]);
    render(<WeekPage />, { wrapper: createWrapper() });

    lastDropSpecs()[3].drop({ id: "d1", title: "Pay bill", fromYmd: "2026-10-12", item: dueOnly });

    expect(updateMutate).toHaveBeenCalledWith({
      id: "d1",
      body: { dueAt: "2026-10-15T14:00:00+03:00" },
    });
    expect(scheduleMutate).not.toHaveBeenCalled();
  });

  it("moves a scheduled item by changing scheduledAt and keeps its duration", () => {
    const scheduled = makeItem({
      id: "s1",
      title: "Review",
      scheduledAt: "2026-10-12T10:00:00+03:00",
      durationMin: 45,
    });
    mockItems([scheduled]);
    render(<WeekPage />, { wrapper: createWrapper() });

    lastDropSpecs()[2].drop({ id: "s1", title: "Review", fromYmd: "2026-10-12", item: scheduled });

    expect(scheduleMutate).toHaveBeenCalledWith({
      id: "s1",
      scheduledAt: "2026-10-14T10:00:00+03:00",
      durationMin: 45,
    });
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("ignores drops while a mutation is pending", () => {
    updatePending = true;
    const scheduled = makeItem({ id: "s1", scheduledAt: "2026-10-12T10:00:00+03:00" });
    mockItems([scheduled]);
    render(<WeekPage />, { wrapper: createWrapper() });

    lastDropSpecs()[2].drop({ id: "s1", title: "x", fromYmd: "2026-10-12", item: scheduled });
    expect(scheduleMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("completes an item with the column day as occursOn", async () => {
    mockItems([makeItem({ id: "c1", title: "Call", scheduledAt: "2026-10-13T11:00:00+03:00" })]);
    const user = userEvent.setup();
    render(<WeekPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Tamamla: Call" }));
    expect(completeMutate).toHaveBeenCalledWith(
      { id: "c1", occursOn: "2026-10-13" },
      expect.any(Object),
    );
  });

  it("adds a timeless task to the column day with dueAt at Istanbul midnight", async () => {
    mockItems([]);
    const user = userEvent.setup();
    render(<WeekPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Çarşamba 14 Ekim gününe ekle" }));
    await user.type(screen.getByPlaceholderText("Başlık..."), "Buy stamps");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(createMutate).toHaveBeenCalledWith(
      { title: "Buy stamps", kind: "task", scheduledAt: null, dueAt: "2026-10-14T00:00:00+03:00" },
      expect.any(Object),
    );
  });

  it("adds a timed item with scheduledAt on the Istanbul day", async () => {
    mockItems([]);
    const user = userEvent.setup();
    render(<WeekPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Cuma 16 Ekim gününe ekle" }));
    await user.type(screen.getByPlaceholderText("Başlık..."), "Dentist");
    await user.type(screen.getByLabelText("Saat (isteğe bağlı)"), "23:30");
    await user.selectOptions(screen.getByLabelText("Tür"), "event");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(createMutate).toHaveBeenCalledWith(
      {
        title: "Dentist",
        kind: "event",
        scheduledAt: "2026-10-16T23:30:00+03:00",
        dueAt: null,
      },
      expect.any(Object),
    );
  });

  it("opens ScheduleModal for a non-recurring item with its time prefilled", async () => {
    mockItems([makeItem({ id: "m1", title: "Plan", scheduledAt: "2026-10-15T16:45:00+03:00" })]);
    const user = userEvent.setup();
    render(<WeekPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Zamanla: Plan" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Saat")).toHaveValue("16:45");
  });
});
