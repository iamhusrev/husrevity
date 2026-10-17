import { DateTime } from 'luxon';
import { Frequency, RRule } from 'rrule';
import { findRruleProblem } from '../../api/src/item/rrule-validation';

/** Mirrors MAX_OCCURRENCES_PER_SERIES / MAX_SCAN_ITERATIONS in item-recurrence.service.ts. */
export const MAX_OCCURRENCES_PER_SERIES = 1000;
export const MAX_SCAN_ITERATIONS = 100_000;

export interface Occurrence {
  /** Local calendar date in the given zone, YYYY-MM-DD. */
  occursOn: string;
  /** The concrete UTC instant, ISO-8601 with milliseconds and a Z suffix. */
  occursAt: string;
}

function toFakeUtc(local: DateTime): Date {
  return new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second),
  );
}

function toZone(iso: string, zone: string): DateTime {
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone);
  if (!dt.isValid) throw new Error(`invalid date or zone: ${iso} / ${zone}`);
  return dt;
}

/** Smallest possible length of one rrule iteration step, in ms, per frequency. */
const MIN_STEP_MS: Record<number, number> = {
  [Frequency.YEARLY]: 365 * 86_400_000,
  [Frequency.MONTHLY]: 28 * 86_400_000,
  [Frequency.WEEKLY]: 7 * 86_400_000,
  [Frequency.DAILY]: 86_400_000,
  [Frequency.HOURLY]: 3_600_000,
};

/**
 * rrule only reports matching dates, so a rule that can never match (31 February) is searched
 * all the way to year 9999 without a single callback, which the iteration cap cannot interrupt.
 * rrule re-reads options.interval once or twice per scan step, so a counting getter on it gives a
 * deterministic budget: the number of steps needed to get past `fakeTo` (later results are
 * discarded anyway) plus generous slack. Exceeding it throws the returned sentinel.
 */
function limitScanToRange(rule: RRule, fakeTo: Date): symbol {
  const stop = Symbol('scan-limit');
  const { dtstart, freq, interval } = rule.options;
  const step = (MIN_STEP_MS[freq] ?? 1000) * Math.max(interval, 1);
  const steps = Math.max(0, fakeTo.getTime() - dtstart.getTime()) / step + 2;
  const budget = Math.ceil(steps) * 8 + 64;
  let reads = 0;
  Object.defineProperty(rule.options, 'interval', {
    get() {
      if (++reads > budget) throw stop;
      return interval;
    },
  });
  return stop;
}

/**
 * Same algorithm as ItemRecurrenceService.expand (fake-UTC technique), with the
 * zone as a parameter instead of the hard-coded Europe/Istanbul.
 */
export function expandOccurrences(
  rruleText: string,
  startIso: string,
  fromIso: string,
  toIso: string,
  zone: string,
): Occurrence[] {
  if (!rruleText || !startIso) return [];
  const problem = findRruleProblem(rruleText);
  if (problem) throw new Error(problem);

  const fakeFrom = toFakeUtc(toZone(fromIso, zone));
  const fakeTo = toFakeUtc(toZone(toIso, zone));

  const rule = new RRule({
    ...RRule.parseString(rruleText),
    dtstart: toFakeUtc(toZone(startIso, zone)),
  });
  const stop = limitScanToRange(rule, fakeTo);

  const fakes: Date[] = [];
  try {
    rule.all((date, index) => {
      if (date > fakeTo) return false;
      if (index >= MAX_SCAN_ITERATIONS) return false;
      if (date < fakeFrom) return true;
      if (fakes.length >= MAX_OCCURRENCES_PER_SERIES) return false;
      fakes.push(date);
      return true;
    });
  } catch (e) {
    if (e !== stop) throw e;
  }

  return fakes.map((fake) => {
    const real = DateTime.fromObject(
      {
        year: fake.getUTCFullYear(),
        month: fake.getUTCMonth() + 1,
        day: fake.getUTCDate(),
        hour: fake.getUTCHours(),
        minute: fake.getUTCMinutes(),
        second: fake.getUTCSeconds(),
      },
      { zone },
    );
    return { occursOn: real.toFormat('yyyy-MM-dd'), occursAt: real.toUTC().toISO()! };
  });
}
