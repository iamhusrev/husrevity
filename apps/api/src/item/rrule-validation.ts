import { Frequency, RRule } from 'rrule';

/** Frequencies that are rejected on write: they explode into huge occurrence sets. */
const FORBIDDEN_FREQUENCIES = new Set<number>([Frequency.SECONDLY, Frequency.MINUTELY]);

/** Characters that can legitimately appear in a bare RFC 5545 RECUR value. */
const RECUR_CHARS = /^[A-Za-z0-9=;,+\-:]+$/;

/** Strips an optional `RRULE:` prefix and surrounding whitespace. */
export function stripRrulePrefix(rrule: string): string {
  return rrule.trim().replace(/^RRULE:/i, '');
}

/**
 * Returns a human-readable problem with a stored/submitted rrule, or null when
 * it is parseable and its frequency is supported (HOURLY or coarser).
 */
export function findRruleProblem(raw: string): string | null {
  const value = stripRrulePrefix(raw);
  if (!RECUR_CHARS.test(value)) {
    return 'rrule must be a bare RFC 5545 RECUR value such as FREQ=WEEKLY;BYDAY=MO';
  }
  let options;
  try {
    options = RRule.parseString(value);
    new RRule({ ...options, dtstart: new Date(Date.UTC(2026, 0, 1)) });
  } catch {
    return 'rrule could not be parsed';
  }
  if (options.freq === undefined || options.freq === null) {
    return 'rrule must contain a valid FREQ';
  }
  if (FORBIDDEN_FREQUENCIES.has(options.freq)) {
    return 'rrule FREQ must be HOURLY, DAILY, WEEKLY, MONTHLY or YEARLY';
  }
  if (options.count !== undefined && options.count !== null) {
    if (!Number.isInteger(options.count) || options.count < 1) {
      return 'rrule COUNT must be a positive integer';
    }
  }
  if (options.interval !== undefined && options.interval !== null) {
    if (!Number.isInteger(options.interval) || options.interval < 1) {
      return 'rrule INTERVAL must be a positive integer';
    }
  }
  return null;
}
