import 'reflect-metadata';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { createSyncFixture, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Real-Postgres tests (disposable Testcontainers database) of the Google
 * Calendar read engine with the FakeGoogleGateway: tests 23-26 and the
 * integration half of test 27 of the plan. Each test uses its own owner and
 * calendar, so the shared container never leaks state between them.
 */
jest.setTimeout(240_000);

const CAL = 'cal@example.test';

describe('Google Calendar read engine (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let n = 0;

  const newSubscription = async (): Promise<{ ownerId: string; subId: string }> => {
    const ownerId = await f.createUser(`owner-${++n}@example.test`);
    return { ownerId, subId: await f.createSubscription(ownerId, CAL) };
  };
  const timed = (id: string, summary: string, startIso: string, endIso: string) => ({
    id,
    status: 'confirmed' as const,
    summary,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
  });
  const visibleIds = async (ownerId: string): Promise<string[]> =>
    (await f.service.findVisibleEvents(ownerId, new Date('2020-01-01Z'), new Date('2030-01-01Z')))
      .map((e) => e.googleEventId)
      .sort();

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    f = await createSyncFixture(h);
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    f.service.pageSize = 250;
  });

  // Fresh calendar id per test (n was just incremented) keeps the shared fake clean.
  const useCalendar = (): string => `${CAL}-${n}`;

  describe('flag', () => {
    it('does nothing while GOOGLE_CALENDAR_V2_ENABLED is not the literal true', async () => {
      const { subId } = await newSubscription();
      const before = f.fake.calls.length;
      for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
        const svc = f.makeService(flag);
        expect((await svc.syncSubscription(subId)).status).toBe('disabled');
        expect((await svc.advanceWindow(subId)).status).toBe('disabled');
        expect(await svc.runDueSyncs()).toEqual({ attempted: 0, results: [] });
      }
      expect(f.fake.calls.length).toBe(before);
      expect((await f.subscriptionRow(subId)).epoch).toBe(0);
    });
  });

  describe('delta_failure_applies_nothing', () => {
    it('leaves rows and the sync token unchanged when the second delta page fails', async () => {
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      const cal = useCalendar();
      const subId = await f.createSubscription(ownerId, cal);
      f.service.pageSize = 1;
      f.fake.seedEvent(cal, timed('a', 'A', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      f.fake.seedEvent(cal, timed('b', 'B', '2026-06-21T10:00:00Z', '2026-06-21T11:00:00Z'));
      expect((await f.service.syncSubscription(subId)).status).toBe('rebuilt');
      const tokenBefore = (await f.subscriptionRow(subId)).sync_token;
      const rowsBefore = await f.eventRows(subId);
      expect(rowsBefore).toHaveLength(2);

      // Three changed events over three pages; the second page fails.
      f.fake.upsertEvent(cal, timed('a', 'A renamed', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      f.fake.upsertEvent(cal, timed('c', 'C', '2026-06-22T10:00:00Z', '2026-06-22T11:00:00Z'));
      f.fake.cancelEvent(cal, 'b');
      const callsSoFar = f.fake.callsTo('events.list').length;
      f.fake.injectFailure('events.list', { status: 500, onCall: callsSoFar + 2 });

      const failed = await f.service.syncSubscription(subId);
      expect(failed.status).toBe('failed');
      const after = await f.subscriptionRow(subId);
      expect(after.sync_token).toBe(tokenBefore);
      expect(await f.eventRows(subId)).toEqual(rowsBefore);
      expect(after.last_error).toBe('google_500');
      expect(after.lease_holder).toBeNull();

      // The retry applies the whole delta at once.
      expect((await f.service.syncSubscription(subId)).status).toBe('synced');
      expect(await visibleIds(ownerId)).toEqual(['a', 'c']);
      expect((await f.subscriptionRow(subId)).sync_token).not.toBe(tokenBefore);
      expect((await f.subscriptionRow(subId)).last_error).toBeNull();
    });
  });

  describe('410_keeps_old_rows_until_swap', () => {
    it('keeps the old generation visible when a rebuild fails midway and swaps atomically on success', async () => {
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      const cal = useCalendar();
      const subId = await f.createSubscription(ownerId, cal);
      f.service.pageSize = 1;
      for (const id of ['a', 'b', 'c']) {
        f.fake.seedEvent(cal, timed(id, id, '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      }
      await f.service.syncSubscription(subId);
      const tokenBefore = (await f.subscriptionRow(subId)).sync_token;
      const generationBefore = (await f.subscriptionRow(subId)).active_generation;
      expect(await visibleIds(ownerId)).toEqual(['a', 'b', 'c']);

      // Google forgets the token; the calendar also changed meanwhile (b gone, f new).
      f.fake.expireSyncTokens(cal);
      f.fake.cancelEvent(cal, 'b');
      f.fake.seedEvent(cal, timed('f', 'f', '2026-06-23T10:00:00Z', '2026-06-23T11:00:00Z'));
      // Calls: 1 delta (410) + 3 token-walk pages (a, c, f) + window pages; fail window page 2.
      const start = f.fake.callsTo('events.list').length;
      f.fake.injectFailure('events.list', { status: 503, onCall: start + 1 + 3 + 2 });

      expect((await f.service.syncSubscription(subId)).status).toBe('failed');
      const mid = await f.subscriptionRow(subId);
      expect(mid.sync_token).toBe(tokenBefore);
      expect(mid.active_generation).toBe(generationBefore);
      // Old data is still what the user sees, the half-built generation is invisible.
      expect(await visibleIds(ownerId)).toEqual(['a', 'b', 'c']);
      const generations = new Set((await f.eventRows(subId)).map((r) => r.generation));
      expect(generations.size).toBe(2);

      f.fake.expireSyncTokens(cal);
      const done = await f.service.syncSubscription(subId);
      expect(done).toEqual({ status: 'rebuilt', reason: 'gone' });
      expect(await visibleIds(ownerId)).toEqual(['a', 'c', 'f']);
      const rows = await f.eventRows(subId);
      expect(new Set(rows.map((r) => r.generation))).toEqual(new Set([(await f.subscriptionRow(subId)).active_generation]));
      expect((await f.subscriptionRow(subId)).active_generation).toBe(Number(generationBefore) + 1);
      expect((await f.subscriptionRow(subId)).sync_token).not.toBe(tokenBefore);
    });
  });

  describe('cancelled_instance_and_master', () => {
    it('removes only the cancelled instance, then the whole series, then a single event', async () => {
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      const cal = useCalendar();
      const subId = await f.createSubscription(ownerId, cal);
      f.fake.seedEvent(cal, {
        id: 'm',
        status: 'confirmed',
        summary: 'Standup',
        start: { dateTime: '2026-06-10T10:00:00Z' },
        end: { dateTime: '2026-06-10T10:30:00Z' },
        recurrence: ['RRULE:FREQ=DAILY;COUNT=5'],
      });
      f.fake.seedEvent(cal, timed('s', 'Single', '2026-06-18T10:00:00Z', '2026-06-18T11:00:00Z'));
      await f.service.syncSubscription(subId);
      const series = [10, 11, 12, 13, 14].map((d) => `m_202606${d}T100000Z`);
      expect(await visibleIds(ownerId)).toEqual([...series, 's'].sort());

      // One instance cancelled: carries recurringEventId, so only its own row goes.
      f.fake.upsertEvent(cal, { id: 'm_20260612T100000Z', status: 'cancelled', recurringEventId: 'm' });
      expect((await f.service.syncSubscription(subId)).status).toBe('synced');
      expect(await visibleIds(ownerId)).toEqual(
        [...series.filter((i) => i !== 'm_20260612T100000Z'), 's'].sort(),
      );

      // The master cancelled: no recurringEventId, so the series goes, the single event stays.
      f.fake.cancelEvent(cal, 'm');
      expect((await f.service.syncSubscription(subId)).status).toBe('synced');
      expect(await visibleIds(ownerId)).toEqual(['s']);

      // A cancelled single event removes just itself.
      f.fake.cancelEvent(cal, 's');
      await f.service.syncSubscription(subId);
      expect(await visibleIds(ownerId)).toEqual([]);
    });

    it('re-reads the window when a series master changes and keeps the delta token', async () => {
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      const cal = useCalendar();
      const subId = await f.createSubscription(ownerId, cal);
      const master = {
        id: 'm',
        status: 'confirmed' as const,
        summary: 'Old title',
        start: { dateTime: '2026-06-10T10:00:00Z' },
        end: { dateTime: '2026-06-10T10:30:00Z' },
        recurrence: ['RRULE:FREQ=DAILY;COUNT=3'],
      };
      f.fake.seedEvent(cal, master);
      await f.service.syncSubscription(subId);
      f.fake.upsertEvent(cal, { ...master, summary: 'New title' });
      expect(await f.service.syncSubscription(subId)).toEqual({ status: 'rebuilt', reason: 'series_changed' });
      const titles = (await f.service.findVisibleEvents(ownerId, new Date('2026-01-01Z'), new Date('2027-01-01Z'))).map((e) => e.title);
      expect(titles).toEqual(['New title', 'New title', 'New title']);
    });
  });

  describe('endless_series_stays_in_window', () => {
    it('stores a bounded number of rows and moves the window forward on advance', async () => {
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      const cal = useCalendar();
      const subId = await f.createSubscription(ownerId, cal);
      f.clock.now = new Date('2026-06-15T08:00:00Z');
      f.fake.seedEvent(cal, {
        id: 'e',
        status: 'confirmed',
        summary: 'Daily forever',
        start: { dateTime: '2026-01-01T09:00:00Z' },
        end: { dateTime: '2026-01-01T09:30:00Z' },
        recurrence: ['RRULE:FREQ=DAILY'],
      });
      await f.service.syncSubscription(subId);
      const first = await f.eventRows(subId);
      // -90d .. +365d of daily instances, never the whole (infinite) series.
      expect(first.length).toBeGreaterThanOrEqual(455);
      expect(first.length).toBeLessThanOrEqual(456);
      const sub1 = await f.subscriptionRow(subId);
      const earliest1 = new Date(first[0].start_at as Date).getTime();
      expect(new Date(sub1.window_min as Date).toISOString()).toBe('2026-03-17T00:00:00.000Z');
      expect(new Date(sub1.window_max as Date).toISOString()).toBe('2027-06-15T00:00:00.000Z');
      const tokenBefore = sub1.sync_token;

      f.clock.now = new Date('2026-07-15T08:00:00Z'); // 30 days later
      expect(await f.service.advanceWindow(subId)).toEqual({ status: 'rebuilt', reason: 'window_advance' });
      const second = await f.eventRows(subId);
      expect(second.length).toBeGreaterThanOrEqual(455);
      expect(second.length).toBeLessThanOrEqual(456);
      expect(new Set(second.map((r) => r.generation)).size).toBe(1);
      const sub2 = await f.subscriptionRow(subId);
      expect(new Date(sub2.window_min as Date).toISOString()).toBe('2026-04-16T00:00:00.000Z');
      expect(new Date(sub2.window_max as Date).toISOString()).toBe('2027-07-15T00:00:00.000Z');
      const starts = second.map((r) => new Date(r.start_at as Date).getTime());
      expect(Math.min(...starts)).toBeGreaterThan(earliest1);
      // The advance keeps the incremental stream: same token, next delta is a plain sync.
      expect(sub2.sync_token).toBe(tokenBefore);
      expect((await f.service.syncSubscription(subId)).status).toBe('synced');
    });
  });

  describe('all_day_uses_exclusive_end (integration)', () => {
    it('stores all-day events as dates, including multi-day, and serves them as text', async () => {
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      const cal = useCalendar();
      const subId = await f.createSubscription(ownerId, cal);
      f.fake.seedEvent(cal, {
        id: 'one',
        status: 'confirmed',
        summary: 'Holiday',
        start: { date: '2026-06-20' },
        end: { date: '2026-06-21' },
      });
      f.fake.seedEvent(cal, {
        id: 'multi',
        status: 'confirmed',
        summary: 'Trip',
        start: { date: '2026-06-30' },
        end: { date: '2026-07-03' },
      });
      await f.service.syncSubscription(subId);
      const rows = await f.eventRows(subId);
      const one = rows.find((r) => r.google_event_id === 'one')!;
      expect(one).toMatchObject({ all_day: true, start_at: null, end_at: null, start_date: '2026-06-20', end_date_exclusive: '2026-06-21' });
      const multi = rows.find((r) => r.google_event_id === 'multi')!;
      expect(multi).toMatchObject({ start_date: '2026-06-30', end_date_exclusive: '2026-07-03' });

      const served = await f.service.findVisibleEvents(ownerId, new Date('2026-06-01Z'), new Date('2026-08-01Z'));
      expect(served.find((e) => e.googleEventId === 'multi')).toMatchObject({
        allDay: true,
        startDate: '2026-06-30',
        endDateExclusive: '2026-07-03',
        startAt: null,
      });
    });
  });

  describe('lease primitives', () => {
    it('grants one holder at a time and bumps the epoch on every acquire', async () => {
      const { subId } = await newSubscription();
      const a = await f.service.acquireLease(subId, 'worker-a');
      expect(a).not.toBeNull();
      expect(await f.service.acquireLease(subId, 'worker-b')).toBeNull();
      await f.service.releaseLease(a!);
      const b = await f.service.acquireLease(subId, 'worker-b');
      expect(b!.epoch).toBe(a!.epoch + 1);
      expect(await f.service.acquireLease('999999999', 'worker-c')).toBeNull();
    });
  });
});
