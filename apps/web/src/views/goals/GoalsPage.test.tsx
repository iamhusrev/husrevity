import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import GoalsPage from "./GoalsPage";
import QuickAddDialog from "@/components/quick-add/QuickAddDialog";
import * as useGoalsModule from "@/hooks/useGoals";
import * as useItemsModule from "@/hooks/useItems";
import * as useNoteLinksModule from "@/hooks/useNoteLinks";
import { GoalResponse } from "@/types/goal/goal";
import { ItemResponse } from "@/types/item/item";

const showUndoToast = vi.fn();
vi.mock("@/stores/alert-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/alert-store")>();
  return { ...actual, showUndoToast: (...args: unknown[]) => showUndoToast(...args) };
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) =>
        opts ? `${key}${JSON.stringify(opts)}` : key,
      i18n: { language: "en" },
    }),
  };
});

function goal(overrides: Partial<GoalResponse> & { id: string }): GoalResponse {
  return {
    ownerId: "1",
    title: `Goal ${overrides.id}`,
    notes: null,
    horizon: "month",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    parentGoalId: null,
    status: "active",
    progress: { total: 0, done: 0, open: 0, percent: 0 },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function item(overrides: Partial<ItemResponse> & { id: string }): ItemResponse {
  return {
    kind: "task",
    title: `Item ${overrides.id}`,
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

const YEAR = goal({
  id: "1",
  title: "Year goal",
  horizon: "year",
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  progress: { total: 7, done: 3, open: 4, percent: 43 },
});
const Q4 = goal({
  id: "2",
  title: "Q4 goal",
  horizon: "quarter",
  periodStart: "2026-10-01",
  periodEnd: "2026-12-31",
  parentGoalId: "1",
});
const OCT = goal({ id: "3", title: "October goal", parentGoalId: "2" });

describe("GoalsPage", () => {
  const updateMutate = vi.fn();
  const deleteMutate = vi.fn();
  const restoreMutate = vi.fn();
  const createMutate = vi.fn();
  const completeMutate = vi.fn();
  let pending = false;
  let goalsData: GoalResponse[] | undefined;
  let goalsState: { isLoading?: boolean; isError?: boolean };
  const refetch = vi.fn();
  let goalItems: ItemResponse[];

  beforeEach(() => {
    vi.clearAllMocks();
    pending = false;
    goalItems = [];
    goalsData = [YEAR, Q4, OCT];
    goalsState = {};
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    vi.spyOn(useGoalsModule, "useGoals").mockImplementation(
      () => ({ data: goalsData, refetch, ...goalsState }) as never,
    );
    vi.spyOn(useGoalsModule, "useUpdateGoal").mockImplementation(
      () => ({ mutate: updateMutate, isPending: pending }) as never,
    );
    vi.spyOn(useGoalsModule, "useDeleteGoal").mockImplementation(
      () => ({ mutate: deleteMutate, isPending: false }) as never,
    );
    vi.spyOn(useGoalsModule, "useRestoreGoal").mockImplementation(
      () => ({ mutate: restoreMutate, isPending: false }) as never,
    );
    vi.spyOn(useGoalsModule, "useCreateGoal").mockImplementation(
      () => ({ mutate: createMutate, isPending: false }) as never,
    );
    vi.spyOn(useItemsModule, "useGoalItems").mockImplementation(
      () => ({ data: goalItems, isLoading: false, isError: false }) as never,
    );
    vi.spyOn(useItemsModule, "useCompleteItem").mockImplementation(
      () => ({ mutate: completeMutate, isPending: false }) as never,
    );
    vi.spyOn(useNoteLinksModule, "useNotesLinkedTo").mockImplementation(
      () =>
        ({
          data: [{ id: "55", title: "Linked note", updatedAt: "2026-10-01T00:00:00Z" }],
          isLoading: false,
          isError: false,
        }) as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the Istanbul year, filters by that year and defaults to active goals", () => {
    render(<GoalsPage />);
    expect(screen.getByTestId("goals-year")).toHaveTextContent("2026");
    expect(useGoalsModule.useGoals).toHaveBeenCalledWith({
      status: "active",
      from: "2026-01-01",
      to: "2026-12-31",
      limit: 200,
    });
  });

  it("moves between years and back to this year", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);
    await user.click(screen.getByRole("button", { name: "goals.nextYear" }));
    expect(screen.getByTestId("goals-year")).toHaveTextContent("2027");
    expect(useGoalsModule.useGoals).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: "2027-01-01", to: "2027-12-31" }),
    );
    await user.click(screen.getByRole("button", { name: "goals.thisYear" }));
    expect(screen.getByTestId("goals-year")).toHaveTextContent("2026");
  });

  it("passes the selected status filter, and nothing for 'all'", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);
    await user.selectOptions(screen.getByLabelText("goals.statusFilter"), "all");
    expect(useGoalsModule.useGoals).toHaveBeenLastCalledWith({
      status: undefined,
      from: "2026-01-01",
      to: "2026-12-31",
      limit: 200,
    });
    await user.selectOptions(screen.getByLabelText("goals.statusFilter"), "done");
    expect(useGoalsModule.useGoals).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "done" }),
    );
  });

  it("renders the goals as a tree with levels, expanded state and progress", () => {
    render(<GoalsPage />);
    const tree = screen.getByRole("tree");
    const items = within(tree).getAllByRole("treeitem");
    expect(items).toHaveLength(3);
    const yearItem = screen.getByTestId("goal-node-1");
    expect(yearItem).toHaveAttribute("aria-level", "1");
    expect(yearItem).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("goal-node-2")).toHaveAttribute("aria-level", "2");
    expect(screen.getByTestId("goal-node-3")).toHaveAttribute("aria-level", "3");
    // A leaf has no aria-expanded.
    expect(screen.getByTestId("goal-node-3")).not.toHaveAttribute("aria-expanded");

    const bar = within(yearItem).getAllByRole("progressbar")[0];
    expect(bar).toHaveAttribute("aria-valuenow", "43");
    expect(within(yearItem).getAllByText("3/7 · 43%").length).toBeGreaterThan(0);
    // 0/0 renders as a dash.
    expect(within(screen.getByTestId("goal-node-3")).getByText("—")).toBeInTheDocument();
  });

  it("announces an empty goal with the translated 'no work yet' text, not a dash", () => {
    render(<GoalsPage />);
    const bar = within(screen.getByTestId("goal-node-3")).getAllByRole("progressbar")[0];
    expect(bar).toHaveAttribute("aria-valuetext", "goals.noWorkYet");
  });

  it("shows a status badge with text, not only colour", () => {
    goalsData = [goal({ id: "9", status: "done" })];
    render(<GoalsPage />);
    expect(within(screen.getByTestId("goal-node-9")).getByText("goals.status.done")).toBeVisible();
  });

  it("shows loading, error with retry, and an empty hint with a call to action", async () => {
    goalsState = { isLoading: true };
    goalsData = undefined;
    const { unmount } = render(<GoalsPage />);
    expect(screen.getByTestId("goals-skeleton")).toBeInTheDocument();
    unmount();

    goalsState = { isError: true };
    const second = render(<GoalsPage />);
    fireEvent.click(screen.getByRole("button", { name: "goals.retry" }));
    expect(refetch).toHaveBeenCalled();
    second.unmount();

    goalsState = {};
    goalsData = [];
    render(<GoalsPage />);
    const empty = screen.getByTestId("goals-empty");
    expect(within(empty).getByRole("button", { name: "goals.newGoal" })).toBeInTheDocument();
  });

  it("hints that the list is truncated when the API returned 200 rows", () => {
    goalsData = Array.from({ length: 200 }, (_, i) => goal({ id: String(i + 10) }));
    render(<GoalsPage />);
    expect(screen.getByTestId("goals-truncated")).toBeInTheDocument();
  });

  it("marks a goal done, dropped and reopens it with one update each", async () => {
    const user = userEvent.setup();
    goalsData = [goal({ id: "9", title: "Solo" })];
    const { rerender } = render(<GoalsPage />);
    await user.click(screen.getByRole("button", { name: "goals.markDone: Solo" }));
    expect(updateMutate).toHaveBeenLastCalledWith({ id: "9", body: { status: "done" } });
    await user.click(screen.getByRole("button", { name: "goals.drop: Solo" }));
    expect(updateMutate).toHaveBeenLastCalledWith({ id: "9", body: { status: "dropped" } });

    goalsData = [goal({ id: "9", title: "Solo", status: "done" })];
    rerender(<GoalsPage />);
    await user.click(screen.getByRole("button", { name: "goals.reopen: Solo" }));
    expect(updateMutate).toHaveBeenLastCalledWith({ id: "9", body: { status: "active" } });
  });

  it("ignores status changes while a mutation is pending", async () => {
    pending = true;
    goalsData = [goal({ id: "9", title: "Solo" })];
    render(<GoalsPage />);
    const btn = screen.getByRole("button", { name: "goals.markDone: Solo" });
    expect(btn).toBeDisabled();
  });

  it("deletes a goal and offers an undo that restores it", async () => {
    const user = userEvent.setup();
    goalsData = [goal({ id: "9", title: "Solo" })];
    deleteMutate.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<GoalsPage />);
    await user.click(screen.getByRole("button", { name: "goals.delete: Solo" }));
    expect(deleteMutate).toHaveBeenCalledWith("9", expect.anything());
    expect(showUndoToast).toHaveBeenCalledTimes(1);
    const arg = showUndoToast.mock.calls[0][0] as { onUndo: () => void };
    arg.onUndo();
    expect(restoreMutate).toHaveBeenCalledWith("9");
  });

  it("supports keyboard navigation: arrows move, Enter opens the detail, Escape closes it", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);
    const first = screen.getByTestId("goal-node-1");
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByTestId("goal-node-2")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByTestId("goal-node-3")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByTestId("goal-node-2")).toHaveFocus();

    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Q4 goal")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Focus returns to the tree item that opened the panel.
    expect(screen.getByTestId("goal-node-2")).toHaveFocus();
  });

  it("collapses and expands a node with ArrowLeft/ArrowRight", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);
    screen.getByTestId("goal-node-1").focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("goal-node-1")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("goal-node-2")).not.toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("goal-node-1")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("goal-node-2")).toBeInTheDocument();
  });

  describe("detail panel", () => {
    async function openDetail(user: ReturnType<typeof userEvent.setup>) {
      screen.getByTestId("goal-node-3").focus();
      await user.keyboard("{Enter}");
      return screen.getByRole("dialog");
    }

    it("lists linked work with Istanbul time and completes an open item", async () => {
      const user = userEvent.setup();
      goalItems = [item({ id: "11", title: "Write plan", scheduledAt: "2026-10-20T20:30:00Z" })];
      render(<GoalsPage />);
      const dialog = await openDetail(user);
      const row = within(dialog).getByTestId("goal-item-11");
      // 20:30Z is 23:30 on Oct 20 in Istanbul.
      expect(row).toHaveTextContent("2026-10-20");
      expect(row).toHaveTextContent("23:30");
      await user.click(within(row).getByRole("button", { name: /goals\.detail\.complete/ }));
      expect(completeMutate).toHaveBeenCalledWith({ id: "11" }, expect.anything());
    });

    it("does not offer completing a recurring template, and has no reschedule or delete", async () => {
      const user = userEvent.setup();
      goalItems = [item({ id: "12", title: "Weekly review", rrule: "FREQ=WEEKLY" })];
      render(<GoalsPage />);
      const dialog = await openDetail(user);
      const row = within(dialog).getByTestId("goal-item-12");
      expect(within(row).queryByRole("button", { name: /goals\.detail\.complete/ })).toBeNull();
      expect(within(row).getByText(/goals\.detail\.recurring/)).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: /delete/i })).toBeNull();
    });

    it("completes an expanded occurrence with its occursOn date", async () => {
      const user = userEvent.setup();
      goalItems = [item({ id: "13", title: "Gym", rrule: "FREQ=DAILY", occursOn: "2026-10-15" })];
      render(<GoalsPage />);
      const dialog = await openDetail(user);
      const row = within(dialog).getByTestId("goal-item-13");
      await user.click(within(row).getByRole("button", { name: /goals\.detail\.complete/ }));
      expect(completeMutate).toHaveBeenCalledWith(
        { id: "13", occursOn: "2026-10-15" },
        expect.anything(),
      );
    });

    it("announces an empty goal in the panel progress bar with the translated text", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      const dialog = await openDetail(user);
      const bar = within(dialog).getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuetext", "goals.noWorkYet");
    });

    it("links to linked notes", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      const dialog = await openDetail(user);
      const link = within(dialog).getByRole("link", { name: "Linked note" });
      expect(link).toHaveAttribute("href", "/notes/55");
    });

    it("traps Tab inside the panel", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      const dialog = await openDetail(user);
      const focusables = within(dialog).getAllByRole("button");
      focusables[focusables.length - 1].focus();
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  describe("layered Escape", () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <GoalsPage />
          <button type="button" onClick={() => setOpen(true)}>
            open-quick-add
          </button>
          <QuickAddDialog open={open} onOpenChange={setOpen} />
        </>
      );
    }

    it("closes quick add first, then the goal panel", async () => {
      const user = userEvent.setup();
      vi.spyOn(useItemsModule, "useQuickAddPreview").mockImplementation(
        () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, data: undefined }) as never,
      );
      vi.spyOn(useItemsModule, "useCreateItem").mockImplementation(
        () => ({ mutate: vi.fn(), isPending: false }) as never,
      );
      render(<Harness />);
      screen.getByTestId("goal-node-3").focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("dialog", { name: "October goal" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "open-quick-add" }));
      expect(screen.getAllByRole("dialog")).toHaveLength(2);

      await user.keyboard("{Escape}");
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "October goal" })).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("goal form", () => {
    it("creates a goal from the calendar picker with the real period", async () => {
      const user = userEvent.setup();
      goalsData = [YEAR];
      render(<GoalsPage />);
      await user.click(screen.getByRole("button", { name: "goals.newGoal" }));
      const dialog = screen.getByRole("dialog");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.horizon"), "month");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.month"), "2");
      await user.type(within(dialog).getByLabelText("goals.field.title"), "Feb goal");
      await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Feb goal",
          horizon: "month",
          periodStart: "2026-02-01",
          periodEnd: "2026-02-28",
          parentGoalId: null,
        }),
        expect.anything(),
      );
    });

    it("converts the picked month to its quarter and back when the horizon changes", async () => {
      const user = userEvent.setup();
      goalsData = [YEAR];
      render(<GoalsPage />);
      await user.click(screen.getByRole("button", { name: "goals.newGoal" }));
      const dialog = screen.getByRole("dialog");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.horizon"), "month");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.month"), "5");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.horizon"), "quarter");
      // May belongs to Q2, not Q4.
      expect(within(dialog).getByLabelText("goals.field.quarter")).toHaveValue("2");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.horizon"), "month");
      // Q2 starts in April.
      expect(within(dialog).getByLabelText("goals.field.month")).toHaveValue("4");
    });

    it("limits the parent select to valid parents", async () => {
      const user = userEvent.setup();
      goalsData = [YEAR, Q4, OCT];
      render(<GoalsPage />);
      await user.click(screen.getByRole("button", { name: "goals.newGoal" }));
      const dialog = screen.getByRole("dialog");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.horizon"), "month");
      await user.selectOptions(within(dialog).getByLabelText("goals.field.month"), "11");
      const parent = within(dialog).getByLabelText("goals.field.parent");
      const labels = within(parent)
        .getAllByRole("option")
        .map((o) => o.textContent);
      // Year goal and Q4 contain November; the October month goal does not qualify.
      expect(labels.some((l) => l?.includes("Year goal"))).toBe(true);
      expect(labels.some((l) => l?.includes("Q4 goal"))).toBe(true);
      expect(labels.some((l) => l?.includes("October goal"))).toBe(false);
    });

    it("blocks a blank title client side and does not call the API", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByRole("button", { name: "goals.newGoal" }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
      expect(createMutate).not.toHaveBeenCalled();
      expect(within(dialog).getByText("goals.errors.titleRequired")).toBeInTheDocument();
    });

    it("shows the server error inline", async () => {
      const user = userEvent.setup();
      createMutate.mockImplementation((_b: unknown, opts?: { onError?: (e: unknown) => void }) =>
        opts?.onError?.(new Error("Parent goal must contain the period")),
      );
      render(<GoalsPage />);
      await user.click(screen.getByRole("button", { name: "goals.newGoal" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("goals.field.title"), "X");
      await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Parent goal must contain the period",
      );
    });

    it("edits an existing goal and sends the changed fields", async () => {
      const user = userEvent.setup();
      goalsData = [goal({ id: "9", title: "Solo" })];
      render(<GoalsPage />);
      await user.click(screen.getByRole("button", { name: "goals.edit: Solo" }));
      const dialog = screen.getByRole("dialog");
      const title = within(dialog).getByLabelText("goals.field.title");
      await user.clear(title);
      await user.type(title, "Solo renamed");
      await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
      expect(updateMutate).toHaveBeenCalledWith(
        {
          id: "9",
          body: expect.objectContaining({
            title: "Solo renamed",
            horizon: "month",
            periodStart: "2026-10-01",
            periodEnd: "2026-10-31",
          }),
        },
        expect.anything(),
      );
    });

    describe("parent handling when editing", () => {
      type Candidates = { data?: GoalResponse[]; isLoading?: boolean; isError?: boolean };

      function mockCandidates(candidates: Candidates) {
        // The page list always passes a status key; the dialog's candidate query never does.
        vi.spyOn(useGoalsModule, "useGoals").mockImplementation(((
          filter?: Record<string, unknown>,
        ) =>
          filter && "status" in filter
            ? { data: goalsData, refetch }
            : { refetch, ...candidates }) as never);
      }

      async function openEditOctober(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByRole("button", { name: "goals.edit: October goal" }));
        return screen.getByRole("dialog");
      }

      it("does not send parentGoalId when saving before the candidates arrive", async () => {
        const user = userEvent.setup();
        mockCandidates({ data: undefined, isLoading: true });
        render(<GoalsPage />);
        const dialog = await openEditOctober(user);
        const parent = within(dialog).getByLabelText("goals.field.parent");
        expect(parent).toBeDisabled();
        expect(parent).toHaveDisplayValue(/Q4 goal/);
        await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
        expect(updateMutate).toHaveBeenCalledTimes(1);
        const body = updateMutate.mock.calls[0][0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty("parentGoalId");
      });

      it("does not detach the parent when the candidates query fails", async () => {
        const user = userEvent.setup();
        mockCandidates({ data: undefined, isError: true });
        render(<GoalsPage />);
        const dialog = await openEditOctober(user);
        expect(within(dialog).getByLabelText("goals.field.parent")).toBeDisabled();
        await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
        const body = updateMutate.mock.calls[0][0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty("parentGoalId");
      });

      it("does not send parentGoalId when the parent was not touched", async () => {
        const user = userEvent.setup();
        mockCandidates({ data: [YEAR, Q4] });
        render(<GoalsPage />);
        const dialog = await openEditOctober(user);
        expect(within(dialog).getByLabelText("goals.field.parent")).toHaveDisplayValue(/Q4 goal/);
        await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
        const body = updateMutate.mock.calls[0][0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty("parentGoalId");
      });

      it("sends null when the user explicitly chooses no parent", async () => {
        const user = userEvent.setup();
        mockCandidates({ data: [YEAR, Q4] });
        render(<GoalsPage />);
        const dialog = await openEditOctober(user);
        await user.selectOptions(within(dialog).getByLabelText("goals.field.parent"), "");
        await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
        expect(updateMutate.mock.calls[0][0].body).toEqual(
          expect.objectContaining({ parentGoalId: null }),
        );
      });

      it("sends the new parent when the user picks another valid one", async () => {
        const user = userEvent.setup();
        mockCandidates({ data: [YEAR, Q4] });
        render(<GoalsPage />);
        const dialog = await openEditOctober(user);
        await user.selectOptions(within(dialog).getByLabelText("goals.field.parent"), "1");
        await user.click(within(dialog).getByRole("button", { name: "goals.save" }));
        expect(updateMutate.mock.calls[0][0].body).toEqual(
          expect.objectContaining({ parentGoalId: "1" }),
        );
      });
    });

    it("closes only the form on Escape, and returns focus to the trigger", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      const trigger = screen.getByRole("button", { name: "goals.newGoal" });
      await user.click(trigger);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
