import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import InboxPage from "./InboxPage";
import * as useItemsModule from "@/hooks/useItems";
import * as useProjectsModule from "@/hooks/useProjects";
import * as useGoalsModule from "@/hooks/useGoals";
import { QuickAddContext } from "@/providers/QuickAddContext";
import { ItemResponse } from "@/types/item/item";

const TEMPLATES: Record<string, string> = {
  "inbox.title": "Gelen Kutusu",
  "inbox.subtitle": "Alt başlık",
  "inbox.loading": "Yükleniyor…",
  "inbox.error": "Gelen kutusu yüklenemedi.",
  "inbox.retry": "Tekrar dene",
  "inbox.empty": "Gelen kutusu boş",
  "inbox.emptyHint": "İpucu",
  "inbox.capture": "Hızlı ekle",
  "inbox.count": "{{count}} öğe",
  "inbox.setDate": "Tarih ata",
  "inbox.dateLabel": "Tarih",
  "inbox.timeOptional": "Saat (isteğe bağlı)",
  "inbox.saveDate": "Kaydet",
  "inbox.schedule": "Zamanla",
  "inbox.attachProject": "Projeye ekle",
  "inbox.projectLabel": "Proje",
  "inbox.projectPlaceholder": "Proje seç",
  "inbox.noProjects": "Henüz proje yok.",
  "inbox.attachGoal": "Hedefe ekle",
  "inbox.goalLabel": "Hedef",
  "inbox.goalPlaceholder": "Hedef seç",
  "inbox.noGoals": "Aktif hedef yok.",
  "goals.horizon.year": "Yıl",
  "goals.horizon.quarter": "Çeyrek",
  "goals.horizon.month": "Ay",
  "inbox.attach": "Ekle",
  "inbox.complete": "Tamamla",
  "inbox.delete": "Sil",
  "inbox.cancel": "Vazgeç",
  "inbox.actionsFor": "{{title}} için işlemler",
  "inbox.deleteConfirm": "Silinsin mi?",
  "inbox.errorAction": "İşlem tamamlanamadı.",
  "today.board.scheduleModalTitle": "İşi zamanla",
  "today.board.timeLabel": "Saat",
  "today.board.durationLabel": "Süre",
  "today.board.confirm": "Onayla",
  "today.board.cancel": "İptal",
  "today.board.minuteOption": "{{count}} dk",
};

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) =>
        (TEMPLATES[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k] ?? "")),
      i18n: { language: "tr" },
    }),
  };
});

