const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * "3 days ago" / "yesterday" / "5 hours ago" in the given BCP 47 locale. Days are the natural
 * unit for a trash list, so the first day falls back to hours and minutes and nothing ever reads
 * as "0 minutes ago".
 */
export function formatRelativeTime(value: string | Date, now: Date, locale: string): string {
  const elapsed = Math.max(0, now.getTime() - new Date(value).getTime());
  // An unparseable date would reach Intl as NaN and throw during render.
  if (Number.isNaN(elapsed)) return "";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsed < HOUR_MS) {
    return rtf.format(-Math.max(1, Math.floor(elapsed / MINUTE_MS)), "minute");
  }
  if (elapsed < DAY_MS) {
    return rtf.format(-Math.floor(elapsed / HOUR_MS), "hour");
  }
  return rtf.format(-Math.floor(elapsed / DAY_MS), "day");
}
