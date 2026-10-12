import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { RRule } from 'rrule';
import { Item } from './item.entity';

const ISTANBUL = 'Europe/Istanbul';

/** Hard cap on occurrences returned per series per expand() call. */
export const MAX_OCCURRENCES_PER_SERIES = 1000;
/**
 * Hard cap on rule iterations per expand() call, including occurrences before
 * the requested range. Protects the single Node thread from already-stored
 * rules with a very high frequency and a far-past anchor.
 */
export const MAX_SCAN_ITERATIONS = 100_000;

export interface RecurrenceOccurrence {
  /** The item's local (Europe/Istanbul) calendar date — YYYY-MM-DD. */
  occursOn: string;
  /** The concrete UTC instant this occurrence falls at. */
  occursAt: Date;
}

/**
 * Expands an item's bare RFC5545 `rrule` (anchored at `scheduledAt`) into
 * concrete occurrences within a date range.
 *
 * `rrule`'s own calendar arithmetic is timezone-naive — it operates on a
 * JS Date's UTC getters directly. To get correct Europe/Istanbul wall-clock
 * semantics (a no-op today, since Turkey has used a fixed UTC+3 offset with
 * no DST since 2016 — but historical data may predate that), this service
 * uses rrule's standard "fake-UTC" technique: feed rrule Date objects whose
 * UTC components actually encode the *local* wall time, let it do pure
 * calendar math, then re-interpret each result through `luxon`'s real
 * Europe/Istanbul IANA timezone data to get the true UTC instant.
 */
@Injectable()
export class ItemRecurrenceService {
  private readonly logger = new Logger(ItemRecurrenceService.name);

  expand(
    item: Pick<Item, 'scheduledAt' | 'rrule'> & { id?: string },
    fromUtc: Date,
    toUtc: Date,
  ): RecurrenceOccurrence[] {
    if (!item.rrule || !item.scheduledAt) return [];

    const rule = new RRule({
      ...RRule.parseString(item.rrule),
      dtstart: this.toFakeUtc(this.toIstanbul(item.scheduledAt)),
    });

    const fakeFrom = this.toFakeUtc(this.toIstanbul(fromUtc));
    const fakeTo = this.toFakeUtc(this.toIstanbul(toUtc));

    const fakeOccurrences: Date[] = [];
    let truncated = false;
    rule.all((date, index) => {
      if (date > fakeTo) return false;
      if (index >= MAX_SCAN_ITERATIONS) {
        truncated = true;
        return false;
      }
      if (date < fakeFrom) return true;
      if (fakeOccurrences.length >= MAX_OCCURRENCES_PER_SERIES) {
        truncated = true;
        return false;
      }
      fakeOccurrences.push(date);
      return true;
    });
    if (truncated) {
      this.logger.warn(
        `Recurrence expansion truncated for item ${item.id ?? 'unknown'} ` +
          `(cap ${MAX_OCCURRENCES_PER_SERIES} occurrences / ${MAX_SCAN_ITERATIONS} iterations)`,
      );
    }

    return fakeOccurrences.map((fakeOccurrence) => {
      const real = DateTime.fromObject(
        {
          year: fakeOccurrence.getUTCFullYear(),
          month: fakeOccurrence.getUTCMonth() + 1,
          day: fakeOccurrence.getUTCDate(),
          hour: fakeOccurrence.getUTCHours(),
          minute: fakeOccurrence.getUTCMinutes(),
          second: fakeOccurrence.getUTCSeconds(),
        },
        { zone: ISTANBUL },
      );
      return { occursOn: real.toFormat('yyyy-MM-dd'), occursAt: real.toUTC().toJSDate() };
    });
  }

  private toIstanbul(utc: Date): DateTime {
    return DateTime.fromJSDate(utc, { zone: 'utc' }).setZone(ISTANBUL);
  }

  private toFakeUtc(local: DateTime): Date {
    return new Date(
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second),
    );
  }
}
