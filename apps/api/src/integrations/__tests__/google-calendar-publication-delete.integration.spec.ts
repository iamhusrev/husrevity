import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import {
  GoogleCalendarPublishService,
  MAX_DELETE_ATTEMPTS,
  PublishableItem,
} from '../google-calendar-publish.service';
import { FakeGoogleGateway } from '../testing/fake-google-gateway';
import { createSyncFixture, fakeGateway, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Defect 9: published Google copies must never be left behind. A removal (item
 * deleted, no longer eligible, write turned off) marks the publication row
 * `delete_pending_at`; the publisher removes the Google event and the row, retries
 * failures with bounded attempts and a reconcile sweep catches every path that
 * soft-deletes items in bulk. ONE disposable Postgres container, the real
 * publisher and the scripted fake gateway: no network, no real Google.
 */
jest.setTimeout(300_000);

const APP_CREATED = 'https://www.googleapis.com/auth/calendar.app.created';
const CAL_LIST_RO = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const EVENTS_RO = 'https://www.googleapis.com/auth/calendar.events.readonly';
const WRITE_SCOPES = [CAL_LIST_RO, EVENTS_RO, APP_CREATED];

describe('google calendar publication delete retry (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let fake: FakeGoogleGateway;
  let publisher: GoogleCalendarPublishService;
  let seq = 0;

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    h.dataSource.query(sql, params);

  const makePublisher = (flag: string | null = 'true'): GoogleCalendarPublishService =>
    new GoogleCalendarPublishService(
      h.dataSource,
      { get: (k: string) => (k === 'GOOGLE_CALENDAR_V2_ENABLED' ? (flag ?? undefined) : undefined) } as unknown as ConfigService,
      fakeGateway(fake),
    );

  const writer = async (opts: { writeEnabled?: boolean } = {}) => {
    const ownerId = await f.createUser(`pubdel-${++seq}@example.test`);
    await q(
      `INSERT INTO google_calendar_connection (owner_id, status, granted_scopes, write_enabled)
       VALUES ($1, 'active', $2::jsonb, $3)`,
      [ownerId, JSON.stringify(WRITE_SCOPES), opts.writeEnabled ?? true],
    );
    return ownerId;
  };

  const publishedItem = async (ownerId: string): Promise<PublishableItem> => {
    const title = `Meeting ${++seq}`;
    const row = (
      await q<{ id: string }>(
        `INSERT INTO items (owner_id, kind, title, scheduled_at, duration_min, source)
         VALUES ($1, 'event', $2, $3, 30, 'web') RETURNING id::text AS id`,
        [ownerId, title, new Date('2026-07-01T09:00:00Z')],
      )
    )[0];
    const item: PublishableItem = {
      id: row.id,
      ownerId,
      kind: 'event',
      source: 'web',
      projectId: null,
      title,
      scheduledAt: new Date('2026-07-01T09:00:00Z'),
      durationMin: 30,
    };
    expect(await publisher.publishItem(item)).toBe('created');
    return item;
  };

  const pubRow = async (itemId: string) =>
    (
      await q<{ delete_pending_at: Date | null; delete_attempts: number; google_event_id: string }>(
        `SELECT delete_pending_at, delete_attempts, google_event_id FROM google_calendar_publication WHERE item_id = $1`,
        [itemId],
      )
    )[0];
  const managedCalendar = async (ownerId: string) =>
    (
      await q<{ google_calendar_id: string }>(
        `SELECT google_calendar_id FROM google_calendar_subscription WHERE owner_id = $1 AND managed`,
        [ownerId],
      )
    )[0].google_calendar_id;
  const liveEvents = async (ownerId: string) => fake.storedEvents(await managedCalendar(ownerId));

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    f = await createSyncFixture(h);
    fake = f.fake;
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    publisher = makePublisher();
    fake.calls.length = 0;
  });

  it('a failed Google delete keeps the row marked pending and a later sweep removes the event and the row', async () => {
    const owner = await writer();
    const item = await publishedItem(owner);
    await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [item.id]);
    fake.injectFailure('events.delete', { status: 503 });

    await expect(publisher.unpublishItem(owner, item.id)).rejects.toBeDefined();

    const failed = await pubRow(item.id);
    expect(failed.delete_pending_at).not.toBeNull();
    expect(failed.delete_attempts).toBe(1);
    expect(await liveEvents(owner)).toHaveLength(1);

    const res = await publisher.sweepPendingDeletes();

    expect(res.removed).toBeGreaterThanOrEqual(1);
    expect(await pubRow(item.id)).toBeUndefined();
    expect(await liveEvents(owner)).toHaveLength(0);
  });

  it('a failing sweep counts attempts and gives up after the bound without calling Google again', async () => {
    const owner = await writer();
    const item = await publishedItem(owner);
    await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [item.id]);
    fake.injectFailure('events.delete', { status: 503, times: MAX_DELETE_ATTEMPTS });
    const logged: string[] = [];
    const spies = (['warn', 'error', 'log'] as const).map((m) =>
      jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => {
        logged.push(String(args[0]));
      }),
    );
    try {
      for (let i = 0; i < MAX_DELETE_ATTEMPTS; i++) await publisher.sweepPendingDeletes();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }

    const row = await pubRow(item.id);
    expect(row.delete_attempts).toBe(MAX_DELETE_ATTEMPTS);
    fake.calls.length = 0;
    const again = await publisher.sweepPendingDeletes();
    expect(fake.callsTo('events.delete')).toHaveLength(0);
    expect(again.removed).toBe(0);
    for (const line of logged) expect(line).not.toMatch(/ya29|access-|refresh-/);
  });

  it('a Google event that is already gone still clears the row', async () => {
    const owner = await writer();
    const item = await publishedItem(owner);
    fake.cancelEvent(await managedCalendar(owner), (await pubRow(item.id)).google_event_id);
    await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [item.id]);

    await publisher.sweepPendingDeletes();

    expect(await pubRow(item.id)).toBeUndefined();
  });

  it('bulk removal: items soft-deleted in one statement lose their Google copies through the sweep, other owners stay', async () => {
    const owner = await writer();
    const other = await writer();
    const mine = [await publishedItem(owner), await publishedItem(owner), await publishedItem(owner)];
    const theirs = await publishedItem(other);
    await q(`UPDATE items SET deleted_at = now() WHERE owner_id = $1`, [owner]);
    expect(await liveEvents(owner)).toHaveLength(3);

    const res = await publisher.sweepPendingDeletes();

    expect(res.removed).toBeGreaterThanOrEqual(3);
    for (const it of mine) expect(await pubRow(it.id)).toBeUndefined();
    expect(await liveEvents(owner)).toHaveLength(0);
    expect(await pubRow(theirs.id)).toMatchObject({ delete_pending_at: null });
    expect(await liveEvents(other)).toHaveLength(1);
  });

  it('write off: the owner copies are queued and removed, another owner with write on keeps them', async () => {
    const owner = await writer();
    const other = await writer();
    const a = await publishedItem(owner);
    const b = await publishedItem(owner);
    const kept = await publishedItem(other);
    await q(`UPDATE google_calendar_connection SET write_enabled = false WHERE owner_id = $1`, [owner]);

    await publisher.sweepPendingDeletes();

    expect(await pubRow(a.id)).toBeUndefined();
    expect(await pubRow(b.id)).toBeUndefined();
    expect(await liveEvents(owner)).toHaveLength(0);
    expect(await pubRow(kept.id)).toBeDefined();
    expect(await liveEvents(other)).toHaveLength(1);
  });

  it('write off then on again before the sweep keeps the still eligible copies', async () => {
    const owner = await writer();
    const item = await publishedItem(owner);
    await q(`UPDATE google_calendar_publication SET delete_pending_at = now() WHERE owner_id = $1`, [owner]);

    await publisher.sweepPendingDeletes();

    expect(await pubRow(item.id)).toMatchObject({ delete_pending_at: null, delete_attempts: 0 });
    expect(await liveEvents(owner)).toHaveLength(1);
  });

  it('project deletion: an item that sits in a soft-deleted project loses its Google copy', async () => {
    const owner = await writer();
    const item = await publishedItem(owner);
    const project = (
      await q<{ id: string }>(`INSERT INTO project (owner_id, code, name) VALUES ($1, 'PD', 'PD') RETURNING id::text AS id`, [owner])
    )[0].id;
    await q(`UPDATE items SET project_id = $2 WHERE id = $1`, [item.id, project]);
    await q(`UPDATE project SET deleted_at = now() WHERE id = $1`, [project]);

    await publisher.sweepPendingDeletes();

    expect(await pubRow(item.id)).toBeUndefined();
    expect(await liveEvents(owner)).toHaveLength(0);
  });

  it.each([
    ['became a task', `UPDATE items SET kind = 'task' WHERE id = $1`],
    ['lost its time', `UPDATE items SET scheduled_at = NULL WHERE id = $1`],
    ['turned into a Google copy', `UPDATE items SET source = 'gcal' WHERE id = $1`],
  ])('item no longer eligible (%s) is removed from Google by the sweep', async (_name, sql) => {
    const owner = await writer();
    const item = await publishedItem(owner);
    await q(sql, [item.id]);

    await publisher.sweepPendingDeletes();

    expect(await pubRow(item.id)).toBeUndefined();
    expect(await liveEvents(owner)).toHaveLength(0);
  });

  it('publishing an item again clears a pending delete', async () => {
    const owner = await writer();
    const item = await publishedItem(owner);
    await q(`UPDATE google_calendar_publication SET delete_pending_at = now(), delete_attempts = 2 WHERE item_id = $1`, [item.id]);

    await publisher.publishItem(item);

    expect(await pubRow(item.id)).toMatchObject({ delete_pending_at: null, delete_attempts: 0 });
  });

  it('the sweep also runs while the v2 flag is off (so queued removals are never stranded)', async () => {
    const owner = await writer();
    const item = await publishedItem(owner);
    await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [item.id]);

    const res = await makePublisher(null).sweepPendingDeletes();

    expect(res.removed).toBeGreaterThanOrEqual(1);
    expect(await pubRow(item.id)).toBeUndefined();
  });

  describe('restore racing the sweep (re-check right before the Google delete)', () => {
    /** Runs `during` right after the sweep selected its pending rows, i.e. between selection and delete. */
    const interleave = async (during: () => Promise<void>, run: () => Promise<unknown>) => {
      const orig = h.dataSource.query.bind(h.dataSource) as (sql: string, params?: unknown[]) => Promise<unknown>;
      let fired = false;
      const spy = jest.spyOn(h.dataSource, 'query').mockImplementation((async (sql: string, params?: unknown[]) => {
        const out = await orig(sql, params);
        if (!fired && /ORDER BY p\.delete_pending_at/.test(sql)) {
          fired = true;
          await during();
        }
        return out;
      }) as never);
      try {
        await run();
      } finally {
        spy.mockRestore();
      }
      expect(fired).toBe(true);
    };

    it('an item restored after the sweep selected it keeps its published copy and loses the pending mark', async () => {
      const owner = await writer();
      const item = await publishedItem(owner);
      await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [item.id]);
      fake.calls.length = 0;

      await interleave(
        async () => {
          await q(`UPDATE items SET deleted_at = NULL WHERE id = $1`, [item.id]);
        },
        () => publisher.sweepPendingDeletes(),
      );

      expect(fake.callsTo('events.delete')).toHaveLength(0);
      expect(await liveEvents(owner)).toHaveLength(1);
      expect(await pubRow(item.id)).toMatchObject({ delete_pending_at: null, delete_attempts: 0 });
    });

    it('a row whose pending mark was cleared meanwhile (re-published) is not deleted', async () => {
      const owner = await writer();
      const item = await publishedItem(owner);
      await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [item.id]);
      fake.calls.length = 0;

      await interleave(
        async () => {
          await q(`UPDATE items SET deleted_at = NULL WHERE id = $1`, [item.id]);
          await q(`UPDATE google_calendar_publication SET delete_pending_at = NULL, delete_attempts = 0 WHERE item_id = $1`, [item.id]);
        },
        () => publisher.sweepPendingDeletes(),
      );

      expect(fake.callsTo('events.delete')).toHaveLength(0);
      expect(await liveEvents(owner)).toHaveLength(1);
    });

    it('an item that stays ineligible is still removed, and so is a restored item once write was turned off', async () => {
      const owner = await writer();
      const gone = await publishedItem(owner);
      await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [gone.id]);
      await interleave(async () => undefined, () => publisher.sweepPendingDeletes());
      expect(await pubRow(gone.id)).toBeUndefined();

      const offOwner = await writer();
      const restored = await publishedItem(offOwner);
      await q(`UPDATE items SET deleted_at = now() WHERE id = $1`, [restored.id]);
      await interleave(
        async () => {
          await q(`UPDATE items SET deleted_at = NULL WHERE id = $1`, [restored.id]);
          await q(`UPDATE google_calendar_connection SET write_enabled = false WHERE owner_id = $1`, [offOwner]);
        },
        () => publisher.sweepPendingDeletes(),
      );
      expect(await pubRow(restored.id)).toBeUndefined();
      expect(await liveEvents(offOwner)).toHaveLength(0);
    });
  });
});
