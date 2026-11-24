import { GoogleFeedEvent } from "@/services/integrations-service";
import { ItemResponse } from "@/types/item/item";
import { dateYmdIstanbul, minutesOfDayIstanbul } from "@/utils/today-board";

/** One Google event placed on one calendar day. */
export interface GoogleDayEvent {
  event: GoogleFeedEvent;
  /** "HH:mm" (Europe/Istanbul) for timed events, null for all-day. */
  timeLabel: string | null;
}

/** Safety cap so a malformed range cannot loop for long. */
const MAX_SPAN_DAYS = 120;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmd(ymd: string | null): number | null {
  if (!ymd) return null;
  const m = YMD_RE.exec(ymd);
  if (!m) return null;
  // Calendar-date arithmetic in UTC: the text is never parsed as an instant in the user's zone.
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function ymdOf(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

function formatTime(iso: string): string {
  const mins = minutesOfDayIstanbul(iso);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function daysOf(event: GoogleFeedEvent): string[] {
  if (event.allDay) {
    const start = parseYmd(event.startDate);
    if (start === null) return [];
    const endExclusive = parseYmd(event.endDateExclusive);
    const last = endExclusive !== null && endExclusive > start ? endExclusive - DAY_MS : start;
    const days: string[] = [];
    for (let d = start; d <= last && days.length < MAX_SPAN_DAYS; d += DAY_MS) {
      days.push(ymdOf(d));
    }
    return days;
  }
  if (!event.startAt) return [];
  const first = dateYmdIstanbul(event.startAt);
  const endMs = event.endAt ? Date.parse(event.endAt) : NaN;
  const startMs = Date.parse(event.startAt);
  if (Number.isNaN(endMs) || endMs <= startMs) return [first];
  // The end instant is exclusive, so a 00:00 end belongs to the previous day.
  const lastDay = dateYmdIstanbul(new Date(endMs - 1));
  const from = parseYmd(first);
  const to = parseYmd(lastDay);
  if (from === null || to === null || to <= from) return [first];
  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_SPAN_DAYS; d += DAY_MS) {
    days.push(ymdOf(d));
  }
  return days;
}

/** Groups Google feed events by calendar day; all-day entries first, then by start time. */
export function groupGoogleEventsByDay(events: GoogleFeedEvent[]): Record<string, GoogleDayEvent[]> {
  const groups: Record<string, GoogleDayEvent[]> = {};
  for (const event of events) {
    if (event.status === "cancelled") continue;
    const timeLabel = !event.allDay && event.startAt ? formatTime(event.startAt) : null;
    for (const day of daysOf(event)) {
      (groups[day] ??= []).push({ event, timeLabel });
    }
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => {
      if (a.timeLabel === b.timeLabel) return a.event.title.localeCompare(b.event.title);
      if (a.timeLabel === null) return -1;
      if (b.timeLabel === null) return 1;
      return a.timeLabel.localeCompare(b.timeLabel);
    });
  }
  return groups;
}

/** Drops legacy `source==='gcal'` items the Google feed already serves. Other items are untouched. */
export function hideLegacyGcalItems(items: ItemResponse[], hiddenIds: string[]): ItemResponse[] {
  if (hiddenIds.length === 0) return items;
  const hidden = new Set(hiddenIds);
  return items.filter((item) => !(item.source === "gcal" && hidden.has(item.id)));
}
