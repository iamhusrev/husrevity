"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import {
  BiChevronLeft,
  BiChevronRight,
  BiCheck,
  BiTrash,
  BiTimeFive,
  BiCalendar,
  BiCheckCircle,
  BiX,
  BiPlus,
} from "react-icons/bi";
import { useCompleteItem, useCreateItem, useDeleteItem, useItemsInRange } from "@/hooks/useItems";
import { useIstanbulToday } from "@/hooks/useIstanbulToday";
import { useMonthDrop, DragItemPayload } from "./useMonthDrop";
import { alertStore } from "@/stores/alert-store";
import {
  buildMonthGrid,
  groupItemsByDay,
  monthRange,
  moveToDay,
  MonthGridCell,
} from "@/utils/month-grid";
import { minutesOfDayIstanbul, slotToIso } from "@/utils/today-board";
import { ItemResponse, ItemKind } from "@/types/item/item";
import ScheduleModal, { ScheduleModalItem } from "@/components/items/ScheduleModal";
import Dialog from "@/components/ui/Dialog";

const DND_TYPE = "MONTH_ITEM";

interface MonthPageProps {
  initialYear?: number;
  initialMonth?: number;
}

function formatIstanbulTime(iso: string): string {
  const mins = minutesOfDayIstanbul(iso);
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Returns formatted "HH:mm" in Europe/Istanbul, or null if timeless.
 *
 * Assumption: an item whose Istanbul time of day is exactly 00:00 carries no real time.
 * Tasks added without a time are stored with dueAt at 00:00 and all-day events created
 * from the add form get scheduledAt at 00:00, so midnight is rendered as timeless for
 * both fields. A genuine midnight appointment is indistinguishable and renders without time.
 */
function getItemDisplayTime(item: ItemResponse): string | null {
  const iso = item.scheduledAt ?? item.dueAt;
  if (!iso) return null;
  if (minutesOfDayIstanbul(iso) === 0) return null;
  return formatIstanbulTime(iso);
}

export function MonthPageView({ initialYear, initialMonth }: MonthPageProps) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || "tr";

  // Initial Istanbul year and month (1..12) come from today's date, which
  // ticks over at Istanbul midnight so a tab left open highlights the right day.
  const todayYmd = useIstanbulToday();
  const [todayYear, todayMonth] = useMemo(() => {
    const [y, m] = todayYmd.split("-").map(Number);
    return [y, m];
  }, [todayYmd]);

  const [year, setYear] = useState<number>(initialYear ?? todayYear);
  const [month, setMonth] = useState<number>(initialMonth ?? todayMonth);

  // Day panel state
  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null);
  const [schedulingItem, setSchedulingItem] = useState<
    (ScheduleModalItem & { initialTime?: string }) | null
  >(null);

  // Add item form state
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newKind, setNewKind] = useState<ItemKind>("task");

  // Grid range & items fetching
  const { fromYmd, toYmd } = useMemo(() => monthRange(year, month), [year, month]);
  const { data: items, isLoading, isFetching, isError, refetch } = useItemsInRange(fromYmd, toYmd);

  // buildMonthGrid reads the clock for `isToday`, so the grid depends on todayYmd too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month, todayYmd]);
  const weeks = useMemo(() => {
    const res: MonthGridCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      res.push(cells.slice(i, i + 7));
    }
    return res;
  }, [cells]);
  const groupedItems = useMemo(() => groupItemsByDay(items || []), [items]);

  // Mutations
  const completeMutation = useCompleteItem();
  const deleteMutation = useDeleteItem();
  const createMutation = useCreateItem();
  const { handleDropOnDay } = useMonthDrop();

  // Keyboard navigation across cells
  const [focusedCellIndex, setFocusedCellIndex] = useState<number>(0);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Clamp focusedCellIndex whenever cell count changes (e.g. 6-week to 5-week month)
  useEffect(() => {
    setFocusedCellIndex((idx) => {
      if (cells.length === 0) return 0;
      if (idx >= cells.length) return cells.length - 1;
      return Math.max(0, idx);
    });
  }, [cells.length]);

  // Navigation handlers
  const handlePrevMonth = () => {
    setFocusedCellIndex((idx) => Math.min(idx, 34));
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    setFocusedCellIndex((idx) => Math.min(idx, 34));
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    const [y, m] = todayYmd.split("-").map(Number);
    setYear(y);
    setMonth(m);
    setFocusedCellIndex(0);
  };

  // Month title formatted in active language under Europe/Istanbul
  const monthTitle = useMemo(() => {
    const date = new Date(Date.UTC(year, month - 1, 1));
    const formatter = new Intl.DateTimeFormat(currentLang, {
      month: "long",
      year: "numeric",
      timeZone: "Europe/Istanbul",
    });
    const str = formatter.format(date);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }, [year, month, currentLang]);

  // Focus and dialog tracking refs
  const originatingCellIndexRef = useRef<number | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const handleOpenPanel = useCallback((cellYmd: string, cellIndex: number) => {
    originatingCellIndexRef.current = cellIndex;
    setSelectedDayYmd(cellYmd);
  }, []);

  const selectedDayRef = useRef(selectedDayYmd);
  selectedDayRef.current = selectedDayYmd;

  const handleClosePanel = useCallback(() => {
    // Nothing to close: never move focus when no panel is open.
    if (!selectedDayRef.current) return;
    setSelectedDayYmd(null);
    if (originatingCellIndexRef.current !== null) {
      const idx = originatingCellIndexRef.current;
      cellRefs.current[idx]?.focus();
    }
  }, []);

  // Focus panel heading when panel opens
  useEffect(() => {
    if (selectedDayYmd) {
      panelHeadingRef.current?.focus();
    }
  }, [selectedDayYmd]);

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    index: number,
    cellYmd: string,
  ) => {
    let nextIndex = index;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = Math.max(0, index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = Math.min(cells.length - 1, index + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = Math.max(0, index - 7);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = Math.min(cells.length - 1, index + 7);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpenPanel(cellYmd, index);
      return;
    } else if (e.key === "Escape") {
      handleClosePanel();
      return;
    }

    if (nextIndex !== index) {
      setFocusedCellIndex(nextIndex);
      cellRefs.current[nextIndex]?.focus();
    }
  };

  // Handle Complete
  const handleComplete = (item: ItemResponse, dayYmd: string) => {
    completeMutation.mutate(
      { id: item.id, occursOn: dayYmd },
      {
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          alertStore.getState().show({
            title: t("month.error"),
            message: msg || t("month.error"),
            type: "error",
          });
        },
      },
    );
  };

  // Handle Delete
  const handleDelete = (item: ItemResponse) => {
    if (item.occursOn) return;
    const isTemplate = Boolean(item.rrule || (item as { isRecurring?: boolean }).isRecurring);
    if (isTemplate) {
      const ok = window.confirm(t("month.panel.deleteSeriesConfirm"));
      if (!ok) return;
    }
    deleteMutation.mutate(item.id, {
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        alertStore.getState().show({
          title: t("month.error"),
          message: msg || t("month.error"),
          type: "error",
        });
      },
    });
  };

  // Handle Add Item in Panel
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !selectedDayYmd) return;

    let scheduledAt: string | null = null;
    let dueAt: string | null = null;

    if (newTime) {
      const [h, m] = newTime.split(":").map(Number);
      const minutes = (h || 0) * 60 + (m || 0);
      scheduledAt = slotToIso(selectedDayYmd, minutes);
    } else {
      if (newKind === "event") {
        scheduledAt = slotToIso(selectedDayYmd, 0);
      } else {
        dueAt = slotToIso(selectedDayYmd, 0);
      }
    }

    createMutation.mutate(
      {
        title: newTitle.trim(),
        kind: newKind,
        scheduledAt,
        dueAt,
      },
      {
        onSuccess: () => {
          setNewTitle("");
          setNewTime("");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          alertStore.getState().show({
            title: t("month.error"),
            message: msg || t("month.error"),
            type: "error",
          });
        },
      },
    );
  };

  const weekdays = [
    t("month.weekdays.mon"),
    t("month.weekdays.tue"),
    t("month.weekdays.wed"),
    t("month.weekdays.thu"),
    t("month.weekdays.fri"),
    t("month.weekdays.sat"),
    t("month.weekdays.sun"),
  ];

  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)] p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1
            data-testid="month-heading"
            className="text-2xl sm:text-3xl font-serif italic text-gray-900 dark:text-white"
          >
            {monthTitle}
          </h1>
          {isFetching && !isLoading && (
            <span
              data-testid="month-subtle-loading"
              aria-label={t("month.loading")}
              className="inline-block h-2 w-2 rounded-full bg-brand-500 animate-pulse"
            />
          )}
          <button
            type="button"
            onClick={handleToday}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-xs transition hover:bg-gray-50 dark:border-white/10 dark:bg-husrev-shadow dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
          >
            {t("month.today")}
          </button>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-1 shadow-xs dark:border-white/10 dark:bg-husrev-shadow">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label={t("month.prevMonth")}
            className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
          >
            <BiChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label={t("month.nextMonth")}
            className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
          >
            <BiChevronRight size={20} />
          </button>
        </div>
      </header>

      {/* States: Loading / Error / Empty / Grid */}
      {isLoading ? (
        <div
          data-testid="month-grid-skeleton"
          className="grid grid-cols-7 gap-2 sm:gap-3 flex-1 animate-pulse"
        >
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="min-h-24 sm:min-h-32 rounded-2xl bg-gray-100 dark:bg-white/[0.03]"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("month.error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 cursor-pointer"
          >
            {t("month.retry")}
          </button>
        </div>
      ) : (
        <>
          {(!items || items.length === 0) && (
            <div className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
              {t("month.empty")}
            </div>
          )}
          <div role="grid" aria-label={monthTitle} className="flex-1 flex flex-col space-y-2">
            {/* Weekday Header */}
            <div
              role="row"
              className="grid grid-cols-7 gap-2 sm:gap-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 pb-1"
            >
              {weekdays.map((w, i) => (
                <div key={i} role="columnheader">
                  {w}
                </div>
              ))}
            </div>

            {/* Month Grid */}
            <div className="flex-1 flex flex-col gap-2 sm:gap-3">
              {weeks.map((weekCells, weekIdx) => (
                <div key={weekIdx} role="row" className="grid grid-cols-7 gap-2 sm:gap-3 flex-1">
                  {weekCells.map((cell, dayInWeekIdx) => {
                    const idx = weekIdx * 7 + dayInWeekIdx;
                    const dayItems = groupedItems[cell.ymd] || [];
                    const dayNumber = parseInt(cell.ymd.split("-")[2], 10);

                    const formattedDate = new Intl.DateTimeFormat(currentLang, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "Europe/Istanbul",
                    }).format(new Date(cell.ymd + "T12:00:00+03:00"));

                    return (
                      <MonthCell
                        key={cell.ymd}
                        cell={cell}
                        dayNumber={dayNumber}
                        dayItems={dayItems}
                        formattedDate={formattedDate}
                        index={idx}
                        focusedIndex={focusedCellIndex}
                        setRef={(el) => {
                          cellRefs.current[idx] = el;
                        }}
                        onKeyDown={(e) => handleCellKeyDown(e, idx, cell.ymd)}
                        onClick={() => handleOpenPanel(cell.ymd, idx)}
                        onDropItem={(dragged) => handleDropOnDay(dragged, cell.ymd)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Day Panel (Side sheet on desktop, bottom sheet on mobile) */}
      {selectedDayYmd && (
        <Dialog
          open={true}
          onClose={handleClosePanel}
          overlayClassName="fixed inset-0 z-50 flex items-end xl:items-stretch xl:justify-end bg-black/40 backdrop-blur-xs"
          panelClassName="w-full xl:max-w-md bg-white p-6 shadow-2xl dark:bg-husrev-shadow flex flex-col max-h-[70vh] xl:max-h-full xl:h-full rounded-t-2xl xl:rounded-t-none overflow-y-auto"
          labelledBy="day-panel-title"
          overlayProps={{ "data-testid": "day-panel" }}
        >
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-white/10">
            <div>
              <h2
                id="day-panel-title"
                ref={panelHeadingRef}
                tabIndex={-1}
                className="outline-none text-lg font-bold text-gray-900 dark:text-white"
              >
                {new Intl.DateTimeFormat(currentLang, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "Europe/Istanbul",
                }).format(new Date(selectedDayYmd + "T12:00:00+03:00"))}
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("month.panel.title")}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClosePanel}
              aria-label={t("common.close")}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
            >
              <BiX size={22} />
            </button>
          </div>

          {/* Small screen rescheduling hint */}
          <p className="xl:hidden pt-3 text-xs text-gray-500 dark:text-gray-400">
            {t("month.panel.mobileRescheduleHint")}
          </p>

          {/* Items List */}
          <div className="flex-1 py-4 space-y-2.5 overflow-y-auto">
            {(groupedItems[selectedDayYmd] || []).length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                {t("month.panel.empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {(groupedItems[selectedDayYmd] || []).map((item) => (
                  <li
                    key={`${item.id}-${item.occursOn ?? ""}-${item.scheduledAt ?? item.dueAt ?? ""}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50 dark:border-white/5 dark:bg-white/[0.02]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            item.kind === "event"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              : "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                          }`}
                        >
                          {item.kind === "event"
                            ? t("month.panel.kindEvent")
                            : t("month.panel.kindTask")}
                        </span>
                        <p
                          className={`text-sm font-semibold truncate ${
                            item.status === "done"
                              ? "line-through text-gray-400 dark:text-gray-500"
                              : "text-gray-800 dark:text-white/90"
                          }`}
                        >
                          {item.title}
                        </p>
                      </div>
                      {getItemDisplayTime(item) && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {getItemDisplayTime(item)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.status !== "done" && (
                        <button
                          type="button"
                          onClick={() => handleComplete(item, selectedDayYmd)}
                          aria-label={t("month.panel.complete")}
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                        >
                          <BiCheck size={18} />
                        </button>
                      )}
                      {Boolean(
                        item.rrule ||
                        item.occursOn ||
                        (item as { isRecurring?: boolean }).isRecurring,
                      ) ? (
                        <span
                          title={t("today.board.recurringTaskTooltip")}
                          className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium text-gray-400 bg-gray-50 dark:bg-white/[0.04] dark:text-gray-500 cursor-default"
                        >
                          {t("today.board.recurringTask")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const initialTime = getItemDisplayTime(item) ?? undefined;
                            setSchedulingItem({
                              id: item.id,
                              title: item.title,
                              durationMin: item.durationMin,
                              initialTime,
                            });
                          }}
                          aria-label={t("month.panel.reschedule")}
                          className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30 cursor-pointer"
                        >
                          <BiTimeFive size={18} />
                        </button>
                      )}
                      {item.occursOn ? (
                        <span
                          title={t("month.panel.occurrenceDeleteHint")}
                          className="inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-medium text-gray-400 bg-gray-50 dark:bg-white/[0.04] dark:text-gray-500 cursor-default"
                        >
                          {t("month.panel.occurrenceDeleteHint")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          aria-label={t("month.panel.delete")}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <BiTrash size={18} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Item Form */}
          <form
            onSubmit={handleAddItem}
            className="pt-4 border-t border-gray-100 dark:border-white/10 space-y-3"
          >
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t("month.panel.addItem")}
            </h3>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("month.panel.titlePlaceholder")}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="month-add-time"
                  className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  {t("month.panel.timeOptional")}
                </label>
                <input
                  id="month-add-time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="month-add-kind"
                  className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  {t("month.panel.kind")}
                </label>
                <select
                  id="month-add-kind"
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as ItemKind)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
                >
                  <option value="task">{t("month.panel.kindTask")}</option>
                  <option value="event">{t("month.panel.kindEvent")}</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full rounded-xl bg-brand-500 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50 cursor-pointer"
            >
              {t("month.panel.submit")}
            </button>
          </form>
        </Dialog>
      )}

      {/* Reschedule Modal */}
      {schedulingItem && selectedDayYmd && (
        <ScheduleModal
          item={schedulingItem}
          todayDate={selectedDayYmd}
          initialTime={schedulingItem.initialTime}
          onClose={() => setSchedulingItem(null)}
          onScheduled={() => setSchedulingItem(null)}
        />
      )}
    </div>
  );
}

// ─── Month Cell with Drop Target ─────────────────────────────────────────────

interface MonthCellProps {
  cell: MonthGridCell;
  dayNumber: number;
  dayItems: ItemResponse[];
  formattedDate: string;
  index: number;
  focusedIndex: number;
  setRef: (el: HTMLDivElement | null) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onClick: () => void;
  onDropItem: (dragged: DragItemPayload) => void;
}

function MonthCell({
  cell,
  dayNumber,
  dayItems,
  formattedDate,
  index,
  focusedIndex,
  setRef,
  onKeyDown,
  onClick,
  onDropItem,
}: MonthCellProps) {
  const { t } = useTranslation();
  const [{ isOver, canDrop }, dropRef] = useDrop<
    DragItemPayload,
    void,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: DND_TYPE,
      canDrop: (dragged) => dragged.fromYmd !== cell.ymd,
      drop: (dragged) => {
        onDropItem(dragged);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [cell.ymd, onDropItem],
  );

  const displayChips = dayItems.slice(0, 3);
  const overflowCount = dayItems.length > 3 ? dayItems.length - 3 : 0;

  return (
    <div
      ref={(el) => {
        setRef(el);
        dropRef(el);
      }}
      tabIndex={focusedIndex === index ? 0 : -1}
      role="gridcell"
      data-testid={`cell-${cell.ymd}`}
      data-today={cell.isToday ? "true" : undefined}
      aria-label={t("month.cellAriaLabel", {
        date: formattedDate,
        count: dayItems.length,
      })}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`min-h-24 sm:min-h-32 rounded-2xl border p-2 flex flex-col justify-between transition outline-none cursor-pointer select-none ${
        cell.inMonth
          ? "bg-white border-gray-100 dark:bg-husrev-shadow dark:border-white/[0.04]"
          : "bg-gray-50/60 border-gray-100/50 opacity-40 dark:bg-white/[0.01] dark:border-white/[0.02]"
      } ${
        cell.isToday
          ? "ring-2 ring-husrev-amber border-husrev-amber"
          : "hover:border-brand-300 dark:hover:border-brand-500/30"
      } ${isOver && canDrop ? "bg-brand-50/40 border-brand-400" : ""}`}
    >
      {/* Day number header + density dots */}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-semibold rounded-full h-6 w-6 flex items-center justify-center ${
            cell.isToday
              ? "bg-husrev-ember text-white dark:bg-husrev-amber dark:text-husrev-ink"
              : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {dayNumber}
        </span>

        {/* Density dots (mobile & desktop) */}
        {dayItems.length > 0 && (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: Math.min(dayItems.length, 3) }).map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-brand-500/70" />
            ))}
          </div>
        )}
      </div>

      {/* Chips list on desktop (hidden on mobile < xl) */}
      <div className="hidden xl:flex flex-col gap-1 mt-1 flex-1 overflow-hidden">
        {displayChips.map((item) => (
          <MonthItemChip
            key={`${item.id}-${item.occursOn ?? ""}-${item.scheduledAt ?? item.dueAt ?? ""}`}
            item={item}
            cellYmd={cell.ymd}
          />
        ))}

        {overflowCount > 0 && (
          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 px-1">
            {t("month.overflowChip", { count: overflowCount })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Drag Chip Component ─────────────────────────────────────────────────────

function MonthItemChip({ item, cellYmd }: { item: ItemResponse; cellYmd: string }) {
  const { t } = useTranslation();
  const isRecurring = Boolean(item.rrule || item.occursOn);

  const [{ isDragging }, dragRef] = useDrag<DragItemPayload, void, { isDragging: boolean }>(
    () => ({
      type: DND_TYPE,
      canDrag: () => !isRecurring,
      item: {
        id: item.id,
        title: item.title,
        fromYmd: cellYmd,
        item,
      },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [item, cellYmd, isRecurring],
  );

  const isDone = item.status === "done";

  return (
    <div
      ref={(el) => {
        if (!isRecurring) {
          dragRef(el);
        }
      }}
      data-chip="true"
      data-draggable={isRecurring ? "false" : "true"}
      data-completed={isDone ? "true" : "false"}
      title={isRecurring ? t("today.board.recurringTaskTooltip") : undefined}
      className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[10.5px] truncate transition ${
        item.kind === "event"
          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
          : "bg-gray-100 text-gray-800 dark:bg-white/[0.04] dark:text-gray-200"
      } ${isDragging ? "opacity-30" : "opacity-100"}`}
    >
      {getItemDisplayTime(item) && (
        <span className="text-[9px] font-mono opacity-60 shrink-0">{getItemDisplayTime(item)}</span>
      )}
      <span className={`truncate font-medium ${isDone ? "line-through opacity-60" : ""}`}>
        {item.title}
      </span>
    </div>
  );
}

/**
 * Top-level MonthPage exported with DndProvider wrapped.
 */
export default function MonthPage(props: MonthPageProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <MonthPageView {...props} />
    </DndProvider>
  );
}
