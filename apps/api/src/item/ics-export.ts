import { Item } from './item.entity';
import { findRruleProblem, stripRrulePrefix } from './rrule-validation';

/** The only item fields the serializer reads; payload and internal ids never reach the output. */
export type IcsItem = Pick<
  Item,
  | 'id'
  | 'kind'
  | 'title'
  | 'notes'
  | 'context'
  | 'scheduledAt'
  | 'dueAt'
  | 'durationMin'
  | 'rrule'
  | 'status'
  | 'completedAt'
>;

const TZID = 'Europe/Istanbul';
/**
 * Turkey has used a fixed UTC+03:00 with no DST since 2016; the product pins it.
 * Assumption D-8: anchors dated before 2016 may differ from the real EET/EEST
 * wall clock (+02:00/+03:00 with DST), so their exported local time can be off
 * by up to one hour. The product accepts this; the VTIMEZONE below is fixed too.
 */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DEFAULT_DURATION_MIN = 30;
const MAX_LINE_OCTETS = 75;
const CRLF = '\r\n';

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and line breaks. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/[\\;,]/g, (c) => `\\${c}`)
    .replace(/\n/g, '\\n');
}

/**
 * Folds a content line at 75 octets (UTF-8). Continuation lines start with a
 * single space, which counts toward their 75 octets. Code points are never split.
 */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let currentOctets = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (currentOctets + size > MAX_LINE_OCTETS) {
      parts.push(current);
      current = ' ';
      currentOctets = 1;
    }
    current += ch;
    currentOctets += size;
  }
  parts.push(current);
  return parts.join(CRLF);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** YYYYMMDDTHHMMSS in Istanbul wall-clock time (floating, paired with TZID). */
function localStamp(utc: Date): string {
  const d = new Date(utc.getTime() + ISTANBUL_OFFSET_MS);
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

/** YYYYMMDDTHHMMSSZ in UTC. */
function utcStamp(utc: Date): string {
  return (
    `${pad(utc.getUTCFullYear(), 4)}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}` +
    `T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}${pad(utc.getUTCSeconds())}Z`
  );
}

/**
 * Returns the RRULE value to emit, or null when the stored rule must not be
 * exported (it does not parse or has an unsupported frequency).
 *
 * RFC 5545 section 3.3.10: with a TZID DTSTART, UNTIL must be a UTC date-time.
 * The app stores UNTIL as a wall-clock Istanbul value (either date-only
 * `YYYYMMDD`, or a local time carrying a `Z`). Assumption: the date part is the
 * last Istanbul day of the series, so UNTIL becomes 23:59:59 Istanbul, which is
 * 20:59:59Z of that same date (fixed +03:00 offset).
 */
export function normalizeRruleForExport(raw: string): string | null {
  const value = stripRrulePrefix(raw);
  if (value === '' || findRruleProblem(value)) return null;
  return value.replace(
    /UNTIL=(\d{8})(?:T\d{6}Z?)?(?=;|$)/i,
    (_m, date: string) => `UNTIL=${date}T205959Z`,
  );
}

/** Date part of an `occursOn` (YYYY-MM-DD) plus the local time-of-day of `anchor`. */
function exdateStamp(occursOn: string, anchor: Date): string {
  return `${occursOn.replace(/-/g, '')}${localStamp(anchor).slice(8)}`;
}

function eventLines(
  item: IcsItem,
  dtstamp: string,
  rrule: string | null,
  excluded: string[],
): string[] {
  const start = item.scheduledAt as Date;
  const end = new Date(start.getTime() + (item.durationMin ?? DEFAULT_DURATION_MIN) * 60_000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:item-${item.id}@husrevity`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${TZID}:${localStamp(start)}`,
    `DTEND;TZID=${TZID}:${localStamp(end)}`,
  ];
  if (rrule) {
    lines.push(`RRULE:${rrule}`);
    for (const occursOn of excluded) {
      lines.push(`EXDATE;TZID=${TZID}:${exdateStamp(occursOn, start)}`);
    }
  }
  lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
  if (item.notes) lines.push(`DESCRIPTION:${escapeIcsText(item.notes)}`);
  if (item.context) lines.push(`CATEGORIES:${escapeIcsText(item.context)}`);
  lines.push('STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT');
  return lines;
}

function todoLines(item: IcsItem, dtstamp: string): string[] {
  const due = item.dueAt as Date;
  const done = item.status === 'done';
  const lines = [
    'BEGIN:VTODO',
    `UID:item-${item.id}@husrevity`,
    `DTSTAMP:${dtstamp}`,
    `DUE;TZID=${TZID}:${localStamp(due)}`,
    `SUMMARY:${escapeIcsText(item.title)}`,
  ];
  if (item.notes) lines.push(`DESCRIPTION:${escapeIcsText(item.notes)}`);
  if (item.context) lines.push(`CATEGORIES:${escapeIcsText(item.context)}`);
  // RFC 5545 has no CONFIRMED for VTODO; an open task is NEEDS-ACTION.
  lines.push(`STATUS:${done ? 'COMPLETED' : 'NEEDS-ACTION'}`);
  if (done && item.completedAt) lines.push(`COMPLETED:${utcStamp(item.completedAt)}`);
  lines.push('SEQUENCE:0', 'END:VTODO');
  return lines;
}

/**
 * Serialises items as an RFC 5545 calendar. An item with `scheduledAt` becomes
 * a VEVENT (with its RRULE when recurring, exported once); an item with only
 * `dueAt` becomes a VTODO; anything else is skipped. A series whose rule does
 * not parse is dropped. Filtering (owner, status, range) is the caller's job.
 */
export interface BuildIcsOptions {
  /** Skipped occurrence dates (Istanbul YYYY-MM-DD) per item id, emitted as EXDATE. */
  excludedDates?: Map<string, string[]>;
}

export function buildIcs(items: IcsItem[], now: Date, options: BuildIcsOptions = {}): string {
  const dtstamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Husrevity//Husrevity//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Husrevity',
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0300',
    'TZNAME:+03',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const item of items) {
    if (item.scheduledAt) {
      const hasRule = !!item.rrule && item.rrule.trim() !== '';
      const rrule = hasRule ? normalizeRruleForExport(item.rrule as string) : null;
      if (hasRule && rrule === null) continue; // an unparseable series is never exported
      lines.push(...eventLines(item, dtstamp, rrule, options.excludedDates?.get(item.id) ?? []));
    } else if (item.dueAt) lines.push(...todoLines(item, dtstamp));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
