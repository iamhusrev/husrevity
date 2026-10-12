import { dateYmdIstanbul, minutesOfDayIstanbul } from "@/utils/today-board";
import { ItemResponse } from "@/types/item/item";

/** Formats a calendar day (YYYY-MM-DD) without involving the host timezone. */
export function formatYmd(ymd: string, language: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatYmdRange(startYmd: string, endYmd: string, language: string): string {
  return `${formatYmd(startYmd, language)} – ${formatYmd(endYmd, language)}`;
}

/**
 * Istanbul "YYYY-MM-DD HH:mm" of an item, or null when it has no date.
 * A time of exactly 00:00 is treated as "no time of day" like the month and week views.
 */
export function itemWhenLabel(item: ItemResponse): string | null {
  if (item.occursOn) return item.occursOn;
  const iso = item.scheduledAt ?? item.dueAt;
  if (!iso) return null;
  const ymd = dateYmdIstanbul(iso);
  const mins = minutesOfDayIstanbul(iso);
  if (mins === 0) return ymd;
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${ymd} ${hh}:${mm}`;
}
