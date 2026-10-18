"use client";

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/utils";
import { parseLocalISO, type DayState, type WeekDay } from "./sport-schedule";

/** DOM id of the panel below the strip that shows the selected day (`aria-controls`). */
export const WEEK_PANEL_ID = "sport-week-day-panel";

export interface WeekStripProps {
  week: WeekDay[];
  /** `YYYY-MM-DD` of the selected day. */
  selected: string;
  onSelect: (date: string) => void;
}

// Visual contract of the day dot: done filled, planned outlined, missed muted,
// skipped muted + strike, rest a dash, today a ring around the whole tab.
const DOT: Record<DayState, string> = {
  done: "bg-husrev-moss text-white ring-husrev-moss",
  planned:
    "bg-transparent text-husrev-ink ring-husrev-ember/70 dark:text-husrev-cream dark:ring-husrev-amber/70",
  missed:
    "bg-husrev-sand/50 text-gray-400 ring-transparent dark:bg-white/[0.05] dark:text-gray-500",
  skipped:
    "bg-husrev-sand/50 text-gray-400 ring-transparent dark:bg-white/[0.05] dark:text-gray-500",
  rest: "bg-transparent text-gray-300 ring-transparent dark:text-gray-600",
};

/**
 * Seven day tabs, Monday..Sunday, each announcing its state ("Pazartesi,
 * tamamlandı"). Follows the WAI-ARIA tabs pattern like `YearTabs`: arrow keys
 * move focus and selection, only the selected tab is in the Tab order.
 */
export default function WeekStrip({ week, selected, onSelect }: WeekStripProps) {
  const { t } = useTranslation();
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = week.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = week[next];
    onSelect(target.date);
    tabRefs.current.get(target.date)?.focus();
  };

  return (
    <nav
      role="tablist"
      aria-label={t("sport.week.label", "Bu hafta")}
      className="grid grid-cols-7 gap-1"
    >
      {week.map((day, index) => {
        const isSelected = day.date === selected;
        const label = [
          t(`sport.day.${day.weekday}`),
          day.isToday ? t("sport.week.today", "bugün") : null,
          t(`sport.week.state.${day.state}`),
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <button
            key={day.date}
            ref={(node) => {
              if (node) tabRefs.current.set(day.date, node);
              else tabRefs.current.delete(day.date);
            }}
            type="button"
            role="tab"
            id={`sport-week-tab-${day.date}`}
            aria-selected={isSelected}
            aria-controls={WEEK_PANEL_ID}
            aria-label={label}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(day.date)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl py-2 text-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber",
              isSelected
                ? "bg-husrev-cream/80 dark:bg-white/[0.06]"
                : "hover:bg-husrev-cream/50 dark:hover:bg-white/[0.03]",
              day.isToday && "ring-1 ring-husrev-ember/60 dark:ring-husrev-amber/60",
            )}
          >
            <span
              className={cn(
                "font-medium uppercase tracking-wide",
                day.isToday
                  ? "text-husrev-ember dark:text-husrev-amber"
                  : "text-gray-500 dark:text-gray-400",
              )}
              aria-hidden
            >
              {t(`sport.week.short.${day.weekday}`)}
            </span>
            <span
              aria-hidden
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ring-1 transition",
                DOT[day.state],
                day.state === "skipped" && "line-through decoration-2",
              )}
            >
              {day.state === "rest" ? "–" : parseLocalISO(day.date).getDate()}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
