"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import { useToday } from "@/hooks/useToday";
import { useCompleteItem, useScheduleItem } from "@/hooks/useItems";
import { useRoutineSegments } from "@/hooks/useRoutine";
import { alertStore } from "@/stores/alert-store";
import {
  clampToDay,
  dateYmdIstanbul,
  layoutOverlaps,
  minutesOfDayIstanbul,
  minutesToTop,
  segmentsForWeekday,
  snapMinutes,
  slotToIso,
  TimelineLayoutEntry,
} from "@/utils/today-board";
import { ItemSummary, TimelineEntry } from "@/types/today/today";
import { RoutineColorToken, RoutineSegmentResponse } from "@/types/routine/routine";
import { BiCheckCircle, BiTimeFive, BiCalendarPlus } from "react-icons/bi";
import SharedScheduleModal from "@/components/items/ScheduleModal";

const PX_PER_MINUTE = 1;
const TOTAL_MINUTES = 1440; // 24 hours * 60 minutes
const DND_TYPE = "PENDING_ITEM";
const DURATION_OPTIONS: readonly number[] = [15, 30, 45, 60, 90, 120];

function formatTime(isoOrDate: string | Date): string {
  const min = minutesOfDayIstanbul(isoOrDate);
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export interface ScheduleHandlerParams {
  mutate: (
    vars: { id: string; scheduledAt: string; durationMin?: number },
    opts?: { onError?: (err: unknown) => void; onSuccess?: () => void },
  ) => void;
  dateYmd: string;
  itemId: string;
  rawMinutes: number;
  durationMin?: number | null;
  onError?: (err: unknown) => void;
  onSuccess?: () => void;
}

/**
 * Pure helper for drop and click scheduling.
 * Snaps minutes, constructs ISO instant on the Istanbul day dateYmd,
 * and calls the mutation omitting durationMin if none was provided.
 */
export function handleTimelineSchedule({
  mutate,
  dateYmd,
  itemId,
  rawMinutes,
  durationMin,
  onError,
  onSuccess,
}: ScheduleHandlerParams) {
  const snapped = snapMinutes(clampToDay(rawMinutes), 15);
  const scheduledAt = slotToIso(dateYmd, snapped);
  const payload: { id: string; scheduledAt: string; durationMin?: number } = {
    id: itemId,
    scheduledAt,
  };
  if (durationMin != null && durationMin > 0) {
    payload.durationMin = durationMin;
  }

  mutate(payload, { onError, onSuccess });
}

const COLOR_BAND_CLASSES: Record<RoutineColorToken, { bg: string; border: string; text: string }> =
  {
    "husrev-amber": {
      bg: "bg-husrev-amber/10 dark:bg-husrev-amber/15",
      border: "border-l-4 border-husrev-amber/60",
      text: "text-husrev-amber-dark dark:text-husrev-amber",
    },
    "husrev-ember": {
      bg: "bg-husrev-ember/10 dark:bg-husrev-ember/15",
      border: "border-l-4 border-husrev-ember/60",
      text: "text-husrev-ember dark:text-husrev-ember-light",
    },
    "husrev-moss": {
      bg: "bg-husrev-moss/10 dark:bg-husrev-moss/15",
      border: "border-l-4 border-husrev-moss/60",
      text: "text-husrev-moss dark:text-husrev-moss-light",
    },
    "husrev-sand": {
      bg: "bg-husrev-sand/20 dark:bg-husrev-sand/10",
      border: "border-l-4 border-husrev-sand/60",
      text: "text-husrev-sand-dark dark:text-husrev-sand",
    },
    "husrev-ink": {
      bg: "bg-husrev-ink/10 dark:bg-white/[0.04]",
      border: "border-l-4 border-husrev-ink/50 dark:border-white/20",
      text: "text-husrev-ink dark:text-husrev-cream",
    },
  };

export interface DragPayload {
  id: string;
  title: string;
  durationMin?: number | null;
  isRecurring?: boolean;
}

export interface UseTimelineDropParams {
  /** Istanbul day (yyyy-MM-dd) the board shows; undefined until the board data has loaded. */
  todayDate: string | undefined;
  /** Scheduler mutation function; called with the payload built by handleTimelineSchedule. */
  onSchedule: ScheduleHandlerParams["mutate"];
  /** True while a schedule mutation is in flight. */
  isPending: boolean;
}

/**
 * Drop target logic for the 24-hour timeline grid.
 * Returns the ref callback for the grid element plus the hover/drop preview state.
 */
export function useTimelineDrop({ todayDate, onSchedule, isPending }: UseTimelineDropParams) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dropPreviewMinute, setDropPreviewMinute] = useState<number | null>(null);

  const [{ isOver }, dropRef] = useDrop<DragPayload, void, { isOver: boolean }>(
    () => ({
      accept: DND_TYPE,
      canDrop: (item) => Boolean(todayDate) && !isPending && !item.isRecurring,
      hover: (_item, monitor) => {
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset || !gridRef.current) return;
        const rect = gridRef.current.getBoundingClientRect();
        const rawMin = (clientOffset.y - rect.top) / PX_PER_MINUTE;
        setDropPreviewMinute(snapMinutes(clampToDay(rawMin), 15));
      },
      drop: (item, monitor) => {
        const clientOffset = monitor.getClientOffset();
        setDropPreviewMinute(null);
        if (!clientOffset || !gridRef.current || !todayDate) return;
        const rect = gridRef.current.getBoundingClientRect();
        const rawMin = (clientOffset.y - rect.top) / PX_PER_MINUTE;

        handleTimelineSchedule({
          mutate: onSchedule,
          dateYmd: todayDate,
          itemId: item.id,
          rawMinutes: rawMin,
          durationMin: item.durationMin,
        });
      },
      collect: (monitor) => ({ isOver: monitor.isOver() }),
    }),
    [todayDate, onSchedule, isPending],
  );

  const setGridRef = useCallback(
    (el: HTMLDivElement | null) => {
      gridRef.current = el;
      dropRef(el);
    },
    [dropRef],
  );

  return { setGridRef, isOver, dropPreviewMinute };
}

