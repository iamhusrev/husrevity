import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { GoogleCalendarPublishService, PublishableItem } from '../google-calendar-publish.service';
import { GoogleCalendarReadSyncService } from '../google-calendar-read-sync.service';
import { GoogleCalendarSelectionService } from '../google-calendar-selection.service';
import { FakeGoogleGateway } from '../testing/fake-google-gateway';
import { createSyncFixture, fakeGateway, fakeReader, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Plan section 4, test 38 `publish_retry_is_idempotent` (slice 10). ONE
 * disposable Postgres container, the real publisher and the scripted fake
 * gateway: no network, no real Google.
 */
jest.setTimeout(300_000);

const APP_CREATED = 'https://www.googleapis.com/auth/calendar.app.created';
const CAL_LIST_RO = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const EVENTS_RO = 'https://www.googleapis.com/auth/calendar.events.readonly';
const WRITE_SCOPES = [CAL_LIST_RO, EVENTS_RO, APP_CREATED];

describe('publish_retry_is_idempotent (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let fake: FakeGoogleGateway;
  let seq = 0;

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    h.dataSource.query(sql, params);

  const makePublisher = (flag: string | null = 'true'): GoogleCalendarPublishService =>
    new GoogleCalendarPublishService(
      h.dataSource,
      { get: (k: string) => (k === 'GOOGLE_CALENDAR_V2_ENABLED' ? (flag ?? undefined) : undefined) } as unknown as ConfigService,
      fakeGateway(fake),
    );
  let publisher: GoogleCalendarPublishService;

  /** A user whose connection has write turned on (the default for most tests). */
  const writer = async (opts: { writeEnabled?: boolean; scopes?: string[]; status?: string } = {}) => {
    const ownerId = await f.createUser(`writer-${++seq}@example.test`);
    await q(
      `INSERT INTO google_calendar_connection (owner_id, status, granted_scopes, write_enabled)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [ownerId, opts.status ?? 'active', JSON.stringify(opts.scopes ?? WRITE_SCOPES), opts.writeEnabled ?? true],
    );
    return ownerId;
  };

  const item = async (
    ownerId: string,
    over: Partial<{ title: string; kind: string; source: string; projectId: string | null; scheduledAt: Date | null; notes: string | null }> = {},
  ): Promise<PublishableItem> => {
    const row = (
      await q<{ id: string }>(
        `INSERT INTO items (owner_id, kind, title, notes, scheduled_at, duration_min, source, project_id)
         VALUES ($1, $2, $3, $4, $5, 45, $6, $7) RETURNING id::text AS id`,
        [
          ownerId,
          over.kind ?? 'event',
          over.title ?? `Meeting ${++seq}`,
          over.notes === undefined ? 'private notes' : over.notes,
          over.scheduledAt === undefined ? new Date('2026-07-01T09:00:00Z') : over.scheduledAt,
          over.source ?? 'web',
          over.projectId ?? null,
        ],
      )
    )[0];
    return {
      id: row.id,
      ownerId,
      kind: over.kind ?? 'event',
      source: over.source ?? 'web',
      projectId: over.projectId ?? null,
      title: over.title ?? 'Meeting',
      scheduledAt: over.scheduledAt === undefined ? new Date('2026-07-01T09:00:00Z') : over.scheduledAt,
      durationMin: 45,
    };
  };

  const managed = async (ownerId: string) =>
    (await q<{ id: string; google_calendar_id: string; selected: boolean; managed: boolean }>(
      `SELECT id::text AS id, google_calendar_id, selected, managed FROM google_calendar_subscription
        WHERE owner_id = $1 AND managed`,
      [ownerId],
    ))[0];
  const publications = (ownerId: string) =>
    q<{ item_id: string; google_event_id: string; etag: string | null }>(
      `SELECT item_id::text AS item_id, google_event_id, etag FROM google_calendar_publication WHERE owner_id = $1 ORDER BY id`,
      [ownerId],
    );

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

  it('first publish creates a new managed calendar and exactly one minimal event', async () => {
    const owner = await writer();
    const it = await item(owner, { title: 'Dentist', notes: 'secret details' });

    expect(await publisher.publishItem(it)).toBe('created');

    const sub = await managed(owner);
    expect(sub).toMatchObject({ selected: false, managed: true });
    expect(fake.createdCalendarIds()).toContain(sub.google_calendar_id);
    const events = fake.storedEvents(sub.google_calendar_id);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('Dentist');
    expect(events[0].start?.dateTime).toBe('2026-07-01T09:00:00.000Z');
    expect(events[0].end?.dateTime).toBe('2026-07-01T09:45:00.000Z');
    // Data minimisation: nothing beyond title and time reaches Google.
    expect(JSON.stringify(fake.callsTo('events.insert')[0].args)).not.toContain('secret details');
    expect(Object.keys(fake.callsTo('events.insert')[0].args as object)).toEqual(['calendarId', 'event']);
    const pubs = await publications(owner);
    expect(pubs).toHaveLength(1);
    expect(pubs[0]).toMatchObject({ item_id: it.id, google_event_id: events[0].id });
    expect(events[0].id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(pubs[0].etag).toBeTruthy();
  });

  it('a retry after a lost response does not create a duplicate and ends consistent', async () => {
    const owner = await writer();
    const it = await item(owner);
    fake.injectFailure('events.insert', { status: 503, afterEffect: true });

    await expect(publisher.publishItem(it)).rejects.toMatchObject({ status: 503 });
    const sub = await managed(owner);
    expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(1); // Google did apply it
    expect(await publications(owner)).toHaveLength(0); // we never saw the answer

    expect(await publisher.publishItem(it)).toBe('updated'); // 409 on insert, then patch
    expect(fake.callsTo('events.insert')).toHaveLength(2);
    expect(fake.callsTo('events.patch')).toHaveLength(1);
    expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(1);
    expect(fake.createdCalendarIds().filter((id) => id === sub.google_calendar_id)).toHaveLength(1);
    const pubs = await publications(owner);
    expect(pubs).toHaveLength(1);
    expect(pubs[0].google_event_id).toBe(fake.storedEvents(sub.google_calendar_id)[0].id);
  });

  it('treats a 409 from Google as success and patches the existing event instead of inserting another', async () => {
    const owner = await writer();
    const it = await item(owner, { title: 'Renamed locally' });
    await publisher.publishItem(await item(owner)); // creates the managed calendar
    const sub = await managed(owner);
    const id = publisher.eventIdFor(owner, it.id);
    fake.seedEvent(sub.google_calendar_id, { id, status: 'confirmed', summary: 'Stale title' });

    expect(await publisher.publishItem(it)).toBe('updated');

    const events = fake.storedEvents(sub.google_calendar_id).filter((e) => e.id === id);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('Renamed locally');
    expect((await publications(owner)).map((p) => p.google_event_id)).toContain(id);
  });

  it('two concurrent first publishes create one managed calendar', async () => {
    const owner = await writer();
    const [a, b] = [await item(owner), await item(owner)];

    await Promise.all([publisher.publishItem(a), makePublisher().publishItem(b)]);

    expect(fake.callsTo('calendars.insert')).toHaveLength(1);
    expect(await q(`SELECT 1 FROM google_calendar_subscription WHERE owner_id = $1 AND managed`, [owner])).toHaveLength(1);
    expect(await publications(owner)).toHaveLength(2);
  });

  it('publishing the same item again keeps one event and one publication row', async () => {
    const owner = await writer();
    const it = await item(owner);
    await publisher.publishItem(it);
    await publisher.publishItem(it);
    await publisher.publishItem(it);

    const sub = await managed(owner);
    expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(1);
    expect(await publications(owner)).toHaveLength(1);
    expect(fake.callsTo('events.insert')).toHaveLength(1);
    expect(fake.callsTo('calendars.insert')).toHaveLength(1);
  });

  it('an update of the item patches the same Google event', async () => {
    const owner = await writer();
    const it = await item(owner, { title: 'Before' });
    await publisher.publishItem(it);
    const sub = await managed(owner);
    const idBefore = fake.storedEvents(sub.google_calendar_id)[0].id;

    await publisher.publishItem({ ...it, title: 'After', scheduledAt: new Date('2026-07-02T10:00:00Z') });

    const events = fake.storedEvents(sub.google_calendar_id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: idBefore, summary: 'After' });
    expect(events[0].start?.dateTime).toBe('2026-07-02T10:00:00.000Z');
    expect(fake.callsTo('events.insert')).toHaveLength(1);
  });

  it('re-creates the event when the user deleted it in Google meanwhile', async () => {
    const owner = await writer();
    const it = await item(owner);
    await publisher.publishItem(it);
    const sub = await managed(owner);
    const id = fake.storedEvents(sub.google_calendar_id)[0].id;
    fake.cancelEvent(sub.google_calendar_id, id);

    await publisher.publishItem({ ...it, title: 'Back again' });

    expect(fake.storedEvents(sub.google_calendar_id)).toEqual([expect.objectContaining({ id, summary: 'Back again' })]);
    expect(await publications(owner)).toHaveLength(1);
  });

  it('deleting the item removes the Google event and the publication row', async () => {
    const owner = await writer();
    const it = await item(owner);
    await publisher.publishItem(it);
    const sub = await managed(owner);

    expect(await publisher.unpublishItem(owner, it.id)).toBe('removed');

    expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(0);
    expect(await publications(owner)).toHaveLength(0);
    expect(await publisher.unpublishItem(owner, it.id)).toBe('skipped');
  });

  it('a delete whose event is already gone in Google still clears the publication row', async () => {
    const owner = await writer();
    const it = await item(owner);
    await publisher.publishItem(it);
    const sub = await managed(owner);
    fake.cancelEvent(sub.google_calendar_id, fake.storedEvents(sub.google_calendar_id)[0].id);

    expect(await publisher.unpublishItem(owner, it.id)).toBe('removed');
    expect(await publications(owner)).toHaveLength(0);
  });

  it('keeps the publication row when Google fails to delete, so a later attempt can finish', async () => {
    const owner = await writer();
    const it = await item(owner);
    await publisher.publishItem(it);
    fake.injectFailure('events.delete', { status: 500 });

    await expect(publisher.unpublishItem(owner, it.id)).rejects.toMatchObject({ status: 500 });
    expect(await publications(owner)).toHaveLength(1);
    expect(await publisher.unpublishItem(owner, it.id)).toBe('removed');
  });

  it('never publishes a non-personal item: project, Google copy, non-event, undated, or deleted', async () => {
    const owner = await writer();
    const project = (
      await q<{ id: string }>(`INSERT INTO project (owner_id, code, name) VALUES ($1, 'P', 'P') RETURNING id::text AS id`, [owner])
    )[0].id;
    const cases = [
      await item(owner, { projectId: project }),
      await item(owner, { source: 'gcal' }),
      await item(owner, { kind: 'task' }),
      await item(owner, { scheduledAt: null }),
    ];
    const deleted = { ...(await item(owner)), deletedAt: new Date() };

    for (const c of [...cases, deleted]) expect(await publisher.publishItem(c)).toBe('skipped');

    expect(fake.callsTo('events.insert')).toHaveLength(0);
    expect(fake.callsTo('calendars.insert')).toHaveLength(0);
    expect(await publications(owner)).toHaveLength(0);
  });

  it('a published item that becomes a project item is removed from Google', async () => {
    const owner = await writer();
    const it = await item(owner);
    await publisher.publishItem(it);
    const sub = await managed(owner);

    expect(await publisher.publishItem({ ...it, projectId: '1' })).toBe('removed');

    expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(0);
    expect(await publications(owner)).toHaveLength(0);
  });

  it('does nothing unless the flag is on, write is enabled, the connection is active and the scope was granted', async () => {
    const flagged = await writer();
    const off = await writer({ writeEnabled: false });
    const noScope = await writer({ scopes: [CAL_LIST_RO, EVENTS_RO] });
    const stale = await writer({ status: 'needs_reconnect' });

    expect(await makePublisher('true').isHandling(flagged)).toBe(true);
    expect(await makePublisher(null).isHandling(flagged)).toBe(false);
    expect(await makePublisher('false').isHandling(flagged)).toBe(false);
    expect(await makePublisher('true').isHandling(off)).toBe(false);
    expect(await makePublisher('true').isHandling(noScope)).toBe(false);
    expect(await makePublisher('true').isHandling(stale)).toBe(false);
    expect(await makePublisher('true').isHandling('999999')).toBe(false);

    expect(await makePublisher('true').publishItem(await item(off))).toBe('skipped');
    expect(fake.calls).toHaveLength(0);
  });

  it('the managed calendar is flagged so the selection list and the read engine skip it', async () => {
    const owner = await writer();
    await publisher.publishItem(await item(owner));
    const sub = await managed(owner);
    await f.createLegacyAccount(owner, 'unused-legacy@example.test');
    const config = { get: (k: string) => (k === 'GOOGLE_CALENDAR_V2_ENABLED' ? 'true' : undefined) } as unknown as ConfigService;
    const selection = new GoogleCalendarSelectionService(
      h.dataSource,
      config,
      new GoogleCalendarReadSyncService(h.dataSource, config, fakeReader(fake)),
      fakeGateway(fake),
      {} as never,
    );

    const list = await selection.listCalendars(owner);
    expect(list.find((c) => c.id === sub.google_calendar_id)).toMatchObject({ managed: true, selected: false });
    await expect(selection.updateSelection(owner, [sub.google_calendar_id])).rejects.toThrow(/cannot be selected/);
  });

  describe('migrate legacy', () => {
    it('publishes the eligible existing items once; running it again creates nothing new', async () => {
      const owner = await writer();
      const stranger = await writer();
      const a = await item(owner);
      const b = await item(owner);
      await item(owner, { source: 'gcal' });
      await item(owner, { kind: 'task' });
      await item(stranger);

      const first = await publisher.migrateLegacy(owner);
      expect(first).toMatchObject({ published: 2, failed: 0, remaining: 0 });
      const sub = await managed(owner);
      expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(2);
      expect((await publications(owner)).map((p) => p.item_id).sort()).toEqual([a.id, b.id].sort());
      expect(await publications(stranger)).toHaveLength(0);

      const insertsBefore = fake.callsTo('events.insert').length;
      const second = await publisher.migrateLegacy(owner);
      expect(second).toMatchObject({ published: 0, skipped: 2, failed: 0 });
      expect(fake.callsTo('events.insert')).toHaveLength(insertsBefore);
      expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(2);
    });

    it('finishes a half-done run after a lost response without duplicates', async () => {
      const owner = await writer();
      await item(owner);
      await item(owner);
      fake.injectFailure('events.insert', { status: 503, afterEffect: true });

      const first = await publisher.migrateLegacy(owner);
      expect(first).toMatchObject({ published: 1, failed: 1 });

      const second = await publisher.migrateLegacy(owner);
      expect(second).toMatchObject({ published: 1, failed: 0, skipped: 1 });
      const sub = await managed(owner);
      expect(fake.storedEvents(sub.google_calendar_id)).toHaveLength(2);
      expect(await publications(owner)).toHaveLength(2);
    });

    it('is refused while write is not active for the owner', async () => {
      const off = await writer({ writeEnabled: false });
      await expect(publisher.migrateLegacy(off)).rejects.toMatchObject({ response: expect.objectContaining({ status: 409 }) });
    });
  });
});
