import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import TodayBoard, { handleTimelineSchedule, ScheduleModal } from "./TodayBoard";
import * as useTodayModule from "@/hooks/useToday";
import * as useItemsModule from "@/hooks/useItems";
import * as useRoutineModule from "@/hooks/useRoutine";
import { alertStore } from "@/stores/alert-store";
import { ItemSummary, TimelineEntry, TodayResponse } from "@/types/today/today";
import { RoutineSegmentResponse } from "@/types/routine/routine";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: { count?: number }) => {
        const map: Record<string, string> = {
          "today.loading": "Loading…",
          "today.empty": "Nothing for today.",
          "today.board.pendingTitle": "Pending items",
          "today.board.pendingEmpty": "No pending items.",
          "today.board.schedule": "Schedule",
          "today.board.scheduleModalTitle": "Schedule item",
          "today.board.timeLabel": "Time",
          "today.board.durationLabel": "Duration",
          "today.board.confirm": "Schedule",
          "today.board.cancel": "Cancel",
          "today.board.retry": "Retry",
          "today.board.error": "Failed to load today's data.",
          "today.board.taskBadge": "Task",
          "today.board.recurringTask": "Recurring",
          "today.board.recurringTaskTooltip": "Recurring tasks cannot be scheduled directly",
          "today.board.minutesSuffix": "min",
          "today.board.minuteOption": `${opts?.count ?? 30} min`,
          "common.done": "Done",
          "common.error": "Error",
        };
        return map[key] ?? key;
      },
    }),
  };
});

type UseTodayResult = ReturnType<typeof useTodayModule.useToday>;
type UseScheduleResult = ReturnType<typeof useItemsModule.useScheduleItem>;
type UseCompleteResult = ReturnType<typeof useItemsModule.useCompleteItem>;
type UseRoutineResult = ReturnType<typeof useRoutineModule.useRoutineSegments>;

const mockTodayData: TodayResponse = {
  date: "2026-10-12", // Monday (bit 0 = 1)
  currentBlock: null,
  timeline: [
    {
      itemId: "evt-1",
      title: "Team Standup",
      kind: "event",
      scheduledAt: "2026-10-12T10:00:00+03:00", // 10:00 = 600 minutes
      durationMin: 60,
    },
  ],
  dueToday: [
    {
      itemId: "task-1",
      title: "Pay monthly bill",
      dueAt: "2026-10-12T18:00:00+03:00",
      status: "open",
      isRecurring: false,
      durationMin: null,
    },
  ],
  suggestion: null,
};

const mockRoutineSegments: RoutineSegmentResponse[] = [
  {
    id: "seg-mon",
    name: "Focus Work",
    startMinute: 540, // 09:00
    endMinute: 720, // 12:00
    theme: "Deep work",
    colorToken: "husrev-amber",
    notes: null,
    position: 0,
    daysOfWeek: 1, // Monday only
    activities: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "seg-tue",
    name: "Tuesday Routine",
    startMinute: 540,
    endMinute: 720,
    theme: null,
    colorToken: "husrev-moss",
    notes: null,
    position: 1,
    daysOfWeek: 2, // Tuesday only
    activities: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

function makeToday(overrides: Partial<TodayResponse> = {}): TodayResponse {
  return { ...mockTodayData, ...overrides };
}

function makePending(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return { ...mockTodayData.dueToday[0], ...overrides };
}

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return { ...mockTodayData.timeline[0], ...overrides };
}

function mockToday(
  data: TodayResponse | undefined,
  extra: { isLoading?: boolean; isError?: boolean; refetch?: () => void } = {},
) {
  return vi.spyOn(useTodayModule, "useToday").mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as unknown as UseTodayResult);
}

function mockSchedule(
  mutate: (payload: unknown, options?: { onError?: (err: unknown) => void }) => void = vi.fn(),
  isPending = false,
) {
  return vi.spyOn(useItemsModule, "useScheduleItem").mockReturnValue({
    mutate,
    isPending,
  } as unknown as UseScheduleResult);
}

