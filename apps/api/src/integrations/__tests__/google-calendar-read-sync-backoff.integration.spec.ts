import 'reflect-metadata';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { GoogleEventsReader } from '../google-events-reader';
import { FakeGoogleApiError } from '../testing/fake-google-gateway';
import { createSyncFixture, fakeReader, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Failure handling of the read engine (Testcontainers, FakeGoogleGateway):
 * a revoked grant flips the connection to needs_reconnect and stops retries,
 * and per-subscription backoff keeps failing calendars from starving healthy
 * ones. Each test uses its own owners and calendars.
 */
jest.setTimeout(240_000);

describe('Google Calendar read engine failures (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let n = 0;

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    h.dataSource.query(sql, params);
  const newOwner = async (calendars: string[]): Promise<{ ownerId: string; subIds: string[] }> => {
    const ownerId = await f.createUser(`backoff-owner-${++n}@example.test`);
    const subIds: string[] = [];
    for (const c of calendars) subIds.push(await f.createSubscription(ownerId, c));
    return { ownerId, subIds };
  };
  const conn = async (ownerId: string) =>
    (await q(`SELECT status, last_error FROM google_calendar_connection WHERE owner_id = $1`, [ownerId]))[0] as {
      status: string;
      last_error: string | null;
    };
  /** Moves a subscription's backoff into the past, as if the wait had elapsed. */
  const elapse = (subId: string) =>
    q(`UPDATE google_calendar_subscription SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [subId]);
  /** Parks every subscription except the given ones far in the future, so a scenario competes only with itself. */
  const parkOthers = (keep: string[]) =>
    q(
      `UPDATE google_calendar_subscription SET next_attempt_at = now() + interval '1 day'
        WHERE id <> ALL($1::bigint[])`,
      [keep],
    );

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    f = await createSyncFixture(h);
  });

  afterAll(async () => {
    await h.close();
  });

  describe('revoked_grant_stops_retries', () => {
    it.each([
      ['invalid_grant', { status: 400, message: 'invalid_grant' }],
      ['401', { status: 401 }],
      ['403 insufficientPermissions', { status: 403, reason: 'insufficientPermissions' }],
      ['403 authError', { status: 403, reason: 'authError' }],
    ])('flips the connection to needs_reconnect on %s and never retries', async (_label, spec) => {
      const cal = `revoked-${++n}@example.test`;
      const { ownerId, subIds } = await newOwner([cal, `${cal}-b`]);
      await parkOthers(subIds);
      await q(`UPDATE google_calendar_subscription SET needs_sync_at = now() WHERE owner_id = $1`, [ownerId]);
      f.fake.injectFailure('events.list', spec);
      const calls = f.fake.callsTo('events.list').length;

      const first = await f.service.runDueSyncs();

      expect(first.results.some((r) => r.status === 'failed')).toBe(true);
      expect(f.fake.callsTo('events.list').length).toBe(calls + 1);
      const c = await conn(ownerId);
      expect(c.status).toBe('needs_reconnect');
      expect(c.last_error).toMatch(/^[a-z_ 0-9]{1,80}$/);
      for (const id of subIds) expect((await f.subscriptionRow(id)).needs_sync_at).toBeNull();

      // Later ticks never call Google for this owner again.
      await f.service.runDueSyncs();
      await f.service.runDueSyncs();
      expect(f.fake.callsTo('events.list').length).toBe(calls + 1);
    });

    it('keeps no token or raw Google payload in last_error', async () => {
      const { ownerId, subIds } = await newOwner([`leak-${++n}@example.test`]);
      f.fake.injectFailure('events.list', {
        status: 400,
        message: 'invalid_grant ya29.SECRET-ACCESS refresh_token=1//SECRET-REFRESH',
      });
      await f.service.syncSubscription(subIds[0]);
      const c = await conn(ownerId);
      const sub = await f.subscriptionRow(subIds[0]);
      expect(c.status).toBe('needs_reconnect');
      for (const text of [c.last_error ?? '', String(sub.last_error ?? '')]) {
        expect(text).not.toContain('SECRET');
      }
    });

    it.each([
      ['403 rateLimitExceeded', { status: 403, reason: 'rateLimitExceeded' }],
      ['403 userRateLimitExceeded', { status: 403, reason: 'userRateLimitExceeded' }],
      ['403 dailyLimitExceeded', { status: 403, reason: 'dailyLimitExceeded' }],
      ['403 forbidden (one calendar)', { status: 403, reason: 'forbidden' }],
      ['404 notFound (one calendar)', { status: 404, reason: 'notFound' }],
      ['500', { status: 500 }],
    ])('does not disconnect the account on %s, only backs off', async (_label, spec) => {
      const { ownerId, subIds } = await newOwner([`soft-${++n}@example.test`]);
      f.fake.injectFailure('events.list', spec);

      expect((await f.service.syncSubscription(subIds[0])).status).toBe('failed');

      expect((await conn(ownerId)).status).toBe('active');
      const sub = await f.subscriptionRow(subIds[0]);
      expect(sub.consecutive_failures).toBe(1);
      expect(sub.next_attempt_at).not.toBeNull();
      expect(new Date(sub.next_attempt_at as Date).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('backoff', () => {
    it('skips a subscription whose next attempt is in the future, grows exponentially with a cap and resets on success', async () => {
      const cal = `backoff-${++n}@example.test`;
      const { subIds } = await newOwner([cal]);
      const id = subIds[0];
      await parkOthers([id]);
      const delays: number[] = [];
      for (let i = 0; i < 9; i++) {
        f.fake.injectFailure('events.list', { status: 500 });
        await elapse(id);
        expect((await f.service.syncSubscription(id)).status).toBe('failed');
        const row = (
          await q<{ secs: number; failures: number }>(
            `SELECT extract(epoch FROM next_attempt_at - now())::float AS secs, consecutive_failures AS failures
               FROM google_calendar_subscription WHERE id = $1`,
            [id],
          )
        )[0];
        expect(row.failures).toBe(i + 1);
        delays.push(row.secs);
      }
      expect(delays[1]).toBeGreaterThan(delays[0] * 1.5);
      expect(delays[2]).toBeGreaterThan(delays[1] * 1.5);
      expect(delays[8]).toBeLessThanOrEqual(3600 + 1);
      expect(delays[8]).toBeGreaterThanOrEqual(delays[7] - 1);

      // Not due while the backoff runs, even though it is flagged.
      await q(`UPDATE google_calendar_subscription SET needs_sync_at = now() WHERE id = $1`, [id]);
      const before = f.fake.callsTo('events.list').length;
      expect((await f.service.runDueSyncs()).attempted).toBe(0);
      expect(f.fake.callsTo('events.list').length).toBe(before);

      // Wait elapsed + success resets the bookkeeping.
      await elapse(id);
      expect((await f.service.runDueSyncs()).results.map((r) => r.status)).toEqual(['rebuilt']);
      const ok = await f.subscriptionRow(id);
      expect(ok.consecutive_failures).toBe(0);
      expect(ok.next_attempt_at).toBeNull();
      expect(ok.last_error).toBeNull();
    });

    it('does not let 25 permanently failing subscriptions starve a healthy one', async () => {
      const failing = new Set<string>();
      const reader: GoogleEventsReader = {
        listEvents: async (ownerId, req) => {
          if (failing.has(req.calendarId)) throw new FakeGoogleApiError(500);
          return fakeReader(f.fake).listEvents(ownerId, req);
        },
      };
      const svc = f.makeService('true', reader);
      const prefix = `starve-${++n}`;
      const bad: string[] = [];
      for (let i = 0; i < 25; i++) {
        const cal = `${prefix}-bad-${i}@example.test`;
        failing.add(cal);
        const { subIds } = await newOwner([cal]);
        await q(`UPDATE google_calendar_subscription SET needs_sync_at = now() - interval '1 hour' WHERE id = $1`, [
          subIds[0],
        ]);
        bad.push(subIds[0]);
      }
      const goodCal = `${prefix}-good@example.test`;
      const { subIds: good } = await newOwner([goodCal]);
      await q(`UPDATE google_calendar_subscription SET needs_sync_at = now() WHERE id = $1`, [good[0]]);
      await parkOthers([...bad, good[0]]);

      for (let tick = 0; tick < 4; tick++) {
        await svc.runDueSyncs(20);
        for (const id of bad) await elapse(id);
        if ((await f.subscriptionRow(good[0])).last_sync_at) break;
      }

      expect((await f.subscriptionRow(good[0])).last_sync_at).not.toBeNull();
      expect((await f.subscriptionRow(good[0])).consecutive_failures).toBe(0);
      // Every failing one gets its turn across the ticks.
      await svc.runDueSyncs(20);
      for (const id of bad) {
        expect(Number((await f.subscriptionRow(id)).consecutive_failures)).toBeGreaterThanOrEqual(1);
      }
    });

    it('orders never-failed subscriptions ahead of failing ones in the same tick', async () => {
      const failing = new Set<string>();
      const seen: string[] = [];
      const reader: GoogleEventsReader = {
        listEvents: async (ownerId, req) => {
          seen.push(req.calendarId);
          if (failing.has(req.calendarId)) throw new FakeGoogleApiError(500);
          return fakeReader(f.fake).listEvents(ownerId, req);
        },
      };
      const svc = f.makeService('true', reader);
      const badCal = `order-bad-${++n}@example.test`;
      const goodCal = `order-good-${n}@example.test`;
      failing.add(badCal);
      const { subIds: bad } = await newOwner([badCal]);
      const { subIds: good } = await newOwner([goodCal]);
      await parkOthers([bad[0], good[0]]);
      await q(
        `UPDATE google_calendar_subscription SET needs_sync_at = now() - interval '1 hour', consecutive_failures = 3, next_attempt_at = NULL WHERE id = $1`,
        [bad[0]],
      );
      await q(`UPDATE google_calendar_subscription SET needs_sync_at = now() WHERE id = $1`, [good[0]]);

      await svc.runDueSyncs(1);

      expect(seen[0]).toBe(goodCal);
    });
  });
});
