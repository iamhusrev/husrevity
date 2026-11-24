import {
  addDaysToDateString,
  computeWindow,
  mapGoogleEvent,
  overlapsWindow,
} from './google-calendar-event.mapper';

describe('google-calendar-event.mapper', () => {
  describe('all_day_uses_exclusive_end (unit)', () => {
    it('stores a single all-day event as dates with Google exclusive end and no instants', () => {
      const m = mapGoogleEvent({
        id: 'a',
        summary: 'Holiday',
        start: { date: '2026-03-15' },
        end: { date: '2026-03-16' },
      })!;
      expect(m.allDay).toBe(true);
      expect(m.startDate).toBe('2026-03-15');
      expect(m.endDateExclusive).toBe('2026-03-16');
      expect(m.startAt).toBeNull();
      expect(m.endAt).toBeNull();
    });

    it('regression: an all-day event is never an instant, so it cannot show at 03:00 Istanbul', () => {
      const m = mapGoogleEvent({ id: 'a', start: { date: '2026-03-15' }, end: { date: '2026-03-16' } })!;
      // The legacy bug stored UTC midnight (renders 03:00 in Istanbul) with no duration.
      expect(m.startAt).toBeNull();
      expect(JSON.stringify(m)).not.toContain('T00:00:00');
    });

    it('keeps a multi-day all-day event exclusive end untouched', () => {
      const m = mapGoogleEvent({ id: 'b', start: { date: '2026-12-30' }, end: { date: '2027-01-02' } })!;
      expect(m.startDate).toBe('2026-12-30');
      expect(m.endDateExclusive).toBe('2027-01-02');
    });

    it('defaults a missing or non-advancing end to the next day, across month and year ends', () => {
      expect(mapGoogleEvent({ id: 'c', start: { date: '2026-12-31' } })!.endDateExclusive).toBe('2027-01-01');
      expect(
        mapGoogleEvent({ id: 'd', start: { date: '2026-02-28' }, end: { date: '2026-02-28' } })!.endDateExclusive,
      ).toBe('2026-03-01');
    });

    it('does date arithmetic without any timezone drift', () => {
      expect(addDaysToDateString('2026-03-28', 1)).toBe('2026-03-29');
      expect(addDaysToDateString('2026-03-29', 1)).toBe('2026-03-30'); // DST change day in many zones
      expect(addDaysToDateString('2028-02-28', 1)).toBe('2028-02-29');
    });
  });

  describe('timed events and mapping', () => {
    it('maps instants with offsets exactly', () => {
      const m = mapGoogleEvent({
        id: 't',
        summary: 'Meet',
        start: { dateTime: '2026-05-01T10:00:00+03:00' },
        end: { dateTime: '2026-05-01T11:00:00+03:00' },
      })!;
      expect(m.allDay).toBe(false);
      expect(m.startAt!.toISOString()).toBe('2026-05-01T07:00:00.000Z');
      expect(m.endAt!.toISOString()).toBe('2026-05-01T08:00:00.000Z');
      expect(m.startDate).toBeNull();
      expect(m.endDateExclusive).toBeNull();
    });

    it('truncates the title to 255 characters and tolerates a missing title', () => {
      const long = 'x'.repeat(400);
      expect(
        mapGoogleEvent({ id: 'l', summary: long, start: { dateTime: '2026-05-01T10:00:00Z' } })!.title,
      ).toHaveLength(255);
      expect(mapGoogleEvent({ id: 'n', start: { dateTime: '2026-05-01T10:00:00Z' } })!.title).toBe('');
    });

    it('never copies description, attendees or location', () => {
      const m = mapGoogleEvent({
        id: 'p',
        start: { dateTime: '2026-05-01T10:00:00Z' },
        description: 'secret',
        attendees: [{ email: 'a@example.test' }],
        location: 'home',
      } as never)!;
      expect(JSON.stringify(m)).not.toMatch(/secret|example\.test|home/);
    });

    it('returns null without an id or a usable start', () => {
      expect(mapGoogleEvent({ start: { dateTime: '2026-05-01T10:00:00Z' } })).toBeNull();
      expect(mapGoogleEvent({ id: 'x' })).toBeNull();
      expect(mapGoogleEvent({ id: 'x', start: { dateTime: 'garbage' } })).toBeNull();
    });

    it('keeps the recurring link and the original start of an exception', () => {
      const m = mapGoogleEvent({
        id: 'm_20260501T100000Z',
        recurringEventId: 'm',
        originalStartTime: { dateTime: '2026-05-01T10:00:00Z' },
        start: { dateTime: '2026-05-01T12:00:00Z' },
        end: { dateTime: '2026-05-01T13:00:00Z' },
      })!;
      expect(m.recurringEventId).toBe('m');
      expect(m.originalStartAt!.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    });
  });

  describe('window math', () => {
    it('spans 90 days back to 365 days ahead, aligned to UTC midnight', () => {
      const w = computeWindow(new Date('2026-06-15T13:45:00Z'));
      expect(w.min.toISOString()).toBe('2026-03-17T00:00:00.000Z');
      expect(w.max.toISOString()).toBe('2027-06-15T00:00:00.000Z');
    });

    it('moves with the clock', () => {
      const a = computeWindow(new Date('2026-06-15T00:00:00Z'));
      const b = computeWindow(new Date('2026-06-16T23:59:00Z'));
      expect(b.min.getTime() - a.min.getTime()).toBe(86_400_000);
    });

    it('decides overlap for timed and all-day events', () => {
      const w = computeWindow(new Date('2026-06-15T00:00:00Z'));
      const timed = (iso: string) =>
        mapGoogleEvent({ id: 't', start: { dateTime: iso }, end: { dateTime: iso } })!;
      expect(overlapsWindow(timed('2026-06-15T10:00:00Z'), w)).toBe(true);
      expect(overlapsWindow(timed('2028-01-01T10:00:00Z'), w)).toBe(false);
      expect(overlapsWindow(timed('2025-01-01T10:00:00Z'), w)).toBe(false);
      const day = (d: string) => mapGoogleEvent({ id: 'd', start: { date: d } })!;
      expect(overlapsWindow(day('2026-06-15'), w)).toBe(true);
      expect(overlapsWindow(day('2027-06-15'), w)).toBe(false); // max is exclusive
      expect(overlapsWindow(day('2026-03-16'), w)).toBe(false); // ends exactly at min
    });
  });
});
