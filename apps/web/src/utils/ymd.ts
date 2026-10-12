/**
 * Calendar-date (YYYY-MM-DD) helpers. Pure UTC arithmetic on the date parts:
 * the host (browser) timezone never shifts a day boundary.
 */

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a well-formed date that exists on the calendar (rejects 2026-02-30). */
export function isRealYmd(value: string): boolean {
  if (!YMD_REGEX.test(value)) return false;
  const ms = toUtcMs(value);
  return !Number.isNaN(ms) && fromUtcMs(ms) === value;
}

/** Inclusive number of days from `startYmd` to `endYmd` (same day = 1). Both must be real dates. */
export function spanDaysYmd(startYmd: string, endYmd: string): number {
  return Math.round((toUtcMs(endYmd) - toUtcMs(startYmd)) / DAY_MS) + 1;
}

export function addDaysYmd(ymd: string, days: number): string {
  return fromUtcMs(toUtcMs(ymd) + days * DAY_MS);
}

/** `month` is 1..12. */
export function firstDayOfMonthYmd(year: number, month: number): string {
  return fromUtcMs(Date.UTC(year, month - 1, 1));
}

/** `month` is 1..12. */
export function lastDayOfMonthYmd(year: number, month: number): string {
  return fromUtcMs(Date.UTC(year, month, 0));
}
