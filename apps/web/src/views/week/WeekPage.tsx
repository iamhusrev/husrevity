"use client";

import React, { useCallback, useMemo, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import { BiCheck, BiChevronLeft, BiChevronRight, BiPlus, BiTimeFive } from "react-icons/bi";
import { useIstanbulToday } from "@/hooks/useIstanbulToday";
import { useCompleteItem, useCreateItem, useItemsInRange } from "@/hooks/useItems";
import { DragItemPayload, useMonthDrop } from "@/views/month/useMonthDrop";
import { alertStore } from "@/stores/alert-store";
import { groupItemsByDay } from "@/utils/month-grid";
import { slotToIso } from "@/utils/today-board";
import {
  buildWeek,
  itemTimeLabel,
  loadLevel,
  loadMinutes,
  shiftWeek,
  sortByTime,
  weekRange,
  weekSummary,
  WEEK_DAY_CAPACITY_MIN,
  LoadLevel,
  WeekDayCell,
} from "@/utils/week-grid";
import { ItemKind, ItemResponse } from "@/types/item/item";
import ScheduleModal, { ScheduleModalItem } from "@/components/items/ScheduleModal";

const DND_TYPE = "WEEK_ITEM";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const LEVEL_CLASS: Record<LoadLevel, string> = {
  ok: "bg-brand-500",
  warn: "bg-amber-500",
  over: "bg-red-500",
};

function isRecurringItem(item: ItemResponse): boolean {
  return Boolean(item.rrule || item.occursOn || (item as { isRecurring?: boolean }).isRecurring);
}

interface WeekPageProps {
  /** Any Istanbul day (YYYY-MM-DD) inside the week to show first. Defaults to today. */
  initialYmd?: string;
}

interface SchedulingState extends ScheduleModalItem {
  ymd: string;
  initialTime?: string;
}

export function WeekPageView({ initialYmd }: WeekPageProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "tr";

  const todayYmd = useIstanbulToday();
  const [anchorYmd, setAnchorYmd] = useState<string>(initialYmd ?? todayYmd);
  const [addingYmd, setAddingYmd] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<SchedulingState | null>(null);

  // todayYmd is a dependency so the "today" highlight follows the Istanbul date.
  const days = useMemo(() => buildWeek(anchorYmd), [anchorYmd, todayYmd]);
  const { fromYmd, toYmd } = useMemo(() => weekRange(anchorYmd), [anchorYmd]);

  const { data: items, isLoading, isFetching, isError, refetch } = useItemsInRange(fromYmd, toYmd);
  const grouped = useMemo(() => groupItemsByDay(items ?? []), [items]);
  const summary = useMemo(
    () =>
      weekSummary(
        items ?? [],
        todayYmd,
        days.map((d) => d.ymd),
      ),
    [items, todayYmd, days],
  );

  const completeMutation = useCompleteItem();
  const { handleDropOnDay, isPending: dropPending } = useMonthDrop();

  const showError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      alertStore.getState().show({
        title: t("week.error"),
        message: msg || t("week.error"),
        type: "error",
      });
    },
    [t],
  );

  const handleComplete = (item: ItemResponse, dayYmd: string) => {
    if (completeMutation.isPending) return;
    completeMutation.mutate({ id: item.id, occursOn: dayYmd }, { onError: showError });
  };

  const handleDrop = (dragged: DragItemPayload, targetYmd: string) => {
    // Recurring rows never move: rewriting scheduledAt would re-anchor the whole series.
    if (isRecurringItem(dragged.item)) return;
    if (dropPending || completeMutation.isPending) return;
    handleDropOnDay(dragged, targetYmd);
  };

  const formatDay = useCallback(
    (ymd: string) =>
      new Intl.DateTimeFormat(lang, {
        day: "numeric",
        month: "long",
        timeZone: "Europe/Istanbul",
      }).format(new Date(`${ymd}T12:00:00+03:00`)),
    [lang],
  );

  const formatDuration = useCallback(
    (minutes: number) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours > 0 && mins > 0) {
        return t("week.durationHoursMinutes", { hours, minutes: mins });
      }
      if (hours > 0) return t("week.durationHours", { count: hours });
      return t("week.durationMinutes", { count: mins });
    },
    [t],
  );

  const rangeTitle = useMemo(() => {
    const year = new Intl.DateTimeFormat(lang, { year: "numeric", timeZone: "Europe/Istanbul" }).format(
      new Date(`${toYmd}T12:00:00+03:00`),
    );
    return `${formatDay(fromYmd)} – ${formatDay(toYmd)} ${year}`;
  }, [fromYmd, toYmd, lang, formatDay]);

  const isThisWeek = days.some((d) => d.ymd === todayYmd);
  const hasAnyItems = days.some((d) => (grouped[d.ymd] ?? []).length > 0);

  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)] p-4 sm:p-6 lg:p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1
            data-testid="week-heading"
            className="text-2xl sm:text-3xl font-serif italic text-gray-900 dark:text-white"
          >
            {rangeTitle}
          </h1>
          {isFetching && !isLoading && (
            <span
              data-testid="week-subtle-loading"
              aria-label={t("week.loading")}
              className="inline-block h-2 w-2 rounded-full bg-brand-500 animate-pulse"
            />
          )}
          <button
            type="button"
            onClick={() => setAnchorYmd(todayYmd)}
            disabled={isThisWeek}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-xs transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-husrev-shadow dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer disabled:cursor-default"
          >
            {t("week.thisWeek")}
          </button>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-1 shadow-xs dark:border-white/10 dark:bg-husrev-shadow">
          <button
            type="button"
            onClick={() => setAnchorYmd((y) => shiftWeek(y, -1))}
            aria-label={t("week.prevWeek")}
            className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
          >
            <BiChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => setAnchorYmd((y) => shiftWeek(y, 1))}
            aria-label={t("week.nextWeek")}
            className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
          >
            <BiChevronRight size={20} />
          </button>
        </div>
      </header>

      {isLoading ? (
        <div
          data-testid="week-skeleton"
          className="grid grid-cols-1 xl:grid-cols-7 gap-3 flex-1 animate-pulse"
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="min-h-32 rounded-2xl bg-gray-100 dark:bg-white/[0.03]" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("week.error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 cursor-pointer"
          >
            {t("week.retry")}
          </button>
        </div>
      ) : (
        <>
          <section
            aria-label={t("week.summary.label")}
            data-testid="week-summary"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {(["total", "done", "open", "slipped"] as const).map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-white/[0.04] dark:bg-husrev-shadow"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t(`week.summary.${key}`)}
                </p>
                <p
                  data-testid={`week-summary-${key}`}
                  className={`mt-1 text-2xl font-semibold ${
                    key === "slipped" && summary.slipped > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-gray-900 dark:text-white"
                  }`}
                >
                  {summary[key]}
                </p>
              </div>
            ))}
          </section>

          {!hasAnyItems && (
            <div
              data-testid="week-empty"
              className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-gray-500 dark:border-white/10 dark:text-gray-400"
            >
              {t("week.empty")}
            </div>
          )}

          <p className="hidden xl:block text-xs text-gray-500 dark:text-gray-400">
            {t("week.dragHint")}
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-7 gap-3 flex-1">
            {days.map((day) => {
              const dayItems = sortByTime(grouped[day.ymd] ?? []);
              return (
                <WeekColumn
                  key={day.ymd}
                  day={day}
                  weekdayName={t(`week.weekdays.${WEEKDAY_KEYS[day.weekdayIndex]}`)}
                  dateLabel={formatDay(day.ymd)}
                  items={dayItems}
                  formatDuration={formatDuration}
                  isAdding={addingYmd === day.ymd}
                  onToggleAdd={() => setAddingYmd((cur) => (cur === day.ymd ? null : day.ymd))}
                  onDropItem={(dragged) => handleDrop(dragged, day.ymd)}
                  onComplete={(item) => handleComplete(item, day.ymd)}
                  onSchedule={(item) =>
                    setScheduling({
                      id: item.id,
                      title: item.title,
                      durationMin: item.durationMin,
                      ymd: day.ymd,
                      initialTime: itemTimeLabel(item) ?? undefined,
                    })
                  }
                  onAdded={() => setAddingYmd(null)}
                />
              );
            })}
          </div>
        </>
      )}

      {scheduling && (
        <ScheduleModal
          item={scheduling}
          todayDate={scheduling.ymd}
          initialTime={scheduling.initialTime}
          onClose={() => setScheduling(null)}
          onScheduled={() => setScheduling(null)}
        />
      )}
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