describe("TodayBoard", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.clearAllMocks();
    alertStore.getState().close();

    mockToday(mockTodayData);

    vi.spyOn(useRoutineModule, "useRoutineSegments").mockReturnValue({
      data: mockRoutineSegments,
      isLoading: false,
      isError: false,
    } as unknown as UseRoutineResult);

    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as UseCompleteResult);

    mockSchedule();
  });

  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <TodayBoard />
    </QueryClientProvider>
  );

  const renderBoard = () => render(tree());

  const openScheduleDialog = async (
    user: ReturnType<typeof userEvent.setup>,
    title = "Pay monthly bill",
  ) => {
    const trigger = screen.getByRole("button", { name: new RegExp(`Schedule.*${title}`, "i") });
    await user.click(trigger);
    return trigger;
  };

  it("renders loading skeleton while loading", () => {
    mockToday(undefined, { isLoading: true });

    renderBoard();
    expect(screen.getByTestId("today-board-loading")).toBeInTheDocument();
  });

  it("renders error state with retry button", async () => {
    const user = userEvent.setup();
    const refetchMock = vi.fn();
    mockToday(undefined, { isError: true, refetch: refetchMock });

    renderBoard();
    expect(screen.getByText("Failed to load today's data.")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    await user.click(retryBtn);
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when timeline and dueToday are empty", () => {
    mockToday(makeToday({ timeline: [], dueToday: [] }));

    renderBoard();
    expect(screen.getByText("Nothing for today.")).toBeInTheDocument();
  });

  it("renders timeline entries at computed positions", () => {
    renderBoard();

    const entry = screen.getByText("Team Standup");
    expect(entry).toBeInTheDocument();
    // 10:00 = 600 minutes from midnight => top: 600px (with 1px/min)
    const entryCard = entry.closest("[data-timeline-entry]");
    expect(entryCard).toBeInTheDocument();
    expect(entryCard).toHaveStyle({ top: "600px" });
  });

  it("renders Evkat band for today's weekday only", () => {
    renderBoard();

    // Focus Work is for Monday (active)
    expect(screen.getByText("Focus Work")).toBeInTheDocument();
    // Tuesday Routine is for Tuesday (inactive on Monday 2026-10-12)
    expect(screen.queryByText("Tuesday Routine")).not.toBeInTheDocument();
  });

  it("pending rows keep the complete button and send today's date as occursOn", async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as unknown as UseCompleteResult);

    renderBoard();

    const completeBtn = screen.getByRole("button", { name: /Done.*Pay monthly bill/i });
    await user.click(completeBtn);

    expect(mutateMock).toHaveBeenCalledWith(
      { id: "task-1", occursOn: "2026-10-12" },
      expect.any(Object),
    );
  });

  it("non-drag fallback 'Schedule' button opens modal and schedules with time and duration", async () => {
    const user = userEvent.setup();
    const scheduleMock = vi.fn();
    mockSchedule(scheduleMock);

    renderBoard();

    await openScheduleDialog(user);

    // Modal opens
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Set time to 14:15
    const timeInput = screen.getByLabelText(/Time/i);
    await user.clear(timeInput);
    await user.type(timeInput, "14:15");

    // Select duration 45
    const durationSelect = screen.getByLabelText(/Duration/i);
    await user.selectOptions(durationSelect, "45");

    // Click confirm
    const confirmBtn = screen.getByRole("button", { name: /^Schedule$/i });
    await user.click(confirmBtn);

    // 14:15 Istanbul time on 2026-10-12 => "2026-10-12T14:15:00+03:00"
    expect(scheduleMock).toHaveBeenCalledWith(
      {
        id: "task-1",
        scheduledAt: "2026-10-12T14:15:00+03:00",
        durationMin: 45,
      },
      expect.any(Object),
    );
  });

  describe("schedule dialog duration select", () => {
    const optionValues = () =>
      within(screen.getByLabelText(/Duration/i))
        .getAllByRole("option")
        .map((o) => (o as HTMLOptionElement).value);

    it("shows an initial duration outside the fixed options as a selected extra option and submits it", async () => {
      const user = userEvent.setup();
      const scheduleMock = vi.fn();
      mockSchedule(scheduleMock);
      mockToday(makeToday({ dueToday: [makePending({ durationMin: 20 })] }));

      renderBoard();
      await openScheduleDialog(user);

      const option = screen.getByRole("option", { name: "20 min" }) as HTMLOptionElement;
      expect(option.selected).toBe(true);
      expect(screen.getByLabelText(/Duration/i)).toHaveValue("20");
      // extra option is kept in sorted order
      expect(optionValues()).toEqual(["15", "20", "30", "45", "60", "90", "120"]);

      await user.click(screen.getByRole("button", { name: /^Schedule$/i }));

      expect(scheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "task-1", durationMin: 20 }),
        expect.any(Object),
      );
    });

    it.each([25, 50, 150])(
      "adds %i as an option in sorted position and submits what is displayed",
      async (minutes) => {
        const user = userEvent.setup();
        const scheduleMock = vi.fn();
        mockSchedule(scheduleMock);
        mockToday(makeToday({ dueToday: [makePending({ durationMin: minutes })] }));

        renderBoard();
        await openScheduleDialog(user);

        const expected = [15, 30, 45, 60, 90, 120, minutes].sort((a, b) => a - b).map(String);
        expect(optionValues()).toEqual(expected);
        expect(screen.getByLabelText(/Duration/i)).toHaveValue(String(minutes));

        await user.click(screen.getByRole("button", { name: /^Schedule$/i }));
        expect(scheduleMock).toHaveBeenCalledWith(
          expect.objectContaining({ durationMin: minutes }),
          expect.any(Object),
        );
      },
    );

    it("keeps the fixed options and selection when the initial duration is one of them", async () => {
      const user = userEvent.setup();
      const scheduleMock = vi.fn();
      mockSchedule(scheduleMock);
      mockToday(makeToday({ dueToday: [makePending({ durationMin: 30 })] }));

      renderBoard();
      await openScheduleDialog(user);

      expect(optionValues()).toEqual(["15", "30", "45", "60", "90", "120"]);
      expect(screen.getByLabelText(/Duration/i)).toHaveValue("30");

      await user.click(screen.getByRole("button", { name: /^Schedule$/i }));
      expect(scheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({ durationMin: 30 }),
        expect.any(Object),
      );
    });

    it("with no initial duration shows 30 and submits the picked duration", async () => {
      const user = userEvent.setup();
      const scheduleMock = vi.fn();
      mockSchedule(scheduleMock);

      renderBoard();
      await openScheduleDialog(user);

      expect(optionValues()).toEqual(["15", "30", "45", "60", "90", "120"]);
      expect(screen.getByLabelText(/Duration/i)).toHaveValue("30");

      await user.selectOptions(screen.getByLabelText(/Duration/i), "60");
      await user.click(screen.getByRole("button", { name: /^Schedule$/i }));

      expect(scheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "task-1", durationMin: 60 }),
        expect.any(Object),
      );
    });
  });

  describe("schedule dialog accessibility", () => {
    it("exposes a modal dialog and focuses the time input when opened", async () => {
      const user = userEvent.setup();
      renderBoard();
      await openScheduleDialog(user);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(screen.getByLabelText(/Time/i)).toHaveFocus();
    });

    it("closes on Escape and restores focus to the trigger", async () => {
      const user = userEvent.setup();
      renderBoard();
      const trigger = await openScheduleDialog(user);
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("closes on backdrop click but not on clicks inside the dialog content", async () => {
      const user = userEvent.setup();
      renderBoard();
      const trigger = await openScheduleDialog(user);

      await user.click(screen.getByText("Schedule item"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // The dialog role sits on the panel; the backdrop is its parent.
      await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("restores focus to the trigger when closed with Cancel", async () => {
      const user = userEvent.setup();
      renderBoard();
      const trigger = await openScheduleDialog(user);

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  describe("handleTimelineSchedule (drop handler simulation)", () => {
    it("snaps minutes to 15-min interval, formats ISO instant, and omits duration if not provided", () => {
      const scheduleMock = vi.fn();

      // Drop at minute 607 (10:07) -> snaps to 600 (10:00)
      handleTimelineSchedule({
        mutate: scheduleMock,
        dateYmd: "2026-10-12",
        itemId: "task-1",
        rawMinutes: 607,
      });

      expect(scheduleMock).toHaveBeenCalledWith(
        {
          id: "task-1",
          scheduledAt: "2026-10-12T10:00:00+03:00",
        },
        expect.any(Object),
      );
    });

    it("respects existing item durationMin if provided", () => {
      const scheduleMock = vi.fn();

      // Drop at minute 850 (14:10) -> snaps to 855 (14:15)
      handleTimelineSchedule({
        mutate: scheduleMock,
        dateYmd: "2026-10-12",
        itemId: "task-1",
        rawMinutes: 850,
        durationMin: 45,
      });

      expect(scheduleMock).toHaveBeenCalledWith(
        {
          id: "task-1",
          scheduledAt: "2026-10-12T14:15:00+03:00",
          durationMin: 45,
        },
        expect.any(Object),
      );
    });
  });

  it("renders scheduled task on 24-hr axis with task badge, and excludes it from pending items (H1)", () => {
    mockToday(
      makeToday({
        timeline: [
          makeEntry({
            itemId: "task-sched-1",
            title: "Scheduled Task Item",
            kind: "task",
            scheduledAt: "2026-10-12T11:00:00+03:00",
            durationMin: 45,
          }),
        ],
        dueToday: [
          makePending({
            itemId: "task-sched-1",
            title: "Scheduled Task Item",
            durationMin: 45,
          }),
          makePending({
            itemId: "task-unsched-2",
            title: "Unscheduled Task",
            dueAt: "2026-10-12T19:00:00+03:00",
          }),
        ],
      }),
    );

    renderBoard();

    // Scheduled task has a "Task" badge on the timeline
    expect(screen.getByText("Scheduled Task Item")).toBeInTheDocument();
    expect(screen.getByText("Task")).toBeInTheDocument();

    // In the pending list, only Unscheduled Task appears
    expect(screen.getByText("Unscheduled Task")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Schedule.*Scheduled Task Item/i }),
    ).not.toBeInTheDocument();
  });

  it("calculates exact CSS style strings in 2-column overlap layout (H2)", () => {
    mockToday(
      makeToday({
        timeline: [
          makeEntry({
            itemId: "evt-a",
            title: "Overlapping Event A",
            scheduledAt: "2026-10-12T10:00:00+03:00",
            durationMin: 60,
          }),
          makeEntry({
            itemId: "evt-b",
            title: "Overlapping Event B",
            scheduledAt: "2026-10-12T10:30:00+03:00",
            durationMin: 60,
          }),
        ],
        dueToday: [],
      }),
    );

    renderBoard();

    const cardA = screen.getByText("Overlapping Event A").closest("[data-timeline-entry]");
    const cardB = screen.getByText("Overlapping Event B").closest("[data-timeline-entry]");
    expect(cardA).toBeInTheDocument();
    expect(cardB).toBeInTheDocument();

    expect(cardA).toHaveStyle({
      left: "calc(3.5rem + (100% - 3.5rem) * 0)",
      width: "calc((100% - 3.5rem) / 2 - 4px)",
    });
    expect(cardB).toHaveStyle({
      left: "calc(3.5rem + (100% - 3.5rem) * 0.5)",
      width: "calc((100% - 3.5rem) / 2 - 4px)",
    });
  });

  it("recurring items in pending rows show recurring label, no schedule button, and cannot be dragged (M5)", () => {
    mockToday(
      makeToday({
        timeline: [],
        dueToday: [
          makePending({
            itemId: "rec-task-1",
            title: "Daily Standup Routine",
            dueAt: "2026-10-12T09:00:00+03:00",
            isRecurring: true,
            durationMin: 15,
          }),
        ],
      }),
    );

    renderBoard();

    expect(
      screen.getByRole("button", { name: /Done.*Daily Standup Routine/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /Schedule.*Daily Standup Routine/i }),
    ).not.toBeInTheDocument();

    expect(screen.getByText("Recurring")).toBeInTheDocument();
  });

  it("keeps schedule modal open and shows alert when schedule mutation fails (M7)", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(alertStore.getState(), "show");

    mockSchedule(
      vi.fn((_payload: unknown, options?: { onError?: (err: unknown) => void }) => {
        alertStore.getState().show({
          title: "Error",
          message: "Network timeout",
          type: "error",
        });
        options?.onError?.(new Error("Network timeout"));
      }),
    );

    renderBoard();

    await openScheduleDialog(user);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /^Schedule$/i });
    await user.click(confirmBtn);

    // Modal stays open
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Alert was shown
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: "Network timeout",
      }),
    );
  });

  it("calls scrollTo only once when date loads, and does not re-scroll on rerender (M8)", () => {
    const scrollToMock = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollToMock;

    const { rerender } = renderBoard();

    expect(scrollToMock).toHaveBeenCalledTimes(1);

    // Rerender with same data
    rerender(tree());

    expect(scrollToMock).toHaveBeenCalledTimes(1);
  });

  it("disables the pending row buttons only for the item being scheduled", () => {
    vi.spyOn(useItemsModule, "useScheduleItem").mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      variables: { id: "task-1", scheduledAt: "2026-10-12T10:00:00+03:00" },
    } as unknown as UseScheduleResult);
    mockToday(
      makeToday({
        dueToday: [
          makePending(),
          makePending({ itemId: "task-2", title: "Other task" }),
        ],
      }),
    );

    renderBoard();

    expect(screen.getByRole("button", { name: /Done.*Pay monthly bill/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Done.*Other task/i })).toBeEnabled();
  });

  // The Istanbul formatters pin the product timezone, so the rendered board must be identical no
  // matter which zone the process (browser) runs in. vitest uses `pool: 'forks'`, which is what
  // makes the runtime `process.env.TZ` stub effective.
  describe.each([
    { zone: "UTC", localHourOfFixedInstant: 7 },
    { zone: "Europe/Istanbul", localHourOfFixedInstant: 10 },
    { zone: "America/Los_Angeles", localHourOfFixedInstant: 0 },
  ])("zone independence under TZ=$zone", ({ zone, localHourOfFixedInstant }) => {
    // 2026-10-12T07:00:00Z = 10:00 in Istanbul (600 minutes)
    const FIXED_INSTANT = "2026-10-12T07:00:00Z";
    // 2026-10-12T09:30:00Z = 12:30 in Istanbul (750 minutes)
    const NOW = "2026-10-12T09:30:00Z";

    beforeEach(() => {
      vi.stubEnv("TZ", zone);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(NOW));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it("really runs the process in the stubbed zone", () => {
      expect(new Date(FIXED_INSTANT).getHours()).toBe(localHourOfFixedInstant);
    });

    it("displays the entry at 10:00 with a 600px top", () => {
      mockToday(makeToday({ timeline: [makeEntry({ scheduledAt: FIXED_INSTANT })] }));

      renderBoard();

      const card = screen.getByLabelText("Team Standup (10:00)");
      expect(card).toHaveStyle({ top: "600px" });
      expect(within(card).getByText(/^10:00/)).toBeInTheDocument();
    });

    it("positions the now line at the Istanbul minute of the fixed system time", () => {
      renderBoard();

      expect(screen.getByTestId("now-line")).toHaveStyle({ top: "750px" });
    });

    it("defaults the schedule dialog time to the Istanbul time of now", async () => {
      const user = userEvent.setup();
      renderBoard();

      await openScheduleDialog(user);

      expect(screen.getByLabelText(/Time/i)).toHaveValue("12:30");
    });

    it("places an instant that is another calendar day in Los Angeles on the Istanbul day", () => {
      // 2026-10-13T05:00:00Z = 08:00 on 2026-10-13 in Istanbul, but 22:00 on 2026-10-12 in Los Angeles
      mockToday(
        makeToday({
          date: "2026-10-13",
          timeline: [makeEntry({ scheduledAt: "2026-10-13T05:00:00Z" })],
        }),
      );

      renderBoard();

      const card = screen.getByLabelText("Team Standup (08:00)");
      expect(card).toHaveStyle({ top: "480px" });
    });

    it("drops an instant that falls on the previous Istanbul day from today's timeline", () => {
      // 2026-10-12T22:00:00Z = 01:00 on 2026-10-13 in Istanbul (not on board date 2026-10-12),
      // although it is still 2026-10-12 in UTC and in Los Angeles
      mockToday(
        makeToday({
          timeline: [makeEntry({ scheduledAt: "2026-10-12T22:00:00Z" })],
        }),
      );

      renderBoard();

      expect(screen.queryByText("Team Standup")).not.toBeInTheDocument();
    });
  });
});

describe("TodayBoard ScheduleModal wrapper", () => {
  const baseItem: ItemSummary = {
    itemId: "rec-1",
    title: "Daily review",
    dueAt: "2026-10-12T09:00:00+03:00",
    status: "open",
    isRecurring: true,
    durationMin: 15,
  };

  function renderModal(item: ItemSummary) {
    const queryClient = new QueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <ScheduleModal
          item={item}
          todayDate="2026-10-12"
          onClose={vi.fn()}
          onScheduled={vi.fn()}
        />
      </QueryClientProvider>,
    );
  }

  it("forwards isRecurring so a recurring item gets the read-only dialog", () => {
    renderModal(baseItem);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Recurring tasks cannot be scheduled directly"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Time")).not.toBeInTheDocument();
  });

  it("keeps the time form for a non-recurring item", () => {
    renderModal({ ...baseItem, isRecurring: false });
    expect(within(screen.getByRole("dialog")).getByLabelText("Time")).toBeInTheDocument();
  });
});
