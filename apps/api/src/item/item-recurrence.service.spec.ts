import { ItemRecurrenceService } from './item-recurrence.service';

describe('ItemRecurrenceService', () => {
  const service = new ItemRecurrenceService();

  it('returns nothing for an item with no rrule or no scheduledAt', () => {
    expect(
      service.expand(
        { scheduledAt: new Date('2026-01-01T06:00:00Z'), rrule: null },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).toEqual([]);
    expect(
      service.expand({ scheduledAt: null, rrule: 'FREQ=DAILY' }, new Date('2026-01-01'), new Date('2026-01-31')),
    ).toEqual([]);
  });

  it('expands FREQ=DAILY into one occurrence per day, at the anchor\'s Istanbul-local time', () => {
    // Anchored at 2026-01-01 06:00 Istanbul (03:00Z, fixed +03:00 offset in 2026).
    const item = { scheduledAt: new Date('2026-01-01T03:00:00Z'), rrule: 'FREQ=DAILY' };
    const result = service.expand(item, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-05T00:00:00Z'));

    expect(result.map((o) => o.occursOn)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    expect(result[0].occursAt.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(result[1].occursAt.toISOString()).toBe('2026-01-02T03:00:00.000Z');
  });

  it('expands FREQ=WEEKLY;BYDAY=MO,WE,FR onto only the matching weekdays', () => {
    // 2026-01-01 is a Thursday in Istanbul; the first matching day on/after
    // the anchor is that same week's Friday, then Mon/Wed/Fri of the next.
    const item = { scheduledAt: new Date('2026-01-01T03:00:00Z'), rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' };
    const result = service.expand(item, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-14T00:00:00Z'));

    expect(result.map((o) => o.occursOn)).toEqual([
      '2026-01-02', // Fri (anchor week)
      '2026-01-05', // Mon
      '2026-01-07', // Wed
      '2026-01-09', // Fri
      '2026-01-12', // Mon
    ]);
  });

  it('produces exactly 52 Mondays across all of 2026 with no drift at the fixed +03:00 offset', () => {
    // Regression guard: a full year of pure calendar-day arithmetic must not
    // accumulate any UTC-offset drift. 2026-01-01 is a Thursday, so the first
    // Monday is 2026-01-05; 2026 has 52 Mondays.
    const item = { scheduledAt: new Date('2026-01-01T03:00:00Z'), rrule: 'FREQ=WEEKLY;BYDAY=MO' };
    const result = service.expand(item, new Date('2026-01-01T00:00:00Z'), new Date('2026-12-31T23:59:59Z'));

    expect(result).toHaveLength(52);
    expect(result[0].occursOn).toBe('2026-01-05');
    expect(result[result.length - 1].occursOn).toBe('2026-12-28');
    // Every single occurrence must land at exactly 03:00Z (06:00 Istanbul, +03:00) — no drift.
    for (const occ of result) {
      expect(occ.occursAt.getUTCHours()).toBe(3);
      expect(occ.occursAt.getUTCMinutes()).toBe(0);
    }
  });

  it('resolves the true historical Europe/Istanbul offset across the 2016 DST transition instead of assuming a flat +03:00', () => {
    // Turkey sprang forward on 2016-03-27 (02:00 -> 03:00 local) and never
    // fell back again that October, making this the last real DST
    // transition Europe/Istanbul ever had. Anchor daily at 06:00 local.
    const item = { scheduledAt: new Date('2016-03-20T04:00:00Z'), rrule: 'FREQ=DAILY' }; // 06:00 Istanbul while still on +02:00
    const result = service.expand(item, new Date('2016-03-25T00:00:00Z'), new Date('2016-03-30T00:00:00Z'));

    const byDate = new Map(result.map((o) => [o.occursOn, o.occursAt.toISOString()]));
    // Before the transition: 06:00 Istanbul = 04:00Z (+02:00).
    expect(byDate.get('2016-03-26')).toBe('2016-03-26T04:00:00.000Z');
    // After the transition: 06:00 Istanbul = 03:00Z (+03:00) — luxon resolves
    // this correctly via its IANA tz database, not a hardcoded offset.
    expect(byDate.get('2016-03-28')).toBe('2016-03-28T03:00:00.000Z');
    expect(byDate.get('2016-03-29')).toBe('2016-03-29T03:00:00.000Z');
  });
});
