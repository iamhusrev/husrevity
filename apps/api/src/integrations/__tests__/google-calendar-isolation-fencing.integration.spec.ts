import 'reflect-metadata';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { GoogleEventDto } from '../google-calendar-event.mapper';
import { GoogleEventsListRequest, GoogleEventsReader } from '../google-events-reader';
import { LeaseLostError } from '../google-calendar-read-sync.service';
import { createSyncFixture, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Real-Postgres tests (disposable Testcontainers database) for plan tests
 * 28-32: user isolation, the "husrevityId cannot touch items" proof, the
 * legacy/managed duplicate rules, lease fencing and deselect/reselect.
 */
jest.setTimeout(240_000);

const timed = (id: string, summary: string, startIso: string, endIso: string) => ({
  id,
  status: 'confirmed' as const,
  summary,
  start: { dateTime: startIso },
  end: { dateTime: endIso },
});

describe('Google Calendar isolation and fencing (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let n = 0;
  const email = (): string => `user-${++n}@example.test`;
  const FAR = { from: new Date('2020-01-01Z'), to: new Date('2030-01-01Z') };

  /** Reader whose every listEvents call can be intercepted (to interleave other actors). */
  type Hook = (callNo: number, req: GoogleEventsListRequest) => Promise<void>;
  const hookedReader = (opts: { hook?: () => Hook | null; calendarFor?: (ownerId: string, id: string) => string }) => {
    let calls = 0;
    const reader: GoogleEventsReader = {
      listEvents: async (ownerId, req) => {
        calls += 1;
        await opts.hook?.()?.(calls, req);
        const calendarId = opts.calendarFor ? opts.calendarFor(ownerId, req.calendarId) : req.calendarId;
        const res = await f.fake.eventsList({ ...req, calendarId });
        return { ...res, items: res.items as GoogleEventDto[] };
      },
    };
    return { reader, calls: () => calls };
  };

  const visible = async (ownerId: string): Promise<string[]> =>
    (await f.service.findVisibleEvents(ownerId, FAR.from, FAR.to)).map((e) => e.googleEventId).sort();

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    f = await createSyncFixture(h);
  });

  afterAll(async () => {
    await h.close();
  });

  describe('same_event_id_across_users', () => {
    it('keeps an identical Google event id of two users in the same shared calendar fully isolated', async () => {
      const a = await f.createUser(email());
      const b = await f.createUser(email());
      const shared = 'shared-calendar@example.test';
      const subA = await f.createSubscription(a, shared);
      const subB = await f.createSubscription(b, shared);
      // Same Google calendar and event id; each user's account sees its own copy of the data.
      const { reader } = hookedReader({ calendarFor: (ownerId) => `${shared}#${ownerId === a ? 'a' : 'b'}` });
      const svc = f.makeService('true', reader);
      f.fake.seedEvent(`${shared}#a`, timed('evt-1', 'A view', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      f.fake.seedEvent(`${shared}#b`, timed('evt-1', 'B view', '2026-06-21T10:00:00Z', '2026-06-21T11:00:00Z'));

      await svc.syncSubscription(subA);
      // B has not synced yet: nothing of A's data leaks into B, and B has no rows.
      expect(await visible(b)).toEqual([]);
      expect(await f.eventRows(subB)).toEqual([]);

      await svc.syncSubscription(subB);
      const forA = await svc.findVisibleEvents(a, FAR.from, FAR.to);
      const forB = await svc.findVisibleEvents(b, FAR.from, FAR.to);
      expect(forA.map((e) => [e.googleEventId, e.title])).toEqual([['evt-1', 'A view']]);
      expect(forB.map((e) => [e.googleEventId, e.title])).toEqual([['evt-1', 'B view']]);
      expect(forA[0].subscriptionId).toBe(subA);
      expect(forB[0].subscriptionId).toBe(subB);

      // A cancellation and an update on A's side touch only A's rows.
      f.fake.cancelEvent(`${shared}#a`, 'evt-1');
      f.fake.upsertEvent(`${shared}#b`, timed('evt-1', 'B renamed', '2026-06-21T10:00:00Z', '2026-06-21T11:00:00Z'));
      await svc.syncSubscription(subA);
      expect(await visible(a)).toEqual([]);
      expect((await svc.findVisibleEvents(b, FAR.from, FAR.to)).map((e) => e.title)).toEqual(['B view']);
      await svc.syncSubscription(subB);
      expect((await svc.findVisibleEvents(b, FAR.from, FAR.to)).map((e) => e.title)).toEqual(['B renamed']);
      // Rows are never attributed to the wrong owner.
      const owners = await h.dataSource.query(
        `SELECT DISTINCT owner_id::text AS o FROM google_calendar_event WHERE subscription_id = $1`,
        [subB],
      );
      expect(owners).toEqual([{ o: b }]);
    });
  });

  describe('husrevity_id_cannot_touch_items', () => {
    it('never modifies items or external_link, even for an event carrying a victim item id', async () => {
      const victim = await f.createUser(email());
      const attacker = await f.createUser(email());
      const itemId = await f.createItem(victim, 'Victim meeting', 'web');
      const legacyId = await f.createItem(victim, 'Legacy copy', 'gcal');
      await h.dataSource.query(
        `INSERT INTO external_link (item_id, provider, external_id) VALUES ($1, 'google_calendar', 'victim-evt')`,
        [legacyId],
      );
      const cal = `forged-${n}@example.test`;
      const sub = await f.createSubscription(attacker, cal);
      f.fake.seedEvent(cal, {
        ...timed('victim-evt', 'Pwned title', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'),
        extendedProperties: { private: { husrevityId: itemId } },
      } as never);
      const before = await f.itemsSnapshot();

      await f.service.syncSubscription(sub);
      f.fake.cancelEvent(cal, 'victim-evt');
      await f.service.syncSubscription(sub);
      f.fake.upsertEvent(cal, {
        ...timed('victim-evt', 'Pwned again', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'),
        extendedProperties: { private: { husrevityId: legacyId } },
      } as never);
      await f.service.syncSubscription(sub);

      expect(await f.itemsSnapshot()).toBe(before);
      expect((await f.service.findVisibleEvents(victim, FAR.from, FAR.to)).length).toBe(0);
    });
  });

  describe('legacy_and_managed_copy_show_once', () => {
    const legacyCal = 'legacy-husrevity@example.test';

    it('hides legacy gcal item copies only after the first successful sync of the legacy calendar subscription', async () => {
      const owner = await f.createUser(email());
      const other = await f.createUser(email());
      await f.createLegacyAccount(owner, legacyCal);
      const legacyItem = await f.createItem(owner, 'Old Google copy', 'gcal');
      const webItem = await f.createItem(owner, 'Native item', 'web');
      const otherLegacy = await f.createItem(other, 'Other user copy', 'gcal');
      const sub = await f.createSubscription(owner, legacyCal);
      f.fake.seedEvent(legacyCal, timed('e1', 'Old Google copy', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));

      // Selected but never synced: the legacy copy must stay visible (no data gap).
      expect((await f.service.findFeed(owner, FAR.from, FAR.to)).hiddenLegacyItemIds).toEqual([]);

      // Calendar unreachable on the first attempt: still visible.
      f.fake.injectFailure('events.list', { status: 503, onCall: f.fake.callsTo('events.list').length + 1 });
      expect((await f.service.syncSubscription(sub)).status).toBe('failed');
      const stillVisible = await f.service.findFeed(owner, FAR.from, FAR.to);
      expect(stillVisible.hiddenLegacyItemIds).toEqual([]);
      expect(stillVisible.events).toEqual([]);

      // First successful sync: the Google event is served once, the legacy copy is hidden.
      expect((await f.service.syncSubscription(sub)).status).toBe('rebuilt');
      const feed = await f.service.findFeed(owner, FAR.from, FAR.to);
      expect(feed.events.map((e) => e.googleEventId)).toEqual(['e1']);
      expect(feed.hiddenLegacyItemIds).toEqual([legacyItem]);
      expect(feed.hiddenLegacyItemIds).not.toContain(webItem);
      expect((await f.service.findFeed(other, FAR.from, FAR.to)).hiddenLegacyItemIds).toEqual([]);
      expect(otherLegacy).toBeDefined();

      // A later outage keeps serving the cache, so the copies stay hidden (nothing shows twice).
      f.fake.injectFailure('events.list', { status: 500, onCall: f.fake.callsTo('events.list').length + 1 });
      await f.service.syncSubscription(sub);
      expect((await f.service.findFeed(owner, FAR.from, FAR.to)).hiddenLegacyItemIds).toEqual([legacyItem]);

      // Deselected or connection needing reconnect: cache not served, copies visible again.
      await h.dataSource.query(`UPDATE google_calendar_connection SET status = 'needs_reconnect' WHERE owner_id = $1`, [owner]);
      const reconnect = await f.service.findFeed(owner, FAR.from, FAR.to);
      expect(reconnect.hiddenLegacyItemIds).toEqual([]);
      await h.dataSource.query(`UPDATE google_calendar_connection SET status = 'active' WHERE owner_id = $1`, [owner]);
      expect((await f.service.findFeed(owner, FAR.from, FAR.to)).hiddenLegacyItemIds).toEqual([legacyItem]);
      await f.service.deselectSubscription(sub);
      expect((await f.service.findFeed(owner, FAR.from, FAR.to)).hiddenLegacyItemIds).toEqual([]);
    });

    it('shows a Husrevity-origin item once: the Google copy of its own pushed event is excluded for the same owner only', async () => {
      const owner = await f.createUser(email());
      const other = await f.createUser(email());
      const cal = `legacy-origin-${n}@example.test`;
      await f.createLegacyAccount(owner, cal);
      const sub = await f.createSubscription(owner, cal);
      const subOther = await f.createSubscription(other, `${cal}-other`);
      const pushedItem = await f.createItem(owner, 'Dentist', 'web');
      const deletedItem = await f.createItem(owner, 'Gone item', 'web');
      const softLinkItem = await f.createItem(owner, 'Soft link item', 'web');
      await h.dataSource.query(`UPDATE items SET deleted_at = now() WHERE id = $1`, [deletedItem]);
      await h.dataSource.query(
        `INSERT INTO external_link (item_id, provider, external_id) VALUES ($1, 'google_calendar', 'pushed-evt')`,
        [pushedItem],
      );
      await h.dataSource.query(
        `INSERT INTO external_link (item_id, provider, external_id) VALUES ($1, 'google_calendar', 'deleted-item-evt')`,
        [deletedItem],
      );
      await h.dataSource.query(
        `INSERT INTO external_link (item_id, provider, external_id, deleted_at) VALUES ($1, 'google_calendar', 'soft-link-evt', now())`,
        [softLinkItem],
      );
      // Another user's item links the SAME Google event id as the other user's own calendar event.
      const otherItem = await f.createItem(other, 'Other item', 'web');
      await h.dataSource.query(
        `INSERT INTO external_link (item_id, provider, external_id) VALUES ($1, 'google_calendar', 'pushed-evt')`,
        [otherItem],
      );
      f.fake.seedEvent(cal, timed('pushed-evt', 'Dentist', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      f.fake.seedEvent(cal, timed('deleted-item-evt', 'Gone item', '2026-06-20T12:00:00Z', '2026-06-20T13:00:00Z'));
      f.fake.seedEvent(cal, timed('soft-link-evt', 'Soft link item', '2026-06-20T14:00:00Z', '2026-06-20T15:00:00Z'));
      f.fake.seedEvent(cal, timed('plain-evt', 'Plain Google event', '2026-06-20T16:00:00Z', '2026-06-20T17:00:00Z'));
      f.fake.seedEvent(`${cal}-other`, timed('pushed-evt', 'Same id, other user', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      await f.service.syncSubscription(sub);
      await f.service.syncSubscription(subOther);

      // Owner: the pushed event is dropped (the item shows it); events of deleted items/links and plain events stay.
      const feed = await f.service.findFeed(owner, FAR.from, FAR.to);
      expect(feed.events.map((e) => e.googleEventId).sort()).toEqual(['deleted-item-evt', 'plain-evt', 'soft-link-evt']);
      // The other user's own event is hidden by the other user's own link only (no sync needed to prove it: nothing leaks across owners).
      const otherFeed = await f.service.findFeed(other, FAR.from, FAR.to);
      expect(otherFeed.events.map((e) => e.title)).toEqual([]);
      expect(await f.service.findVisibleEvents(other, FAR.from, FAR.to)).toEqual([]);
    });

    it('does not hide a same-id event of the owner behind another user\'s link', async () => {
      const owner = await f.createUser(email());
      const stranger = await f.createUser(email());
      const cal = `legacy-foreign-link-${n}@example.test`;
      const sub = await f.createSubscription(owner, cal);
      const strangerItem = await f.createItem(stranger, 'Stranger item', 'web');
      await h.dataSource.query(
        `INSERT INTO external_link (item_id, provider, external_id) VALUES ($1, 'google_calendar', 'shared-id')`,
        [strangerItem],
      );
      f.fake.seedEvent(cal, timed('shared-id', 'Mine', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      await f.service.syncSubscription(sub);
      expect((await f.service.findFeed(owner, FAR.from, FAR.to)).events.map((e) => e.googleEventId)).toEqual(['shared-id']);
    });

    it('returns an empty feed and hides nothing while the flag is off', async () => {
      const owner = await f.createUser(email());
      await f.createLegacyAccount(owner, `${legacyCal}-flagoff`);
      await f.createItem(owner, 'Old copy', 'gcal');
      const sub = await f.createSubscription(owner, `${legacyCal}-flagoff`);
      await f.service.syncSubscription(sub);
      const off = f.makeService('false');
      expect(await off.findFeed(owner, FAR.from, FAR.to)).toEqual({ events: [], hiddenLegacyItemIds: [] });
    });

    it('excludes the managed Husrevity calendar from reading, serving and hiding', async () => {
      const owner = await f.createUser(email());
      await f.createLegacyAccount(owner, `${legacyCal}-managed`);
      const legacyItem = await f.createItem(owner, 'Old copy', 'gcal');
      const cal = `managed-${n}@example.test`;
      const sub = await f.createSubscription(owner, cal);
      await f.markManaged(owner, sub);
      f.fake.seedEvent(cal, timed('pub-1', 'Published item', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));

      expect(await f.service.syncSubscription(sub)).toEqual({ status: 'skipped' });
      await f.service.runDueSyncs();
      expect(f.fake.callsTo('events.list').filter((c) => JSON.stringify(c).includes(cal))).toEqual([]);
      expect(await f.eventRows(sub)).toEqual([]);

      // Even a row that somehow exists is never served for a managed calendar.
      await h.dataSource.query(
        `INSERT INTO google_calendar_event (owner_id, subscription_id, generation, google_event_id, title, all_day, start_at, end_at)
         VALUES ($1, $2, 0, 'dup', 'Duplicate of an item', false, '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z')`,
        [owner, sub],
      );
      await h.dataSource.query(`UPDATE google_calendar_subscription SET last_sync_at = now() WHERE id = $1`, [sub]);
      const feed = await f.service.findFeed(owner, FAR.from, FAR.to);
      expect(feed.events).toEqual([]);
      // A managed calendar does not trigger hiding of legacy copies of another calendar.
      expect(feed.hiddenLegacyItemIds).toEqual([]);
      expect(legacyItem).toBeDefined();
    });
  });

  describe('feed_all_day_bounds_use_istanbul', () => {
    // Mon 2026-06-15 00:00 +03:00 .. Mon 2026-06-22 00:00 +03:00 (end exclusive)
    const RANGE = { from: new Date('2026-06-15T00:00:00+03:00'), to: new Date('2026-06-22T00:00:00+03:00') };
    const allDay = (id: string, start: string, endExclusive: string) => ({
      id,
      status: 'confirmed' as const,
      summary: id,
      start: { date: start },
      end: { date: endExclusive },
    });

    it('serves all-day events on the first and last visible day and handles multi-day events across each boundary', async () => {
      const owner = await f.createUser(email());
      const cal = `allday-bounds-${n}@example.test`;
      const sub = await f.createSubscription(owner, cal);
      for (const e of [
        allDay('sunday-last-day', '2026-06-21', '2026-06-22'),
        allDay('monday-first-day', '2026-06-15', '2026-06-16'),
        allDay('ends-on-first-day-exclusive', '2026-06-14', '2026-06-15'),
        allDay('starts-on-to-day', '2026-06-22', '2026-06-23'),
        allDay('crosses-start', '2026-06-13', '2026-06-16'),
        allDay('crosses-end', '2026-06-20', '2026-06-24'),
        allDay('spans-all', '2026-06-10', '2026-06-30'),
        allDay('before', '2026-06-10', '2026-06-12'),
      ]) {
        f.fake.seedEvent(cal, e);
      }
      await f.service.syncSubscription(sub);
      const ids = (await f.service.findVisibleEvents(owner, RANGE.from, RANGE.to)).map((e) => e.googleEventId).sort();
      expect(ids).toEqual(['crosses-end', 'crosses-start', 'monday-first-day', 'spans-all', 'sunday-last-day']);
    });
  });

  describe('stale_worker_is_fenced', () => {
    it('cannot write after its lease expired and another worker took over (epoch changed)', async () => {
      const owner = await f.createUser(email());
      const cal = `fence-${n}@example.test`;
      const sub = await f.createSubscription(owner, cal);
      f.fake.seedEvent(cal, timed('a', 'A', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      let takeover: { epoch: number } | null = null;
      let armed = true;
      const { reader } = hookedReader({
        hook: () => async () => {
          if (!armed) return;
          armed = false;
          // The old worker stalls: its lease expires and worker B acquires (epoch + 1).
          await h.dataSource.query(
            `UPDATE google_calendar_subscription SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
            [sub],
          );
          takeover = await f.service.acquireLease(sub, 'worker-b');
        },
      });
      const stale = f.makeService('true', reader);

      expect(await stale.syncSubscription(sub)).toEqual({ status: 'lease_lost' });
      expect(takeover).not.toBeNull();
      const row = await f.subscriptionRow(sub);
      // The stale worker wrote no rows and no token, and did not free worker B's lease.
      expect(await f.eventRows(sub)).toEqual([]);
      expect(row.sync_token).toBeNull();
      expect(row.lease_holder).toBe('worker-b');
      expect(row.epoch).toBe(takeover!.epoch);
    });

    it('rejects every lease primitive of a stale handle, and a write transaction throws LeaseLostError', async () => {
      const owner = await f.createUser(email());
      const sub = await f.createSubscription(owner, `fence-prim-${n}@example.test`);
      const a = (await f.service.acquireLease(sub, 'worker-a'))!;
      await h.dataSource.query(
        `UPDATE google_calendar_subscription SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
        [sub],
      );
      // Expired lease alone already fences the holder, before anybody took over.
      await expect(h.dataSource.transaction((m) => f.service.assertLease(m, a))).rejects.toBeInstanceOf(LeaseLostError);
      expect(await f.service.renewLease(a)).toBe(false);

      const b = (await f.service.acquireLease(sub, 'worker-b'))!;
      expect(b.epoch).toBe(a.epoch + 1);
      await expect(h.dataSource.transaction((m) => f.service.assertLease(m, a))).rejects.toBeInstanceOf(LeaseLostError);
      expect(await f.service.renewLease(a)).toBe(false);
      await f.service.releaseLease(a); // must not free worker B
      expect((await f.subscriptionRow(sub)).lease_holder).toBe('worker-b');
      await expect(h.dataSource.transaction((m) => f.service.assertLease(m, b))).resolves.toBeUndefined();
    });
  });

  describe('deselect_during_sync_then_reselect', () => {
    it('stops an in-flight sync from writing back, then restores everything on reselect', async () => {
      const owner = await f.createUser(email());
      const cal = `deselect-${n}@example.test`;
      const sub = await f.createSubscription(owner, cal);
      for (const id of ['a', 'b', 'c']) {
        f.fake.seedEvent(cal, timed(id, id, '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      }
      let epochAtDeselect = -1;
      let armed = true;
      const { reader } = hookedReader({
        hook: () => async (_n, req) => {
          // Fires on the second page of the window read: page one is already staged.
          if (!armed || !req.pageToken || !req.singleEvents) return;
          armed = false;
          epochAtDeselect = await f.service.deselectSubscription(sub);
        },
      });
      const inflight = f.makeService('true', reader);
      inflight.pageSize = 1;

      expect(await inflight.syncSubscription(sub)).toEqual({ status: 'lease_lost' });
      expect(armed).toBe(false);
      const row = await f.subscriptionRow(sub);
      expect(row.selected).toBe(false);
      expect(row.epoch).toBe(epochAtDeselect);
      expect(row.sync_token).toBeNull();
      expect(row.lease_holder).toBeNull();
      // Nothing staged before the deselect survives, nothing was written after it.
      expect(await f.eventRows(sub)).toEqual([]);
      expect(await visible(owner)).toEqual([]);
      // A deselected subscription is neither syncable nor due.
      expect(await f.service.syncSubscription(sub)).toEqual({ status: 'skipped' });

      const epochBefore = Number(row.epoch);
      await f.service.reselectSubscription(sub);
      expect(Number((await f.subscriptionRow(sub)).epoch)).toBeGreaterThan(epochBefore);
      expect((await f.service.syncSubscription(sub)).status).toBe('rebuilt');
      expect(await visible(owner)).toEqual(['a', 'b', 'c']);
      expect((await f.subscriptionRow(sub)).sync_token).not.toBeNull();
    });

    it('also fences a sync that already finished fetching when the deselect lands before its write', async () => {
      const owner = await f.createUser(email());
      const cal = `deselect-late-${n}@example.test`;
      const sub = await f.createSubscription(owner, cal);
      f.fake.seedEvent(cal, timed('a', 'a', '2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'));
      let armed = true;
      const { reader } = hookedReader({
        hook: () => async (_n, req) => {
          if (!armed || !req.singleEvents) return;
          armed = false;
          await f.service.deselectSubscription(sub);
        },
      });
      expect(await f.makeService('true', reader).syncSubscription(sub)).toEqual({ status: 'lease_lost' });
      expect(await f.eventRows(sub)).toEqual([]);
      await f.service.reselectSubscription(sub);
      expect((await f.service.syncSubscription(sub)).status).toBe('rebuilt');
      expect(await visible(owner)).toEqual(['a']);
    });
  });
});
