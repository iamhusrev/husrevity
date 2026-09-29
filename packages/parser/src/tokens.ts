export interface TimeOfDay {
  hour: number;
  minute: number;
}

/** 1=Mon..7=Sun, matching luxon's DateTime.weekday. Shared by index.ts and this file. */
export const WEEKDAY_CODES: Record<string, number> = {
  pzt: 1,
  sal: 2,
  çar: 3,
  per: 4,
  cum: 5,
  cmt: 6,
  paz: 7,
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
  pazar: 7,
};

const alternation = (names: string[]) =>
  [...names].sort((a, b) => b.length - a.length).join('|'); // longest first: cumartesi before cuma

const ALL_WEEKDAYS = Object.keys(WEEKDAY_CODES);

/**
 * Weekday words for "her <weekday>" (recurrence): every abbreviation and full
 * name, including bare "pazar" — "her pazar" is unambiguous.
 */
export const WEEKDAY_ALT_RECURRING = alternation(ALL_WEEKDAYS);

/**
 * Weekday words for a one-off date. Bare "pazar" is excluded because it is
 * just as often the word for "market" ("pazar alışverişi") — it only counts
 * as Sunday when followed by "günü" ("pazar günü") or abbreviated ("paz").
 */
export const WEEKDAY_ALT_ONE_OFF = `${alternation(ALL_WEEKDAYS.filter((n) => n !== 'pazar'))}|pazar(?=\\s+(?:günü|gunu)(?![\\p{L}\\p{N}_]))`;

/** Optional trailing " günü" that belongs to the weekday phrase ("cuma günü") and is removed with it. */
export const WEEKDAY_SUFFIX = '(?:\\s+(?:günü|gunu))?';

const RFC5545_WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export interface ExtractResult<T> {
  rest: string;
  value: T | null;
}

function stripMatch(text: string, match: RegExpMatchArray): string {
  return text.replace(match[0], '').replace(/\s+/g, ' ').trim();
}

/**
 * Matches "14:30" (colon time) or "9da"/"14'te" (Turkish locative suffix
 * directly attached to the hour, no space) — deliberately narrow so it
 * doesn't false-positive on unrelated numbers in the title (a quantity,
 * an id, ...).
 */
export function extractTime(text: string): ExtractResult<TimeOfDay> {
  const colon = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (colon) {
    return {
      rest: stripMatch(text, colon),
      value: { hour: Number(colon[1]), minute: Number(colon[2]) },
    };
  }
  const suffix = text.match(/\b([01]?\d|2[0-3])'?(?:da|de|te|ta)\b/i);
  if (suffix) {
    return { rest: stripMatch(text, suffix), value: { hour: Number(suffix[1]), minute: 0 } };
  }
  return { rest: text, value: null };
}

/** Matches "#context" (Unicode-aware so Turkish letters count as word chars). */
export function extractContext(text: string): ExtractResult<string> {
  const m = text.match(/#([\p{L}0-9_]+)/u);
  if (!m) return { rest: text, value: null };
  return { rest: stripMatch(text, m), value: m[1] };
}

/** Matches "@proje" (a project reference by name/code, resolved by the caller). */
export function extractProjectRef(text: string): ExtractResult<string> {
  const m = text.match(/@([\p{L}0-9_]+)/u);
  if (!m) return { rest: text, value: null };
  return { rest: stripMatch(text, m), value: m[1] };
}

/** Matches "!yüksek" / "!orta" / "!düşük". */
export function extractPriority(text: string): ExtractResult<string> {
  const m = text.match(/!(yüksek|orta|düşük)\b/iu);
  if (!m) return { rest: text, value: null };
  return { rest: stripMatch(text, m), value: m[1].toLowerCase() };
}

export interface RecurrenceResult {
  rrule: string;
  /** Only set for a single-weekday weekly pattern ("her pzt") — the anchor day. */
  weekday?: number;
}

/** Matches "her gün" (daily) or "her <weekday>" (single-day weekly), e.g. "her pzt". */
export function extractRecurrence(text: string): ExtractResult<RecurrenceResult> {
  const daily = text.match(/\bher gün\b/i);
  if (daily) {
    return { rest: stripMatch(text, daily), value: { rrule: 'FREQ=DAILY' } };
  }
  const weekly = text.match(
    new RegExp(`(?<![\\p{L}\\p{N}_])her (${WEEKDAY_ALT_RECURRING})${WEEKDAY_SUFFIX}(?![\\p{L}\\p{N}_])`, 'iu'),
  );
  if (weekly) {
    const code = WEEKDAY_CODES[weekly[1].toLowerCase()];
    return {
      rest: stripMatch(text, weekly),
      value: { rrule: `FREQ=WEEKLY;BYDAY=${RFC5545_WEEKDAYS[code - 1]}`, weekday: code },
    };
  }
  return { rest: text, value: null };
}
