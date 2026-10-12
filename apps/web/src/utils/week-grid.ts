import { dateYmdIstanbul, minutesOfDayIstanbul } from "./today-board";
import { ItemResponse } from "@/types/item/item";

/**
 * Daily capacity used for the week view load bar, in minutes (8 hours).
 * ASSUMPTION: a fixed product constant, not user-configurable yet.
 */
export const WEEK_DAY_CAPACITY_MIN = 8 * 60;

/** Duration assumed for a scheduled item without `durationMin`; used for the load bar only. */
export const DEFAULT_ITEM_DURATION_MIN = 30;

/** Above 100% of capacity the bar turns amber; above 125% it turns red. */
export const LOAD_WARN_RATIO = 1;
export const LOAD_OVER_RATIO = 1.25;

export type LoadLevel = "ok" | "warn" | "over";

export interface WeekDayCell {
  ymd: string;
  isToday: boolean;
  /** Monday = 0 ... Sunday = 6 */
  weekdayIndex: number;
}

export interface WeekRange {
  fromYmd: string;
  toYmd: string;
}

export interface WeekSummary {
  total: number;
  done: number;
  open: number;
  slipped: number;
}

function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatUtcYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/**
 * Builds the 7 days (Monday first) of the week containing `ymd`.
 * Pure UTC calendar arithmetic: the host zone never shifts a day boundary.
 */
export function buildWeek(ymd: string): WeekDayCell[] {
  const ms = parseYmd(ymd);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7;
  const mondayMs = ms - weekday * DAY_MS;
  const todayYmd = dateYmdIstanbul(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const dayYmd = formatUtcYmd(mondayMs + i * DAY_MS);
    return { ymd: dayYmd, isToday: dayYmd === todayYmd, weekdayIndex: i };
  });
}

export function weekRange(ymd: string): WeekRange {
  const days = buildWeek(ymd);
  return { fromYmd: days[0].ymd, toYmd: days[6].ymd };
}

/** Moves `ymd` by whole weeks (negative goes back). */
export function shiftWeek(ymd: string, weeks: number): string {
  return formatUtcYmd(parseYmd(ymd) + weeks * 7 * DAY_MS);
}

/** Istanbul calendar day an item sits on, mirroring groupItemsByDay. */
function itemDayYmd(item: ItemResponse): string | null {
  if (item.occursOn) return item.occursOn;
  if (item.scheduledAt) return dateYmdIstanbul(item.scheduledAt);
  if (item.dueAt) return dateYmdIstanbul(item.dueAt);
  return null;
}

/**
 * Total planned minutes for one day's items. Only scheduled items count
 * (a `scheduledAt` or a recurring occurrence); dueAt-only and cancelled
 * items do not. A null duration counts as DEFAULT_ITEM_DURATION_MIN.
 */
export function loadMinutes(items: ItemResponse[]): number {
  let total = 0;
  for (const item of items) {
    if (item.status === "cancelled") continue;
    if (!item.occursOn && !item.scheduledAt) continue;
    total +=
      item.durationMin && item.durationMin > 0 ? item.durationMin : DEFAULT_ITEM_DURATION_MIN;
  }
  return total;
}

export function loadLevel(minutes: number): LoadLevel {
  if (minutes > WEEK_DAY_CAPACITY_MIN * LOAD_OVER_RATIO) return "over";
  if (minutes > WEEK_DAY_CAPACITY_MIN * LOAD_WARN_RATIO) return "warn";
  return "ok";
}

/**
 * Week totals. Cancelled and undated items are ignored. `slipped` counts open
 * items whose Istanbul day is strictly before `todayYmd`.
 *
 * When `weekYmds` is given, only items whose Istanbul day is one of those days
 * are counted, so the totals always match the visible columns (the API range
 * filter also matches on `dueAt`, and stale items may linger while navigating).
 */
export function weekSummary(
  items: ItemResponse[],
  todayYmd: string,
  weekYmds?: readonly string[],
): WeekSummary {
  const visible = weekYmds ? new Set(weekYmds) : null;
  let done = 0;
  let open = 0;
  let slipped = 0;
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const day = itemDayYmd(item);
    if (!day) continue;
    if (visible && !visible.has(day)) continue;
    if (item.status === "done") {
      done += 1;
    } else {
      open += 1;
      if (day < todayYmd) slipped += 1;
    }
  }
  return { total: done + open, done, open, slipped };
}

function formatMinutes(mins: number): string {
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * "HH:mm" in Europe/Istanbul for the time an item sits at, or null when it is
 * timeless. ASSUMPTION: an item at exactly 00:00 Istanbul (scheduledAt or dueAt)
 * carries no real time: tasks added without a time are stored at midnight and
 * all-day events created from the add form get scheduledAt at 00:00.
 */
export function itemTimeLabel(item: ItemResponse): string | null {
  const iso = item.scheduledAt ?? item.dueAt;
  if (!iso) return null;
  const mins = minutesOfDayIstanbul(iso);
  return mins === 0 ? null : formatMinutes(mins);
}

/** Sorts one day's items by Istanbul time of day; timeless items come first. Stable, non-mutating. */
export function sortByTime(items: ItemResponse[]): ItemResponse[] {
  const key = (item: ItemResponse): number => {
    const iso = item.scheduledAt ?? item.dueAt;
    if (!iso) return -1;
    return minutesOfDayIstanbul(iso) || -1;
  };
  return items
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((a, b) => a.k - b.k || a.index - b.index)
    .map((e) => e.item);
}
