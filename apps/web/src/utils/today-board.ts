import { RoutineSegmentResponse } from "@/types/routine/routine";

/**
 * Europe/Istanbul is permanently UTC+03:00 (Turkey abolished daylight saving time in 2016).
 * The API fixes the product timezone to Europe/Istanbul.
 */
export const ISTANBUL_TIMEZONE_OFFSET = "+03:00";

/**
 * Converts minutes from midnight to a vertical pixel offset.
 */
export function minutesToTop(minutes: number, pxPerMinute: number): number {
  return minutes * pxPerMinute;
}

/**
 * Snaps minutes to the nearest interval (default 15 minutes).
 */
export function snapMinutes(minutes: number, step = 15): number {
  if (step <= 0) return minutes;
  return Math.round(minutes / step) * step;
}

/**
 * Clamps minutes to valid single-day range [00:00 (0), 23:59 (1439)].
 */
export function clampToDay(minutes: number): number {
  return Math.max(0, Math.min(1439, Math.round(minutes)));
}

/**
 * Builds the ISO instant for a minute on the Istanbul day `dateYmd`.
 * Note: Europe/Istanbul offset is fixed at UTC+03:00 with no DST.
 */
export function slotToIso(dateYmd: string, minutesFromMidnight: number): string {
  const clamped = clampToDay(minutesFromMidnight);
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  return `${dateYmd}T${hh}:${mm}:00${ISTANBUL_TIMEZONE_OFFSET}`;
}

const istanbulTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const istanbulDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns minutes from midnight (0..1439) for the given instant in the Europe/Istanbul timezone.
 */
export function minutesOfDayIstanbul(isoOrDate: string | Date): number {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const parts = istanbulTimeFormatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  const minutePart = parts.find((p) => p.type === "minute");
  const h = hourPart ? parseInt(hourPart.value, 10) : 0;
  const m = minutePart ? parseInt(minutePart.value, 10) : 0;
  return h * 60 + m;
}

/**
 * Returns "YYYY-MM-DD" for the given instant in the Europe/Istanbul timezone.
 */
export function dateYmdIstanbul(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return istanbulDateFormatter.format(date);
}

export type TimelineLayoutEntry<T> = T & {
  column: number;
  columns: number;
};

/**
 * Greedy column assignment so overlapping timeline entries render side by side.
 * Entries without `durationMin` default to 30 minutes for layout calculation.
 */
export function layoutOverlaps<T extends { scheduledAt: string; durationMin?: number | null }>(
  entries: T[],
): TimelineLayoutEntry<T>[] {
  if (entries.length === 0) return [];

  interface IndexedItem {
    originalIndex: number;
    entry: T;
    startMs: number;
    endMs: number;
    column: number;
    clusterId: number;
    totalColumns: number;
  }

  const items: IndexedItem[] = entries.map((entry, originalIndex) => {
    const startMs = new Date(entry.scheduledAt).getTime();
    const duration = entry.durationMin && entry.durationMin > 0 ? entry.durationMin : 30;
    const endMs = startMs + duration * 60_000;
    return {
      originalIndex,
      entry,
      startMs,
      endMs,
      column: 0,
      clusterId: 0,
      totalColumns: 1,
    };
  });

  // Sort items primarily by startMs, then by endMs descending
  items.sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);

  // Group into overlapping clusters
  let currentClusterId = 0;
  let currentClusterEnd = -Infinity;
  const clusters: IndexedItem[][] = [];

  for (const item of items) {
    if (clusters.length === 0 || item.startMs >= currentClusterEnd) {
      currentClusterId++;
      currentClusterEnd = item.endMs;
      clusters.push([item]);
    } else {
      currentClusterEnd = Math.max(currentClusterEnd, item.endMs);
      clusters[clusters.length - 1].push(item);
    }
    item.clusterId = currentClusterId;
  }

  // Assign columns greedily within each cluster
  for (const cluster of clusters) {
    const columnEnds: number[] = [];

    for (const item of cluster) {
      let placedColumn = -1;
      for (let col = 0; col < columnEnds.length; col++) {
        if (columnEnds[col] <= item.startMs) {
          placedColumn = col;
          columnEnds[col] = item.endMs;
          break;
        }
      }
      if (placedColumn === -1) {
        placedColumn = columnEnds.length;
        columnEnds.push(item.endMs);
      }
      item.column = placedColumn;
    }

    const totalColumns = columnEnds.length;
    for (const item of cluster) {
      item.totalColumns = totalColumns;
    }
  }

  // Restore original ordering
  const result: TimelineLayoutEntry<T>[] = new Array(entries.length);
  for (const item of items) {
    result[item.originalIndex] = {
      ...item.entry,
      column: item.column,
      columns: item.totalColumns,
    };
  }

  return result;
}

/**
 * Extracts weekday index (Monday=0 ... Sunday=6) from a 'YYYY-MM-DD' string, or from the
 * Europe/Istanbul calendar day of a Date instant. Zone-independent: the weekday is computed
 * from the calendar date with UTC arithmetic, never from the process (browser) zone.
 */
function getWeekdayIndex(date: Date | string): number {
  const ymd = typeof date === "string" ? date : dateYmdIstanbul(date);
  const [y, m, d] = ymd.split("-").map(Number);
  // Month is 0-indexed in Date.UTC
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Returns Evkat segments that apply to the given date's weekday.
 *
 * Days of week bitmask order (matches /evkat and API):
 * Bit 0 = Monday (1) ... Bit 6 = Sunday (64).
 */
export function segmentsForWeekday(
  segments: RoutineSegmentResponse[],
  date: Date | string,
): RoutineSegmentResponse[] {
  const weekday = getWeekdayIndex(date);
  const todayMask = 1 << weekday;
  return segments.filter((segment) => (segment.daysOfWeek & todayMask) !== 0);
}
