"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { GoogleDayEvent } from "./merge-google-events";

/**
 * Read-only chip for a Google Calendar event. Deliberately has no buttons, drag source,
 * or edit/complete/delete handlers: Google events are only displayed.
 */
export function GoogleEventChip({
  entry,
  compact = false,
}: {
  entry: GoogleDayEvent;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { event, timeLabel } = entry;
  return (
    <div
      data-google-chip="true"
      data-draggable="false"
      tabIndex={0}
      role="group"
      aria-label={t("calendar.googleEventLabel", { title: event.title })}
      className={`flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-1.5 py-0.5 ${
        compact ? "text-[10.5px]" : "text-xs"
      } text-sky-900 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-100`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
      {timeLabel && <span className="shrink-0 font-mono text-[9px] opacity-70">{timeLabel}</span>}
      <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
      <span className="shrink-0 rounded bg-sky-100 px-1 text-[9px] font-semibold uppercase text-sky-700 dark:bg-sky-900/50 dark:text-sky-200">
        {t("calendar.googleBadge")}
      </span>
    </div>
  );
}

/** Small non-blocking notice shown when the Google feed failed; Husrevity items stay visible. */
export function GoogleFeedNotice() {
  const { t } = useTranslation();
  return (
    <p
      role="status"
      data-testid="google-feed-error"
      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200"
    >
      {t("calendar.googleFeedError")}
    </p>
  );
}
