import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { RRule } from 'rrule';
import { Item } from './item.entity';

const ISTANBUL = 'Europe/Istanbul';

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
  expand(
    item: Pick<Item, 'scheduledAt' | 'rrule'>,
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

    return rule.between(fakeFrom, fakeTo, true).map((fakeOccurrence) => {
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
