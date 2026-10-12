"use client";

import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useScheduleItem } from "@/hooks/useItems";
import Dialog from "@/components/ui/Dialog";
import { clampToDay, minutesOfDayIstanbul, slotToIso, snapMinutes } from "@/utils/today-board";

const DURATION_OPTIONS: readonly number[] = [15, 30, 45, 60, 90, 120];

export interface ScheduleModalItem {
  id: string;
  title: string;
  durationMin?: number | null;
}

export interface ScheduleModalProps {
  item: ScheduleModalItem;
  todayDate: string;
  onClose: () => void;
  onScheduled: () => void;
  recurring?: boolean;
  initialTime?: string;
}

export default function ScheduleModal({
  item,
  todayDate,
  onClose,
  onScheduled,
  recurring,
  initialTime: initialTimeProp,
}: ScheduleModalProps) {
  const { t } = useTranslation();
  const scheduleItem = useScheduleItem();
  const timeInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const defaultTime = useMemo(() => {
    if (initialTimeProp) return initialTimeProp;
    const mins = minutesOfDayIstanbul(new Date());
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }, [initialTimeProp]);

  const initialDuration = item.durationMin && item.durationMin > 0 ? item.durationMin : 30;

  const durationOptions = useMemo(
    () =>
      DURATION_OPTIONS.includes(initialDuration)
        ? DURATION_OPTIONS
        : [...DURATION_OPTIONS, initialDuration].sort((a, b) => a - b),
    [initialDuration],
  );

  const [time, setTime] = useState(defaultTime);
  const [duration, setDuration] = useState<number>(initialDuration);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (recurring) return;
    const [h, m] = time.split(":").map(Number);
    const rawMinutes = (h || 0) * 60 + (m || 0);

    const snapped = snapMinutes(clampToDay(rawMinutes), 15);
    const scheduledAt = slotToIso(todayDate, snapped);
    const payload: { id: string; scheduledAt: string; durationMin?: number } = {
      id: item.id,
      scheduledAt,
    };
    if (duration > 0) {
      payload.durationMin = duration;
    }

    scheduleItem.mutate(payload, {
      onSuccess: () => {
        onScheduled();
      },
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      panelClassName="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-gray-200 dark:bg-husrev-shadow dark:ring-white/10"
      labelledBy="schedule-modal-title"
      // A recurring item has no time input: focus the close button instead.
      initialFocusRef={recurring ? closeButtonRef : timeInputRef}
    >
      <h3
        id="schedule-modal-title"
        className="text-base font-semibold text-gray-900 dark:text-white"
      >
        {t("today.board.scheduleModalTitle")}
      </h3>
      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{item.title}</p>

      {recurring ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("today.board.recurringTaskTooltip")}
          </p>
          <div className="flex justify-end pt-2">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="rounded-xl bg-gray-100 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 cursor-pointer"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="schedule-time-input"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t("today.board.timeLabel")}
            </label>
            <input
              id="schedule-time-input"
              ref={timeInputRef}
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="schedule-duration-select"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t("today.board.durationLabel")}
            </label>
            <select
              id="schedule-duration-select"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
            >
              {durationOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("today.board.minuteOption", { count: minutes })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06] cursor-pointer"
            >
              {t("today.board.cancel")}
            </button>
            <button
              type="submit"
              disabled={scheduleItem.isPending}
              className="rounded-xl bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {t("today.board.confirm")}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
