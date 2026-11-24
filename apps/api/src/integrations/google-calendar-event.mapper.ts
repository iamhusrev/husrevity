/**
 * Pure helpers of the Google Calendar read engine: Google event -> stored row
 * mapping, the all-day date arithmetic and the sliding window math. No I/O, no
 * clock access (callers pass `now`), so every rule is unit-testable.
 *
 * Data minimisation: only the title (truncated to 255 chars) and timing fields
 * are mapped. Description, attendees, location and the like are never read.
 */

export const WINDOW_PAST_DAYS = 90;
export const WINDOW_FUTURE_DAYS = 365;
export const MAX_TITLE_LENGTH = 255;

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The subset of a Google Calendar event the engine reads. */
export interface GoogleEventDto {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  originalStartTime?: { date?: string | null; dateTime?: string | null } | null;
  recurringEventId?: string | null;
  recurrence?: string[] | null;
  htmlLink?: string | null;
  etag?: string | null;
  updated?: string | null;
}

export interface MappedGoogleEvent {
  googleEventId: string;
  recurringEventId: string | null;
  originalStartAt: Date | null;
  originalStartDate: string | null;
  status: 'confirmed' | 'tentative';
  title: string;
  allDay: boolean;
  startAt: Date | null;
  endAt: Date | null;
  startDate: string | null;
  endDateExclusive: string | null;
  htmlLink: string | null;
  etag: string | null;
  googleUpdatedAt: Date | null;
}

export interface SyncWindow {
  min: Date;
  max: Date;
}

/**
 * Adds whole days to a 'YYYY-MM-DD' string using pure calendar arithmetic (via
 * UTC internally, so no local timezone and no DST can shift the result).
 */
export function addDaysToDateString(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date string: ${date}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

/** UTC calendar date ('YYYY-MM-DD') of an instant. */
export function utcDateString(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * The stored window: from 90 days back to 365 days ahead, aligned to UTC
 * midnight so the bounds are stable within a day. Bounded storage for endless
 * series comes from asking Google for exactly this range with singleEvents.
 */
export function computeWindow(now: Date): SyncWindow {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    min: new Date(today - WINDOW_PAST_DAYS * DAY_MS),
    max: new Date(today + WINDOW_FUTURE_DAYS * DAY_MS),
  };
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Maps a non-cancelled Google event to a stored row, or null when it has no
 * usable start. Cancelled events are handled by the caller (deletion rules).
 */
export function mapGoogleEvent(ev: GoogleEventDto): MappedGoogleEvent | null {
  if (!ev.id) return null;
  const base = {
    googleEventId: ev.id,
    recurringEventId: ev.recurringEventId ?? null,
    status: (ev.status === 'tentative' ? 'tentative' : 'confirmed') as 'confirmed' | 'tentative',
    title: (ev.summary ?? '').slice(0, MAX_TITLE_LENGTH),
    htmlLink: ev.htmlLink ?? null,
    etag: ev.etag ?? null,
    googleUpdatedAt: parseInstant(ev.updated),
    originalStartAt: parseInstant(ev.originalStartTime?.dateTime),
    originalStartDate: isDateString(ev.originalStartTime?.date) ? ev.originalStartTime!.date! : null,
  };

  if (ev.start?.date) {
    if (!isDateString(ev.start.date)) return null;
    const startDate = ev.start.date;
    // Google's all-day end is already exclusive; a missing or non-advancing end
    // means a single day. The strings are stored as-is: no Date, no timezone.
    const rawEnd = isDateString(ev.end?.date) ? ev.end!.date! : null;
    const endDateExclusive = rawEnd && rawEnd > startDate ? rawEnd : addDaysToDateString(startDate, 1);
    return {
      ...base,
      allDay: true,
      startAt: null,
      endAt: null,
      startDate,
      endDateExclusive,
    };
  }

  const startAt = parseInstant(ev.start?.dateTime);
  if (!startAt) return null;
  const rawEnd = parseInstant(ev.end?.dateTime);
  const endAt = rawEnd && rawEnd >= startAt ? rawEnd : startAt;
  return { ...base, allDay: false, startAt, endAt, startDate: null, endDateExclusive: null };
}

/** True when the mapped event overlaps the window (all-day compared by date). */
export function overlapsWindow(ev: MappedGoogleEvent, window: SyncWindow): boolean {
  if (ev.allDay) {
    return (
      ev.startDate! < utcDateString(window.max) && ev.endDateExclusive! > utcDateString(window.min)
    );
  }
  return ev.startAt! < window.max && (ev.endAt! > window.min || ev.startAt! >= window.min);
}
