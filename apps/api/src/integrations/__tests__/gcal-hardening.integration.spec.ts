import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Item } from '../../item/item.entity';
import { ItemOccurrence } from '../../item/item-occurrence.entity';
import { ItemService } from '../../item/item.service';
import { ChangeSet } from '../../change-set/entities/change-set.entity';
import { ChangeEntry } from '../../change-set/entities/change-entry.entity';
import { ChangeSetService } from '../../change-set/change-set.service';
import { ExternalLink } from '../external-link.entity';
import { GoogleCalendarSyncService } from '../google-calendar-sync.service';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';

/**
 * Real-Postgres checks for the legacy Google Calendar hardening (disposable
 * Testcontainers database, never a shared one):
 *  - gcal_item_mutations_rejected: every ItemService mutation and undo leaves a
 *    legacy `source = 'gcal'` row untouched;
 *  - the legacy pull sync resolves links per owner, so one Google event id
 *    shared by two users can never write into the other user's rows.
 */
jest.setTimeout(240_000);

describe('legacy Google Calendar hardening (integration)', () => {
  let harness: MigrationHarness;
  let ds: DataSource;
  let items: ItemService;
  let changeSets: ChangeSetService;
  let alice: string;
  let bob: string;

  const insertItem = async (ownerId: string, title: string, source: string): Promise<Item> =>
    ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        ownerId,
        kind: 'event',
        title,
        status: 'open',
        source: source as Item['source'],
        payload: {},
        scheduledAt: new Date('2026-10-01T10:00:00Z'),
        durationMin: 60,
      }),
    );

  const reload = (id: string): Promise<Item | null> =>
    ds.getRepository(Item).findOne({ where: { id }, withDeleted: true });

  beforeAll(async () => {
    harness = await startMigrationHarness();
    await harness.migrateUpTo();
    ds = new DataSource({
      type: 'postgres',
      url: harness.container.getConnectionUri(),
      entities: [Item, ItemOccurrence, ExternalLink, ChangeSet, ChangeEntry],
      synchronize: false,
    });
    await ds.initialize();

    const user = async (email: string): Promise<string> =>
      (
        await harness.dataSource.query(
          `INSERT INTO app_user (email, password_hash) VALUES ($1, 'x') RETURNING id`,
          [email],
        )
      )[0].id;
    alice = await user('alice@example.test');
    bob = await user('bob@example.test');

    items = new ItemService(
      ds.getRepository(Item),
      ds.getRepository(ItemOccurrence),
      { requireAccess: jest.fn() } as never,
      { cancelForSource: jest.fn(), enqueue: jest.fn() } as never,
      { expand: jest.fn().mockReturnValue([]) } as never,
    );
    changeSets = new ChangeSetService(
      ds.getRepository(ChangeSet),
      ds.getRepository(ChangeEntry),
      ds.getRepository(Item),
      ds.getRepository(ItemOccurrence),
      items,
      ds,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    await harness?.close();
  });

  describe('gcal_item_mutations_rejected', () => {
    let gcal: Item;

    beforeEach(async () => {
      gcal = await insertItem(alice, 'From Google', 'gcal');
    });

    it('rejects update, delete, complete, reopen and restore and leaves the row untouched', async () => {
      await expect(items.update(alice, gcal.id, { title: 'Hacked' })).rejects.toMatchObject({
        status: 403,
      });
      await expect(items.delete(alice, gcal.id)).rejects.toMatchObject({ status: 403 });
      await expect(items.complete(alice, gcal.id, {})).rejects.toMatchObject({ status: 403 });
      await expect(items.reopen(alice, gcal.id)).rejects.toMatchObject({ status: 403 });

      const after = await reload(gcal.id);
      expect(after).toMatchObject({ title: 'From Google', status: 'open', source: 'gcal' });
      expect(after?.deletedAt).toBeNull();
      expect(after?.completedAt).toBeNull();

      // restore() works on soft-deleted rows, so soft-delete directly and try to bring it back.
      await ds.getRepository(Item).softDelete(gcal.id);
      await expect(items.restore(alice, gcal.id)).rejects.toMatchObject({ status: 403 });
      expect((await reload(gcal.id))?.deletedAt).not.toBeNull();
    });

    it('cannot turn another row into a gcal row, or a gcal row into something else, through update', async () => {
      const mine = await insertItem(alice, 'Mine', 'web');
      await items.update(alice, mine.id, { source: 'gcal' });
      expect((await reload(mine.id))?.source).toBe('web');
    });

    it('undo of a change set never touches the gcal row and reports a conflict instead', async () => {
      const changeSetId = await changeSets.begin(alice, { source: 'web', label: 'edit google row' });
      await changeSets.recordEntry(changeSetId, alice, {
        targetType: 'item',
        targetId: gcal.id,
        op: 'update',
        before: { title: 'Old title' },
        after: { title: 'From Google' },
      });
      await changeSets.recordEntry(changeSetId, alice, {
        targetType: 'item',
        targetId: gcal.id,
        op: 'complete',
        before: { status: 'open', completedAt: null },
        after: { status: 'done' },
      });
      await changeSets.recordEntry(changeSetId, alice, {
        targetType: 'item',
        targetId: gcal.id,
        op: 'create',
        before: null,
        after: { title: 'From Google' },
      });

      const result = await changeSets.undo(alice, changeSetId);

      expect(result.conflicts.map((c) => c.reason)).toEqual(['no_access', 'no_access', 'no_access']);
      const after = await reload(gcal.id);
      expect(after).toMatchObject({ title: 'From Google', status: 'open' });
      expect(after?.deletedAt).toBeNull();
    });
  });

  describe('legacy sync is owner scoped (same Google event id for two users)', () => {
    const syncFor = (ownerId: string, events: unknown[]): GoogleCalendarSyncService => {
      const calendar = {
        events: { list: jest.fn().mockResolvedValue({ data: { items: events, nextSyncToken: 't' } }) },
      };
      return new GoogleCalendarSyncService(
        {
          getCalendarClient: jest.fn().mockResolvedValue({ calendar, calendarId: 'cal' }),
          ensureHusrevityCalendar: jest.fn().mockResolvedValue('cal'),
          getHusrevityIdFromEvent: jest.fn().mockReturnValue(null),
        } as never,
        {
          get: jest.fn().mockResolvedValue({ account: { syncToken: null, ownerId } }),
          updateSyncToken: jest.fn(),
        } as never,
        ds.getRepository(ExternalLink),
        ds.getRepository(Item),
      );
    };

    const link = (itemId: string, externalId: string) =>
      ds.getRepository(ExternalLink).save(
        ds.getRepository(ExternalLink).create({
          itemId,
          provider: 'google_calendar',
          externalId,
          etag: null,
          lastSyncedAt: new Date(),
        }),
      );

    it("updates only the syncing user's row, never the other user's row with the same event id", async () => {
      const aliceRow = await insertItem(alice, 'Alice copy', 'gcal');
      const bobRow = await insertItem(bob, 'Bob copy', 'gcal');
      await link(aliceRow.id, 'shared-evt');
      await link(bobRow.id, 'shared-evt');

      await syncFor(bob, [
        {
          id: 'shared-evt',
          status: 'confirmed',
          summary: 'Renamed by Bob sync',
          start: { dateTime: '2026-10-01T10:00:00.000Z' },
          end: { dateTime: '2026-10-01T11:00:00.000Z' },
        },
      ]).syncIncremental(bob);

      expect((await reload(bobRow.id))?.title).toBe('Renamed by Bob sync');
      expect((await reload(aliceRow.id))?.title).toBe('Alice copy');
    });

    it("a cancellation removes only the syncing user's row and link", async () => {
      const aliceRow = await insertItem(alice, 'Alice cancel', 'gcal');
      const bobRow = await insertItem(bob, 'Bob cancel', 'gcal');
      await link(aliceRow.id, 'cancel-evt');
      await link(bobRow.id, 'cancel-evt');

      const result = await syncFor(bob, [{ id: 'cancel-evt', status: 'cancelled' }]).syncIncremental(bob);

      expect(result.deletedCount).toBe(1);
      expect((await reload(bobRow.id))?.deletedAt).not.toBeNull();
      expect((await reload(aliceRow.id))?.deletedAt).toBeNull();
      const aliceLink = await ds
        .getRepository(ExternalLink)
        .findOne({ where: { itemId: aliceRow.id } });
      expect(aliceLink).not.toBeNull();
    });

    it("creates the syncing user's own row when only the other user has a link for that event id", async () => {
      const aliceRow = await insertItem(alice, 'Alice only', 'gcal');
      await link(aliceRow.id, 'only-alice-evt');

      await syncFor(bob, [
        {
          id: 'only-alice-evt',
          status: 'confirmed',
          summary: 'Bob view',
          start: { dateTime: '2026-10-02T10:00:00.000Z' },
          end: { dateTime: '2026-10-02T11:00:00.000Z' },
        },
      ]).syncIncremental(bob);

      expect((await reload(aliceRow.id))?.title).toBe('Alice only');
      const bobRows = await ds.getRepository(Item).find({ where: { ownerId: bob, title: 'Bob view' } });
      expect(bobRows).toHaveLength(1);
    });
  });
});