interface WeekColumnProps {
  day: WeekDayCell;
  weekdayName: string;
  dateLabel: string;
  items: ItemResponse[];
  formatDuration: (minutes: number) => string;
  isAdding: boolean;
  onToggleAdd: () => void;
  onDropItem: (dragged: DragItemPayload) => void;
  onComplete: (item: ItemResponse) => void;
  onSchedule: (item: ItemResponse) => void;
  onAdded: () => void;
}

function WeekColumn({
  day,
  weekdayName,
  dateLabel,
  items,
  formatDuration,
  isAdding,
  onToggleAdd,
  onDropItem,
  onComplete,
  onSchedule,
  onAdded,
}: WeekColumnProps) {
  const { t } = useTranslation();
  const [{ isOver, canDrop }, dropRef] = useDrop<
    DragItemPayload,
    void,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: DND_TYPE,
      canDrop: (dragged) => dragged.fromYmd !== day.ymd,
      drop: (dragged) => onDropItem(dragged),
      collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
    }),
    [day.ymd, onDropItem],
  );

  const minutes = loadMinutes(items);
  const level = loadLevel(minutes);
  const ratio = Math.min(minutes / WEEK_DAY_CAPACITY_MIN, 1);
  const headingId = `week-day-${day.ymd}`;
  const ariaLabel = t("week.dayAriaLabel", {
    date: `${weekdayName} ${dateLabel}`,
    count: items.length,
    duration: formatDuration(minutes),
  });

  return (
    <div
      ref={(el) => {
        dropRef(el);
      }}
      role="group"
      data-testid={`week-day-${day.ymd}`}
      data-today={day.isToday ? "true" : undefined}
      aria-label={ariaLabel}
      className={`flex flex-col gap-2 rounded-2xl border p-3 min-h-32 bg-white dark:bg-husrev-shadow ${
        day.isToday
          ? "ring-2 ring-husrev-amber border-husrev-amber"
          : "border-gray-100 dark:border-white/[0.04]"
      } ${isOver && canDrop ? "bg-brand-50/40 border-brand-400" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id={headingId} className="text-sm font-semibold text-gray-900 dark:text-white">
            {weekdayName}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{dateLabel}</p>
        </div>
        <button
          type="button"
          onClick={onToggleAdd}
          aria-expanded={isAdding}
          aria-label={t("week.addTo", { date: `${weekdayName} ${dateLabel}` })}
          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
        >
          <BiPlus size={18} />
        </button>
      </div>

      <div
        role="meter"
        aria-label={t("week.loadLabel", {
          duration: formatDuration(minutes),
          capacity: formatDuration(WEEK_DAY_CAPACITY_MIN),
        })}
        aria-valuemin={0}
        aria-valuemax={WEEK_DAY_CAPACITY_MIN}
        aria-valuenow={minutes}
        data-testid={`week-load-${day.ymd}`}
        data-level={level}
        data-minutes={minutes}
        className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
      >
        <div
          className={`h-full rounded-full ${LEVEL_CLASS[level]}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{t("week.noItemsDay")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
          {items.map((item) => (
            <WeekItemChip
              key={`${item.id}-${item.occursOn ?? ""}-${item.scheduledAt ?? item.dueAt ?? ""}`}
              item={item}
              dayYmd={day.ymd}
              onComplete={() => onComplete(item)}
              onSchedule={() => onSchedule(item)}
            />
          ))}
        </ul>
      )}

      {isAdding && <DayAddForm ymd={day.ymd} onAdded={onAdded} onCancel={onToggleAdd} />}
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

interface WeekItemChipProps {
  item: ItemResponse;
  dayYmd: string;
  onComplete: () => void;
  onSchedule: () => void;
}

function WeekItemChip({ item, dayYmd, onComplete, onSchedule }: WeekItemChipProps) {
  const { t } = useTranslation();
  const recurring = isRecurringItem(item);
  const isDone = item.status === "done";

  const [{ isDragging }, dragRef] = useDrag<DragItemPayload, void, { isDragging: boolean }>(
    () => ({
      type: DND_TYPE,
      canDrag: () => !recurring && !isDone,
      item: { id: item.id, title: item.title, fromYmd: dayYmd, item },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [item, dayYmd, recurring, isDone],
  );

  const time = itemTimeLabel(item);
  const draggable = !recurring && !isDone;

  return (
    <li
      ref={(el) => {
        if (draggable) dragRef(el);
      }}
      data-chip="true"
      data-draggable={draggable ? "true" : "false"}
      data-completed={isDone ? "true" : "false"}
      title={recurring ? t("today.board.recurringTaskTooltip") : undefined}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
        item.kind === "event"
          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
          : "bg-gray-100 text-gray-800 dark:bg-white/[0.04] dark:text-gray-200"
      } ${isDragging ? "opacity-30" : "opacity-100"}`}
    >
      <span className="sr-only">
        {item.kind === "event" ? t("week.kindEvent") : t("week.kindTask")}
      </span>
      {time && <span className="shrink-0 font-mono text-[10px] opacity-70">{time}</span>}
      <span
        className={`min-w-0 flex-1 truncate font-medium ${isDone ? "line-through opacity-60" : ""}`}
      >
        {item.title}
      </span>
      {!isDone && (
        <button
          type="button"
          onClick={onComplete}
          aria-label={`${t("week.complete")}: ${item.title}`}
          className="shrink-0 rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
        >
          <BiCheck size={16} />
        </button>
      )}
      {recurring ? (
        <span className="shrink-0 rounded px-1 text-[10px] text-gray-400 dark:text-gray-500">
          {t("today.board.recurringTask")}
        </span>
      ) : (
        !isDone && (
          <button
            type="button"
            onClick={onSchedule}
            aria-label={`${t("week.schedule")}: ${item.title}`}
            className="shrink-0 rounded p-1 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30 cursor-pointer"
          >
            <BiTimeFive size={16} />
          </button>
        )
      )}
    </li>
  );
}

// ─── Add form ────────────────────────────────────────────────────────────────

function DayAddForm({
  ymd,
  onAdded,
  onCancel,
}: {
  ymd: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const createMutation = useCreateItem();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<ItemKind>("task");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || createMutation.isPending) return;

    let scheduledAt: string | null = null;
    let dueAt: string | null = null;
    if (time) {
      const [h, m] = time.split(":").map(Number);
      scheduledAt = slotToIso(ymd, (h || 0) * 60 + (m || 0));
    } else if (kind === "event") {
      scheduledAt = slotToIso(ymd, 0);
    } else {
      dueAt = slotToIso(ymd, 0);
    }

    createMutation.mutate(
      { title: title.trim(), kind, scheduledAt, dueAt },
      {
        onSuccess: () => {
          setTitle("");
          setTime("");
          onAdded();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          alertStore.getState().show({
            title: t("week.error"),
            message: msg || t("week.error"),
            type: "error",
          });
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-t border-gray-100 pt-2 dark:border-white/10">
      <input
        type="text"
        required
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("week.titlePlaceholder")}
        aria-label={t("week.titlePlaceholder")}
        className="w-full rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label={t("week.timeOptional")}
          className="w-full rounded-xl border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ItemKind)}
          aria-label={t("week.kind")}
          className="w-full rounded-xl border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
        >
          <option value="task">{t("week.kindTask")}</option>
          <option value="event">{t("week.kindEvent")}</option>
        </select>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06] cursor-pointer"
        >
          {t("week.cancel")}
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-xl bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 cursor-pointer"
        >
          {t("week.submit")}
        </button>
      </div>
    </form>
  );
}

export default function WeekPage(props: WeekPageProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <WeekPageView {...props} />
    </DndProvider>
  );
}
