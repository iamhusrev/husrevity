"use client";

import React, { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { BiX } from "react-icons/bi";
import Dialog from "@/components/ui/Dialog";
import { RoutineColorToken, RoutineSegmentResponse } from "@/types/routine/routine";
import { formatMinuteRange, minutesToTop } from "@/utils/today-board";

const TOTAL_MINUTES = 1440;

interface BandColorClasses {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

const COLOR_BAND_CLASSES: Record<RoutineColorToken, BandColorClasses> = {
  "husrev-amber": {
    bg: "bg-husrev-amber/10 dark:bg-husrev-amber/15",
    border: "border-l-4 border-husrev-amber/60",
    text: "text-husrev-amber-dark dark:text-husrev-amber",
    dot: "bg-husrev-amber",
  },
  "husrev-ember": {
    bg: "bg-husrev-ember/10 dark:bg-husrev-ember/15",
    border: "border-l-4 border-husrev-ember/60",
    text: "text-husrev-ember dark:text-husrev-ember-light",
    dot: "bg-husrev-ember",
  },
  "husrev-moss": {
    bg: "bg-husrev-moss/10 dark:bg-husrev-moss/15",
    border: "border-l-4 border-husrev-moss/60",
    text: "text-husrev-moss dark:text-husrev-moss-light",
    dot: "bg-husrev-moss",
  },
  "husrev-sand": {
    bg: "bg-husrev-sand/20 dark:bg-husrev-sand/10",
    border: "border-l-4 border-husrev-sand/60",
    text: "text-husrev-sand-dark dark:text-husrev-sand",
    dot: "bg-husrev-sand",
  },
  "husrev-ink": {
    bg: "bg-husrev-ink/10 dark:bg-white/[0.04]",
    border: "border-l-4 border-husrev-ink/50 dark:border-white/20",
    text: "text-husrev-ink dark:text-husrev-cream",
    dot: "bg-husrev-ink dark:bg-husrev-cream",
  },
};

function colorClasses(segment: RoutineSegmentResponse): BandColorClasses {
  const token = segment.colorToken ?? "husrev-amber";
  return COLOR_BAND_CLASSES[token] ?? COLOR_BAND_CLASSES["husrev-amber"];
}

/**
 * One Evkat segment drawn as a background band on the 24-hour timeline. The band itself stays
 * click-through (`pointer-events-none`) so drag-and-drop onto the grid keeps working; only its
 * one-line header is an interactive button that opens a read-only detail dialog.
 */
export default function EvkatBand({
  segment,
  pxPerMinute,
}: {
  segment: RoutineSegmentResponse;
  pxPerMinute: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const styles = colorClasses(segment);

  const start = segment.startMinute ?? 0;
  const end = segment.endMinute ?? TOTAL_MINUTES;
  const range = formatMinuteRange(segment.startMinute, segment.endMinute, t("today.board.allDay"));
  const activityCount = segment.activities.length;

  return (
    <div
      data-testid={`evkat-band-${segment.id}`}
      className={`absolute left-14 right-2 overflow-hidden rounded-lg pointer-events-none transition ${styles.bg} ${styles.border}`}
      style={{
        top: `${minutesToTop(start, pxPerMinute)}px`,
        height: `${minutesToTop(Math.max(0, end - start), pxPerMinute)}px`,
      }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="pointer-events-auto flex w-full max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left leading-4 cursor-pointer transition hover:bg-white/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-husrev-amber dark:hover:bg-white/[0.06]"
      >
        <span
          className={`min-w-0 truncate text-xs font-semibold uppercase tracking-wider ${styles.text}`}
        >
          {segment.name}
        </span>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-600 dark:text-gray-300">
          {range}
        </span>
        {segment.theme && (
          <span className="hidden min-w-0 max-w-[10rem] truncate rounded-full bg-white/60 px-1.5 text-[10px] font-medium text-gray-600 sm:inline-block dark:bg-white/[0.08] dark:text-gray-300">
            {segment.theme}
          </span>
        )}
        {activityCount > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-gray-500 dark:text-gray-400">
            {t("today.board.activityCount", { count: activityCount })}
          </span>
        )}
      </button>

      <EvkatSegmentDialog
        open={open}
        segment={segment}
        range={range}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function EvkatSegmentDialog({
  open,
  segment,
  range,
  onClose,
}: {
  open: boolean;
  segment: RoutineSegmentResponse;
  range: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const styles = colorClasses(segment);
  const activities = useMemo(
    () => [...segment.activities].sort((a, b) => a.position - b.position),
    [segment.activities],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      portal
      labelledBy={titleId}
      overlayClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-xs pointer-events-auto sm:items-center"
      panelClassName="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-husrev-shadow dark:ring-white/10"
    >
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("today.board.evkatDetails")}
          </p>
          <h2
            id={titleId}
            className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream"
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 flex-none rounded-full ${styles.dot}`}
            />
            <span className="min-w-0 break-words">{segment.name}</span>
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tabular-nums text-husrev-ember dark:text-husrev-amber">
              {range}
            </span>
            {segment.theme && (
              <span
                title={t("today.board.evkatTheme")}
                className="rounded-full bg-husrev-sand/50 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
              >
                {segment.theme}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          data-dialog-close
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
        >
          <BiX size={20} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {segment.notes && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t("today.board.evkatNotes")}
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
              {segment.notes}
            </p>
          </section>
        )}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t("today.board.evkatActivities")}
          </h3>
          {activities.length === 0 ? (
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              {t("today.board.evkatEmptyActivities")}
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-husrev-ink dark:text-husrev-cream"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-[7px] h-1.5 w-1.5 flex-none rounded-full ${styles.dot}`}
                  />
                  <span className="min-w-0 flex-1 break-words">{activity.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex justify-end border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
        <Link
          href="/evkat"
          className="inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-husrev-ember ring-1 ring-husrev-ember/30 transition hover:bg-husrev-ember/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-husrev-amber dark:ring-husrev-amber/30 dark:hover:bg-husrev-amber/10"
        >
          {t("today.board.openEvkat")}
        </Link>
      </div>
    </Dialog>
  );
}
