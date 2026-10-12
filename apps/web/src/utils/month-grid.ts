import { dateYmdIstanbul, minutesOfDayIstanbul, slotToIso } from "./today-board";
import { ItemResponse } from "@/types/item/item";

export interface MonthGridCell {
  ymd: string;
  inMonth: boolean;
  isToday: boolean;
}

export interface MonthRange {
  fromYmd: string;
  toYmd: string;
}

/**
 * Builds a 5- or 6-week Monday-first month grid of calendar days.
 *
 * Each cell specifies:
 * - `ymd`: ISO date string "YYYY-MM-DD"
 * - `inMonth`: true if the day belongs to the requested year and month (1..12)
 * - `isToday`: true if the day matches today's date in Europe/Istanbul
 *
 * Pure UTC calendar arithmetic is used so host browser timezone never shifts day boundaries.
 */
export function buildMonthGrid(year: number, month: number): MonthGridCell[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const lastWeekday = (new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay() + 6) % 7;
  const trailingDays = 6 - lastWeekday;

  const todayYmd = dateYmdIstanbul(new Date());
  const cells: MonthGridCell[] = [];

  // Leading days from previous month
  for (let i = firstWeekday; i > 0; i--) {
    const d = new Date(Date.UTC(year, month - 1, 1 - i));
    const ymd = d.toISOString().slice(0, 10);
    cells.push({
      ymd,
      inMonth: false,
      isToday: ymd === todayYmd,
    });
  }

  // Days in current month
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const ymd = d.toISOString().slice(0, 10);
    cells.push({
      ymd,
      inMonth: true,
      isToday: ymd === todayYmd,
    });
  }

  // Trailing days from next month
  for (let day = 1; day <= trailingDays; day++) {
    const d = new Date(Date.UTC(year, month, day));
    const ymd = d.toISOString().slice(0, 10);
    cells.push({
      ymd,
      inMonth: false,
      isToday: ymd === todayYmd,
    });
  }

  return cells;
}

/**
 * Returns the first and last visible day (YYYY-MM-DD) for the month view grid.
 * Visible range includes leading and trailing days displayed in the grid.
 */
export function monthRange(year: number, month: number): MonthRange {
  const cells = buildMonthGrid(year, month);
  return {
    fromYmd: cells[0].ymd,
    toYmd: cells[cells.length - 1].ymd,
  };
}

/**
 * Groups items by their Europe/Istanbul calendar day.
 * - Virtual expanded occurrences take `occursOn` as the canonical day.
 * - Non-recurring items check `scheduledAt` first, then `dueAt`.
 * - Items with neither date are excluded from the grid.
 */
export function groupItemsByDay(items: ItemResponse[]): Record<string, ItemResponse[]> {
  const groups: Record<string, ItemResponse[]> = {};

  for (const item of items) {
    let dayYmd: string | null = null;

    if (item.occursOn) {
      dayYmd = item.occursOn;
    } else if (item.scheduledAt) {
      dayYmd = dateYmdIstanbul(item.scheduledAt);
    } else if (item.dueAt) {
      dayYmd = dateYmdIstanbul(item.dueAt);
    }

    if (!dayYmd) continue;

    if (!groups[dayYmd]) {
      groups[dayYmd] = [];
    }
    groups[dayYmd].push(item);
  }

  return groups;
}

export type MoveToDayResult =
  | { scheduledAt: string; dueAt?: never }
  | { dueAt: string; scheduledAt?: never };

/**
 * Computes the new scheduledAt or dueAt ISO instant on `targetYmd`
 * preserving the item's Europe/Istanbul time of day.
 * Timeless / all-day items keep their field type at midnight (00:00).
 */
export function moveToDay(
  item: Pick<ItemResponse, "scheduledAt" | "dueAt">,
  targetYmd: string,
  placedBy?: "scheduledAt" | "dueAt",
): MoveToDayResult {
  if (placedBy === "dueAt" && item.dueAt) {
    const minutes = minutesOfDayIstanbul(item.dueAt);
    return { dueAt: slotToIso(targetYmd, minutes) };
  }
  if (placedBy === "scheduledAt" && item.scheduledAt) {
    const minutes = minutesOfDayIstanbul(item.scheduledAt);
    return { scheduledAt: slotToIso(targetYmd, minutes) };
  }
  if (item.scheduledAt) {
    const minutes = minutesOfDayIstanbul(item.scheduledAt);
    return { scheduledAt: slotToIso(targetYmd, minutes) };
  }

  if (item.dueAt) {
    const minutes = minutesOfDayIstanbul(item.dueAt);
    return { dueAt: slotToIso(targetYmd, minutes) };
  }

  // Fallback for timeless item with neither set
  return { scheduledAt: slotToIso(targetYmd, 0) };
}