// ─── Pending row component (drag source + complete + fallback) ───────────────

function PendingRow({
  item,
  todayDate,
  isSchedulePending,
  onOpenScheduleModal,
}: {
  item: ItemSummary;
  todayDate?: string;
  isSchedulePending: boolean;
  onOpenScheduleModal: (item: ItemSummary) => void;
}) {
  const { t } = useTranslation();
  const completeItem = useCompleteItem();

  const isCompletePending =
    completeItem.isPending && completeItem.variables?.id === item.itemId;
  const isBusy = isCompletePending || isSchedulePending;

  const [{ isDragging }, dragRef] = useDrag<DragPayload, void, { isDragging: boolean }>(
    () => ({
      type: DND_TYPE,
      canDrag: () => !item.isRecurring && !isBusy,
      item: {
        id: item.itemId,
        title: item.title,
        durationMin: item.durationMin,
        isRecurring: item.isRecurring,
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [item.isRecurring, isBusy, item.itemId, item.title, item.durationMin],
  );

  const handleComplete = () => {
    completeItem.mutate(
      { id: item.itemId, occursOn: todayDate },
      {
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          alertStore.getState().show({
            title: t("common.error"),
            message: msg || t("common.error"),
            type: "error",
          });
        },
      },
    );
  };

  return (
    <li
      ref={(el) => {
        if (!item.isRecurring && !isBusy) {
          dragRef(el);
        }
      }}
      className={`group flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white p-3 shadow-xs transition hover:border-brand-200 dark:border-white/[0.06] dark:bg-husrev-shadow dark:hover:border-brand-500/30 ${
        isDragging ? "opacity-40" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={handleComplete}
          disabled={isBusy}
          aria-label={`${t("common.done")}: ${item.title}`}
          className="shrink-0 text-gray-400 hover:text-husrev-ember disabled:opacity-50 transition cursor-pointer disabled:cursor-not-allowed"
        >
          <BiCheckCircle size={18} />
        </button>
        <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
          {item.title}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {item.isRecurring ? (
          <span
            title={t("today.board.recurringTaskTooltip")}
            className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium text-gray-400 bg-gray-50 dark:bg-white/[0.04] dark:text-gray-500 cursor-default"
          >
            {t("today.board.recurringTask")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onOpenScheduleModal(item)}
            disabled={isBusy}
            aria-label={`${t("today.board.schedule")}: ${item.title}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/[0.06] cursor-pointer disabled:cursor-not-allowed"
          >
            <BiCalendarPlus size={14} className="shrink-0 text-brand-500" />
            <span>{t("today.board.schedule")}</span>
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Non-drag Schedule Modal Fallback ─────────────────────────────────────────

export function ScheduleModal({
  item,
  todayDate,
  onClose,
  onScheduled,
}: {
  item: ItemSummary;
  todayDate: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  return (
    <SharedScheduleModal
      item={{
        id: item.itemId,
        title: item.title,
        durationMin: item.durationMin,
      }}
      todayDate={todayDate}
      recurring={item.isRecurring}
      onClose={onClose}
      onScheduled={onScheduled}
    />
  );
}

// ─── Main TodayBoard inner view ──────────────────────────────────────────────

export function TodayBoardView() {
  const { t } = useTranslation();
  const { data: today, isLoading, isError, refetch } = useToday();
  const { data: routineSegments = [] } = useRoutineSegments();
  const scheduleItem = useScheduleItem();

  const [schedulingItem, setSchedulingItem] = useState<ItemSummary | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledDateRef = useRef<string | null>(null);

  const todayDate = today?.date;

  // Evkat segments for today's weekday
  const activeBands = useMemo(() => {
    if (!todayDate) return [];
    return segmentsForWeekday(routineSegments, todayDate);
  }, [routineSegments, todayDate]);

  // Set of scheduled item IDs to exclude from pending list (H1)
  const scheduledItemIds = useMemo(() => {
    return new Set((today?.timeline ?? []).map((t) => t.itemId));
  }, [today?.timeline]);

  // Pending items: due today but not yet scheduled on timeline (H1)
  const pendingItems = useMemo(() => {
    return (today?.dueToday ?? []).filter((item) => !scheduledItemIds.has(item.itemId));
  }, [today?.dueToday, scheduledItemIds]);

  // Layout overlapping timeline entries, filtering to Istanbul day (H4)
  const laidOutTimeline = useMemo(() => {
    if (!today?.timeline || !todayDate) return [];
    const forToday = today.timeline.filter(
      (entry) => dateYmdIstanbul(entry.scheduledAt) === todayDate,
    );
    return layoutOverlaps(forToday);
  }, [today?.timeline, todayDate]);

  // Current time line calculation in Istanbul timezone (H4)
  const currentMinutes = minutesOfDayIstanbul(new Date());

  // Auto-scroll on mount to current hour or first entry, fire once per date (M8)
  useEffect(() => {
    if (!scrollContainerRef.current || !todayDate) return;
    if (hasScrolledDateRef.current === todayDate) return;
    hasScrolledDateRef.current = todayDate;

    const firstEntryMinute =
      today?.timeline && today.timeline.length > 0
        ? minutesOfDayIstanbul(today.timeline[0].scheduledAt)
        : null;

    const targetMinute =
      firstEntryMinute !== null ? Math.min(firstEntryMinute, currentMinutes) : currentMinutes;
    const targetPx = minutesToTop(targetMinute, PX_PER_MINUTE);
    if (typeof scrollContainerRef.current.scrollTo === "function") {
      scrollContainerRef.current.scrollTo({
        top: Math.max(0, targetPx - 100),
        behavior: "smooth",
      });
    } else {
      scrollContainerRef.current.scrollTop = Math.max(0, targetPx - 100);
    }
  }, [todayDate, today?.timeline, currentMinutes]);

  // Drop target on 24-hour vertical timeline grid (H3)
  const { setGridRef, isOver, dropPreviewMinute } = useTimelineDrop({
    todayDate,
    onSchedule: scheduleItem.mutate,
    isPending: scheduleItem.isPending,
  });

  if (isLoading) {
    return (
      <div
        data-testid="today-board-loading"
        className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-6 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06] animate-pulse space-y-4"
      >
        <div className="h-6 w-48 rounded-lg bg-gray-200 dark:bg-white/10" />
        <div className="h-96 rounded-xl bg-gray-100 dark:bg-white/5" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-8 text-center shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06] space-y-3">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t("today.board.error")}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-xl bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 transition cursor-pointer"
        >
          {t("today.board.retry")}
        </button>
      </div>
    );
  }

  const isEmpty =
    (!today?.timeline || today.timeline.length === 0) &&
    (!today?.dueToday || today.dueToday.length === 0);

  if (isEmpty) {
    return (
      <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-12 text-center shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("today.empty")}</p>
      </div>
    );
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex flex-col xl:flex-row gap-6">
      {/* ─── Left Column: 24-hour Vertical Timeline Axis ─────────────────── */}
      <section
        aria-label={t("today.board.dropTargetAria")}
        className="flex-1 rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06] overflow-hidden flex flex-col"
      >
        <div className="border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {t("today.timeline.title")}
          </h3>
          <span className="text-xs text-gray-400">{t("today.board.axis24h")}</span>
        </div>

        {/* Scrollable vertical axis */}
        <div
          ref={scrollContainerRef}
          className="relative h-[600px] overflow-y-auto overflow-x-hidden p-4 select-none"
        >
          <div
            ref={setGridRef}
            data-testid="timeline-grid"
            className="relative w-full"
            style={{ height: `${TOTAL_MINUTES * PX_PER_MINUTE}px` }}
          >
            {/* Hour grid lines & labels */}
            {hours.map((h) => {
              const top = minutesToTop(h * 60, PX_PER_MINUTE);
              const label = `${String(h).padStart(2, "0")}:00`;

              return (
                <div
                  key={h}
                  className="absolute inset-x-0 flex items-start pointer-events-none"
                  style={{ top: `${top}px` }}
                >
                  <span className="w-12 text-[11px] font-mono font-medium text-gray-400 dark:text-gray-500">
                    {label}
                  </span>
                  <div className="flex-1 border-t border-gray-100 dark:border-white/[0.06] mt-2" />
                </div>
              );
            })}

            {/* Evkat routine background bands */}
            {activeBands.map((band) => {
              const token = (band.colorToken ?? "husrev-amber") as RoutineColorToken;
              const styles = COLOR_BAND_CLASSES[token] ?? COLOR_BAND_CLASSES["husrev-amber"];

              const start = band.startMinute ?? 0;
              const end = band.endMinute ?? TOTAL_MINUTES;

              const bandTop = minutesToTop(start, PX_PER_MINUTE);
              const bandHeight = minutesToTop(Math.max(0, end - start), PX_PER_MINUTE);

              return (
                <div
                  key={band.id}
                  className={`absolute left-14 right-2 rounded-lg p-2.5 pointer-events-none transition ${styles.bg} ${styles.border}`}
                  style={{
                    top: `${bandTop}px`,
                    height: `${bandHeight}px`,
                  }}
                >
                  <span className={`text-xs font-semibold uppercase tracking-wider ${styles.text}`}>
                    {band.name}
                  </span>
                </div>
              );
            })}

            {/* Timeline Entries (H1 task badge, H2 calc formula, H4 Istanbul time) */}
            {laidOutTimeline.map((entry) => {
              const entryMinutes = minutesOfDayIstanbul(entry.scheduledAt);
              const duration = entry.durationMin && entry.durationMin > 0 ? entry.durationMin : 30;

              const top = minutesToTop(entryMinutes, PX_PER_MINUTE);
              const height = Math.max(28, minutesToTop(duration, PX_PER_MINUTE));

              return (
                <div
                  key={`${entry.itemId}-${entry.scheduledAt}`}
                  data-timeline-entry="true"
                  aria-label={`${entry.title} (${formatTime(entry.scheduledAt)})`}
                  className="absolute z-10 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-husrev-sand/90 transition hover:shadow-md dark:bg-husrev-ink dark:ring-white/10"
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `calc(3.5rem + (100% - 3.5rem) * ${entry.column / entry.columns})`,
                    width: `calc((100% - 3.5rem) / ${entry.columns} - 4px)`,
                  }}
                >
                  <div className="flex h-full flex-col justify-between overflow-hidden">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {entry.kind === "task" && (
                        <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                          {t("today.board.taskBadge")}
                        </span>
                      )}
                      <p className="truncate text-xs font-semibold text-gray-800 dark:text-white/90">
                        {entry.title}
                      </p>
                    </div>
                    <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                      {formatTime(entry.scheduledAt)}
                      {entry.durationMin
                        ? ` · ${entry.durationMin} ${t("today.board.minutesSuffix")}`
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* "Now" indicator line in Istanbul time */}
            <div
              data-testid="now-line"
              className="absolute left-12 right-0 z-20 flex items-center pointer-events-none"
              style={{ top: `${minutesToTop(currentMinutes, PX_PER_MINUTE)}px` }}
            >
              <span className="h-2 w-2 rounded-full bg-husrev-ember dark:bg-husrev-amber shrink-0 -ml-1" />
              <div className="flex-1 border-t-2 border-husrev-ember dark:border-husrev-amber" />
            </div>

            {/* Drop preview line while dragging */}
            {isOver && dropPreviewMinute !== null && (
              <div
                className="absolute left-12 right-0 z-30 flex items-center pointer-events-none"
                style={{ top: `${minutesToTop(dropPreviewMinute, PX_PER_MINUTE)}px` }}
              >
                <span className="rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white shadow-xs">
                  {String(Math.floor(dropPreviewMinute / 60)).padStart(2, "0")}:
                  {String(dropPreviewMinute % 60).padStart(2, "0")}
                </span>
                <div className="flex-1 border-t-2 border-dashed border-brand-500" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Right Column: Bekleyen İşler (Pending Items) ────────────────── */}
      <section className="w-full xl:w-96 rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06] flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BiTimeFive className="text-husrev-ember dark:text-husrev-amber" size={18} />
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {t("today.board.pendingTitle")}
            </h3>
          </div>
          <span className="text-xs text-gray-400">
            {pendingItems.length}
          </span>
        </div>

        {pendingItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {t("today.board.pendingEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingItems.map((item) => (
              <PendingRow
                key={item.itemId}
                item={item}
                todayDate={todayDate}
                isSchedulePending={
                  scheduleItem.isPending && scheduleItem.variables?.id === item.itemId
                }
                onOpenScheduleModal={(it) => setSchedulingItem(it)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Non-drag schedule modal fallback */}
      {schedulingItem && (
        <ScheduleModal
          item={schedulingItem}
          todayDate={todayDate ?? dateYmdIstanbul(new Date())}
          onClose={() => setSchedulingItem(null)}
          onScheduled={() => setSchedulingItem(null)}
        />
      )}
    </div>
  );
}

/**
 * Top-level TodayBoard exported with DndProvider wrapped.
 */
export default function TodayBoard() {
  return (
    <DndProvider backend={HTML5Backend}>
      <TodayBoardView />
    </DndProvider>
  );
}
