import { findOverlaps, OverlapRef, DEFAULT_OVERLAP_DURATION_MIN } from './plan-overlap';

const plan = (
  operationIndex: number,
  scheduledAt: string,
  durationMin: number | null,
  title = `plan ${operationIndex}`,
): OverlapRef => ({ source: 'plan', operationIndex, title, scheduledAt, durationMin });

const existing = (
  itemId: string,
  scheduledAt: string,
  durationMin: number | null,
  title = `existing ${itemId}`,
): OverlapRef => ({ source: 'existing', itemId, title, scheduledAt, durationMin });

// 2026-10-14 in Istanbul is UTC+3
const at = (hhmm: string, date = '2026-10-14') => `${date}T${hhmm}:00+03:00`;

describe('findOverlaps', () => {
  it('flags two planned items whose windows intersect on the same Istanbul day', () => {
    const warnings = findOverlaps([plan(0, at('09:00'), 60), plan(1, at('09:30'), 30)], []);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('overlap');
    expect(warnings[0].between.map((r) => r.operationIndex)).toEqual([0, 1]);
    expect(warnings[0].message).toContain('plan 0');
    expect(warnings[0].message).toContain('plan 1');
  });

  it('does not flag adjacent windows (end == next start)', () => {
    expect(findOverlaps([plan(0, at('09:00'), 60), plan(1, at('10:00'), 30)], [])).toEqual([]);
  });

  it('treats a null duration as 30 minutes for the check only', () => {
    expect(DEFAULT_OVERLAP_DURATION_MIN).toBe(30);
    const a = plan(0, at('09:00'), null);
    const overlapping = plan(1, at('09:29'), 15);
    const adjacent = plan(2, at('09:30'), 15);

    expect(findOverlaps([a, overlapping], [])).toHaveLength(1);
    expect(findOverlaps([a, adjacent], [])).toEqual([]);
    // the input is not mutated
    expect(a.durationMin).toBeNull();
  });

  it('does not flag items on different Istanbul days even when the UTC date matches', () => {
    // 2026-10-14T23:30+03:00 = 20:30Z ; 2026-10-15T00:10+03:00 = 21:10Z on the same UTC day
    const warnings = findOverlaps(
      [plan(0, at('23:30'), 30), plan(1, at('00:10', '2026-10-15'), 30)],
      [],
    );
    expect(warnings).toEqual([]);
  });

  it('groups by the Istanbul day, not the UTC day', () => {
    // both start on 2026-10-14 Istanbul but the first is 2026-10-13 in UTC
    const warnings = findOverlaps([plan(0, at('01:00'), 60), plan(1, at('01:30'), 30)], []);
    expect(warnings).toHaveLength(1);
  });

  it('flags a planned item against an existing scheduled item', () => {
    const warnings = findOverlaps(
      [plan(0, at('14:00'), 60)],
      [existing('7', at('14:30'), 30, 'Dentist')],
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].between[0].source).toBe('plan');
    expect(warnings[0].between[1]).toEqual(
      expect.objectContaining({ source: 'existing', itemId: '7', title: 'Dentist' }),
    );
  });

  it('never flags two existing items against each other', () => {
    expect(
      findOverlaps([], [existing('1', at('10:00'), 60), existing('2', at('10:30'), 60)]),
    ).toEqual([]);
  });

  it('does not flag a zero-length planned item that merely touches the boundary', () => {
    expect(findOverlaps([plan(0, at('09:00'), 60), plan(1, at('10:00'), 0)], [])).toEqual([]);
  });

  it('caps the number of warnings at the given limit', () => {
    const planned = Array.from({ length: 12 }, (_, i) => plan(i, at('09:00'), 60));
    expect(findOverlaps(planned, [], 5)).toHaveLength(5);
  });

  it('ignores entries with an unparseable scheduledAt', () => {
    expect(findOverlaps([plan(0, 'not-a-date', 60), plan(1, at('09:00'), 60)], [])).toEqual([]);
  });

  it('rebuilds recurring item instant from occursOn and template Istanbul time of day', () => {
    // Template created in January at 07:00 Istanbul (04:00Z)
    // Occurrence on 2026-10-14 intersects a planned item on 2026-10-14 at 07:00 Istanbul
    const existingRecurring: OverlapRef = {
      source: 'existing',
      itemId: '300',
      title: 'Daily Standup',
      scheduledAt: '2026-01-01T04:00:00.000Z',
      durationMin: 30,
      occursOn: '2026-10-14',
    };
    const warnings = findOverlaps([plan(0, at('07:00'), 30)], [existingRecurring]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].between[1].itemId).toBe('300');
  });
});