function makeItem(overrides: Partial<ItemResponse>): ItemResponse {
  return {
    id: "1",
    kind: "task",
    title: "Loose task",
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

describe("InboxPage", () => {
  const updateMutate = vi.fn();
  const completeMutate = vi.fn();
  const deleteMutate = vi.fn();
  const scheduleMutate = vi.fn();
  const openQuickAdd = vi.fn();
  let mutationsPending = false;

  function mockInbox(
    data: ItemResponse[] | undefined,
    state: Partial<{ isLoading: boolean; isError: boolean; refetch: () => void }> = {},
  ) {
    vi.spyOn(useItemsModule, "useInboxItems").mockReturnValue({
      data,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      ...state,
    } as never);
  }

  function mockProjects(data: unknown[]) {
    vi.spyOn(useProjectsModule, "useProjects").mockReturnValue({ data } as never);
  }

  function renderPage() {
    return render(
      <QuickAddContext.Provider
        value={{ open: false, setOpen: vi.fn(), openQuickAdd, closeQuickAdd: vi.fn() }}
      >
        <InboxPage />
      </QuickAddContext.Provider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mutationsPending = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-10-14 23:30 UTC is already 2026-10-15 02:30 in Istanbul.
    vi.setSystemTime(new Date("2026-10-14T23:30:00Z"));
    vi.spyOn(useItemsModule, "useUpdateItemFields").mockImplementation(
      () => ({ mutate: updateMutate, isPending: mutationsPending }) as never,
    );
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({
      mutate: completeMutate,
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useDeleteItem").mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as never);
    vi.spyOn(useItemsModule, "useScheduleItem").mockReturnValue({
      mutate: scheduleMutate,
      isPending: false,
    } as never);
    mockProjects([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the loading skeleton", () => {
    mockInbox(undefined, { isLoading: true });
    renderPage();
    expect(screen.getByTestId("inbox-skeleton")).toBeInTheDocument();
  });

  it("renders the error state and retries", async () => {
    const refetch = vi.fn();
    mockInbox(undefined, { isError: true, refetch });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the empty state and the capture entry point opens quick add", async () => {
    mockInbox([]);
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText("Gelen kutusu boş")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hızlı ekle" }));
    expect(openQuickAdd).toHaveBeenCalled();
  });

  it("lists the inbox rows with a count", () => {
    mockInbox([makeItem({ id: "1", title: "A" }), makeItem({ id: "2", title: "B" })]);
    renderPage();
    expect(screen.getByTestId("inbox-count")).toHaveTextContent("2 öğe");
    expect(screen.getByTestId("inbox-row-1")).toHaveTextContent("A");
    expect(screen.getByTestId("inbox-row-2")).toHaveTextContent("B");
  });

  it("sets a date: writes dueAt at Istanbul midnight, defaulting to the Istanbul today", async () => {
    mockInbox([makeItem({ id: "7", title: "Call bank" })]);
    const user = userEvent.setup();
    renderPage();

    const row = screen.getByTestId("inbox-row-7");
    await user.click(within(row).getByRole("button", { name: "Tarih ata" }));
    expect(within(row).getByLabelText("Tarih")).toHaveValue("2026-10-15");
    await user.click(within(row).getByRole("button", { name: "Kaydet" }));

    expect(updateMutate).toHaveBeenCalledWith(
      { id: "7", body: { dueAt: "2026-10-15T00:00:00+03:00" } },
      expect.any(Object),
    );
  });

  it("leaves update failures to the hook so only one alert is shown", async () => {
    mockInbox([makeItem({ id: "7", title: "Call bank" })]);
    const user = userEvent.setup();
    renderPage();

    const row = screen.getByTestId("inbox-row-7");
    await user.click(within(row).getByRole("button", { name: "Tarih ata" }));
    await user.click(within(row).getByRole("button", { name: "Kaydet" }));

    const [, options] = updateMutate.mock.calls[0];
    expect(options).not.toHaveProperty("onError");
  });

  it("moves the default date to the new Istanbul day after midnight without a remount", () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    // 20:59:30 UTC = 23:59:30 Istanbul on 2026-10-14.
    vi.setSystemTime(new Date("2026-10-14T20:59:30Z"));
    mockInbox([makeItem({ id: "7", title: "Call bank" })]);
    renderPage();

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    const row = screen.getByTestId("inbox-row-7");
    fireEvent.click(within(row).getByRole("button", { name: "Tarih ata" }));
    expect(within(row).getByLabelText("Tarih")).toHaveValue("2026-10-15");
  });

  it("sets a date with a time on a chosen day and only writes dueAt", async () => {
    mockInbox([makeItem({ id: "7", title: "Call bank" })]);
    const user = userEvent.setup();
    renderPage();

    const row = screen.getByTestId("inbox-row-7");
    await user.click(within(row).getByRole("button", { name: "Tarih ata" }));
    const date = within(row).getByLabelText("Tarih");
    await user.clear(date);
    await user.type(date, "2026-11-02");
    await user.type(within(row).getByLabelText("Saat (isteğe bağlı)"), "23:30");
    await user.click(within(row).getByRole("button", { name: "Kaydet" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [vars] = updateMutate.mock.calls[0];
    expect(vars.body).toEqual({ dueAt: "2026-11-02T23:30:00+03:00" });
    expect(vars.body).not.toHaveProperty("scheduledAt");
  });

  it("attaches to a project by sending projectId as a string and lists only writable projects", async () => {
    mockInbox([makeItem({ id: "7", title: "Draft" })]);
    mockProjects([
      { id: 11, name: "Alpha", role: "OWNER", archived: false },
      { id: 12, name: "ReadOnly", role: "VIEWER", archived: false },
      { id: 13, name: "Old", role: "OWNER", archived: true },
      { id: 14, name: "Beta", role: "EDITOR", archived: false },
    ]);
    const user = userEvent.setup();
    renderPage();

    const row = screen.getByTestId("inbox-row-7");
    await user.click(within(row).getByRole("button", { name: "Projeye ekle" }));
    const select = within(row).getByLabelText("Proje");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Proje seç",
      "Alpha",
      "Beta",
    ]);
    await user.selectOptions(select, "14");
    await user.click(within(row).getByRole("button", { name: "Ekle" }));

    expect(updateMutate).toHaveBeenCalledWith(
      { id: "7", body: { projectId: "14" } },
      expect.any(Object),
    );
  });

  it("opens ScheduleModal for the row's task", async () => {
    mockInbox([makeItem({ id: "7", title: "Plan trip" })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(within(screen.getByTestId("inbox-row-7")).getByRole("button", { name: "Zamanla" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Plan trip")).toBeInTheDocument();
  });

  it("completes a task with its id only", async () => {
    mockInbox([makeItem({ id: "7", title: "Done soon" })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Tamamla: Done soon" }));
    expect(completeMutate).toHaveBeenCalledWith({ id: "7" }, expect.any(Object));
  });

  it("deletes only after confirmation", async () => {
    mockInbox([makeItem({ id: "7", title: "Junk" })]);
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    renderPage();

    await user.click(screen.getByRole("button", { name: "Sil: Junk" }));
    expect(deleteMutate).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Sil: Junk" }));
    expect(deleteMutate).toHaveBeenCalledWith("7", expect.any(Object));
  });

  it("disables every action while a mutation is pending", () => {
    mutationsPending = true;
    mockInbox([makeItem({ id: "7", title: "Busy" })]);
    renderPage();

    const row = screen.getByTestId("inbox-row-7");
    within(row)
      .getAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());
  });

  it("never offers date, schedule or delete actions for a recurring row", () => {
    mockInbox([makeItem({ id: "9", title: "Series", rrule: "FREQ=DAILY" })]);
    renderPage();

    const row = screen.getByTestId("inbox-row-9");
    expect(within(row).queryByRole("button", { name: "Tarih ata" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Zamanla" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Sil: Series" })).toBeNull();
  });

  describe("attach to a goal", () => {
    function mockGoals(data: unknown[]) {
      return vi.spyOn(useGoalsModule, "useGoals").mockReturnValue({ data } as never);
    }

    it("lists active goals from the Istanbul today on and sends goalId", async () => {
      mockInbox([makeItem({ id: "7", title: "Draft" })]);
      const goalsSpy = mockGoals([
        { id: "21", title: "Ship v2", horizon: "quarter" },
        { id: "22", title: "Read more", horizon: "month" },
      ]);
      const user = userEvent.setup();
      renderPage();

      const row = screen.getByTestId("inbox-row-7");
      await user.click(within(row).getByRole("button", { name: "Hedefe ekle" }));
      // 23:30 UTC on Oct 14 is already Oct 15 in Istanbul.
      expect(goalsSpy).toHaveBeenCalledWith({ status: "active", from: "2026-10-15", limit: 200 });

      const select = within(row).getByLabelText("Hedef");
      expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Hedef seç",
        "Ship v2 · Çeyrek",
        "Read more · Ay",
      ]);
      await user.selectOptions(select, "21");
      await user.click(within(row).getByRole("button", { name: "Ekle" }));

      expect(updateMutate).toHaveBeenCalledWith(
        { id: "7", body: { goalId: "21" } },
        expect.any(Object),
      );
      const [, options] = updateMutate.mock.calls[0];
      expect(options).not.toHaveProperty("onError");
    });

    it("says so when there is no active goal", async () => {
      mockInbox([makeItem({ id: "7", title: "Draft" })]);
      mockGoals([]);
      const user = userEvent.setup();
      renderPage();
      const row = screen.getByTestId("inbox-row-7");
      await user.click(within(row).getByRole("button", { name: "Hedefe ekle" }));
      expect(within(row).getByText("Aktif hedef yok.")).toBeInTheDocument();
    });

    it("is hidden for a recurring row", () => {
      mockInbox([makeItem({ id: "9", title: "Series", rrule: "FREQ=DAILY" })]);
      mockGoals([]);
      renderPage();
      expect(
        within(screen.getByTestId("inbox-row-9")).queryByRole("button", { name: "Hedefe ekle" }),
      ).toBeNull();
    });

    it("is disabled while a mutation is pending", () => {
      mutationsPending = true;
      mockInbox([makeItem({ id: "7", title: "Busy" })]);
      mockGoals([]);
      renderPage();
      expect(
        within(screen.getByTestId("inbox-row-7")).getByRole("button", { name: "Hedefe ekle" }),
      ).toBeDisabled();
    });

    it("does not send anything when the goal is not chosen", async () => {
      mockInbox([makeItem({ id: "7", title: "Draft" })]);
      mockGoals([{ id: "21", title: "Ship v2", horizon: "quarter" }]);
      const user = userEvent.setup();
      renderPage();
      const row = screen.getByTestId("inbox-row-7");
      await user.click(within(row).getByRole("button", { name: "Hedefe ekle" }));
      expect(within(row).getByRole("button", { name: "Ekle" })).toBeDisabled();
    });
  });
});
