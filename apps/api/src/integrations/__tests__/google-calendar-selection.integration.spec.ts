import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { ApiException } from '../../common/api.exception';
import { hashChannelToken } from '../channel-token';
import { GoogleCalendarConfig } from '../google-calendar.config';
import { GoogleCalendarSelectionService } from '../google-calendar-selection.service';
import { GoogleCalendarGateway } from '../google-calendar-gateway';
import { createSyncFixture, fakeGateway, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Real-Postgres tests (disposable Testcontainers database) of the calendar
 * selection flow: the picker listing, select / deselect / reselect with watch
 * channels, owner isolation and the status/feed read paths, all against the
 * FakeGoogleGateway. One container, one fresh owner per test.
 */
jest.setTimeout(240_000);

const WEBHOOK = 'https://hooks.example.test/hooks/gcal';
const PRIMARY = { id: 'primary@example.test', summary: 'Primary', accessRole: 'owner' as const, primary: true, backgroundColor: '#112233' };
const WORK = { id: 'work@example.test', summary: 'Work', accessRole: 'writer' as const };
const HOLIDAYS = { id: 'holidays@example.test', summary: 'Holidays', accessRole: 'reader' as const, backgroundColor: '#445566' };
const BUSY = { id: 'busy@example.test', summary: 'Busy only', accessRole: 'freeBusyReader' as const };
const MANAGED = { id: 'managed@example.test', summary: 'Husrevity', accessRole: 'owner' as const };

describe('Google Calendar selection (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let n = 0;

  const makeService = (opts: { flag?: string; webhookUrl?: string | undefined; gateway?: GoogleCalendarGateway } = {}) => {
    const flag = 'flag' in opts ? opts.flag : 'true';
    const config = { get: (k: string) => (k === 'GOOGLE_CALENDAR_V2_ENABLED' ? flag : undefined) } as unknown as ConfigService;
    const calendarConfig = {
      webhookUrl: 'webhookUrl' in opts ? opts.webhookUrl : WEBHOOK,
    } as unknown as GoogleCalendarConfig;
    return new GoogleCalendarSelectionService(
      h.dataSource,
      config,
      f.makeService(flag),
      opts.gateway ?? fakeGateway(f.fake),
      calendarConfig,
    );
  };

  /** A connected owner (legacy integration account present). */
  const newOwner = async (): Promise<string> => {
    const id = await f.createUser(`owner-${++n}@example.test`);
    await f.createLegacyAccount(id, 'legacy-husrevity@example.test');
    return id;
  };
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    h.dataSource.query(sql, params);
  const subs = (ownerId: string) =>
    q<{ id: string; google_calendar_id: string; selected: boolean; epoch: number; needs_sync_at: Date | null; summary: string | null }>(
      `SELECT id::text, google_calendar_id, selected, epoch, needs_sync_at, summary FROM google_calendar_subscription WHERE owner_id = $1 ORDER BY google_calendar_id`,
      [ownerId],
    );
  const channels = (ownerId: string) =>
    q<{ id: string; subscription_id: string; token_hash: string; resource_id: string | null; stopped_at: Date | null; expires_at: Date }>(
      `SELECT * FROM google_calendar_channel WHERE owner_id = $1 ORDER BY created_at`,
      [ownerId],
    );

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    f = await createSyncFixture(h);
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    f.fake.setCalendars([PRIMARY, WORK, HOLIDAYS, BUSY, MANAGED]);
  });

  describe('listCalendars', () => {
    it('merges the Google calendar list with the local selection and returns only the documented fields', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id]);

      const list = await svc.listCalendars(ownerId);

      expect(list.find((c) => c.id === WORK.id)).toEqual({
        id: WORK.id,
        summary: 'Work',
        backgroundColor: null,
        accessRole: 'writer',
        primary: false,
        selected: true,
        managed: false,
      });
      expect(list.find((c) => c.id === PRIMARY.id)).toEqual({
        id: PRIMARY.id,
        summary: 'Primary',
        backgroundColor: '#112233',
        accessRole: 'owner',
        primary: true,
        selected: false,
        managed: false,
      });
      expect(list.map((c) => Object.keys(c).sort())).toEqual(
        list.map(() => ['accessRole', 'backgroundColor', 'id', 'managed', 'primary', 'selected', 'summary']),
      );
    });

    it('marks the managed Husrevity calendar and never reports it as selected', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      const subId = await f.createSubscription(ownerId, MANAGED.id);
      await f.markManaged(ownerId, subId);

      const managed = (await svc.listCalendars(ownerId)).find((c) => c.id === MANAGED.id)!;

      expect(managed.managed).toBe(true);
      expect(managed.selected).toBe(false);
    });

    it('requires a connected Google account', async () => {
      const svc = makeService();
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      await expect(svc.listCalendars(ownerId)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('updateSelection', () => {
    it('creates the connection and subscriptions, flags them for sync and registers one hashed-token channel each', async () => {
      const svc = makeService();
      const ownerId = await newOwner();

      const res = await svc.updateSelection(ownerId, [WORK.id, HOLIDAYS.id]);

      expect(res.selected.sort()).toEqual([HOLIDAYS.id, WORK.id]);
      const rows = await subs(ownerId);
      expect(rows.map((r) => [r.google_calendar_id, r.selected])).toEqual([
        [HOLIDAYS.id, true],
        [WORK.id, true],
      ]);
      expect(rows.every((r) => r.needs_sync_at !== null)).toBe(true);
      expect(rows.find((r) => r.google_calendar_id === WORK.id)!.summary).toBe('Work');

      const conn = await q<{ status: string; integration_account_id: string | null }>(
        `SELECT status, integration_account_id::text FROM google_calendar_connection WHERE owner_id = $1`,
        [ownerId],
      );
      expect(conn).toHaveLength(1);
      expect(conn[0].status).toBe('active');
      expect(conn[0].integration_account_id).not.toBeNull();

      const chans = await channels(ownerId);
      expect(chans).toHaveLength(2);
      for (const c of chans) {
        expect(c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(c.token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(c.resource_id).toMatch(/^resource-/);
        expect(c.stopped_at).toBeNull();
        expect(c.expires_at.getTime()).toBeGreaterThan(Date.now());
      }
      // Only the hash is stored: the raw token handed to Google hashes to the stored value.
      const watchCalls = f.fake.callsTo('events.watch').filter((c) => chans.some((ch) => ch.id === (c.args as { id: string }).id));
      expect(watchCalls).toHaveLength(2);
      for (const call of watchCalls) {
        const args = call.args as { id: string; address: string; token: string };
        expect(args.address).toBe(WEBHOOK);
        expect(args.token).not.toBe(chans.find((c) => c.id === args.id)!.token_hash);
        expect(hashChannelToken(args.token)).toBe(chans.find((c) => c.id === args.id)!.token_hash);
      }
    });

    it('skips channel registration silently when the webhook url is not configured', async () => {
      const svc = makeService({ webhookUrl: undefined });
      const ownerId = await newOwner();
      const before = f.fake.callsTo('events.watch').length;

      await svc.updateSelection(ownerId, [WORK.id]);

      expect((await subs(ownerId))[0].selected).toBe(true);
      expect(await channels(ownerId)).toHaveLength(0);
      expect(f.fake.callsTo('events.watch').length).toBe(before);
    });

    it('is idempotent: repeating the same selection registers no second channel', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id]);
      const watchCalls = f.fake.callsTo('events.watch').length;

      await svc.updateSelection(ownerId, [WORK.id]);

      expect(await channels(ownerId)).toHaveLength(1);
      expect(f.fake.callsTo('events.watch').length).toBe(watchCalls);
      expect(await subs(ownerId)).toHaveLength(1);
    });

    it('deselects omitted calendars through the engine and stops their channels', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id, HOLIDAYS.id]);
      const work = (await subs(ownerId)).find((s) => s.google_calendar_id === WORK.id)!;
      await f.fake.seedEvent(WORK.id, { id: 'e1', status: 'confirmed', summary: 'x', start: { dateTime: '2026-06-20T10:00:00Z' }, end: { dateTime: '2026-06-20T11:00:00Z' } });
      await f.service.syncSubscription(work.id);
      expect(await f.eventRows(work.id)).toHaveLength(1);
      const stopsBefore = f.fake.callsTo('channels.stop').length;

      await svc.updateSelection(ownerId, [HOLIDAYS.id]);

      const after = await subs(ownerId);
      expect(after.find((s) => s.google_calendar_id === WORK.id)).toMatchObject({ selected: false });
      expect(after.find((s) => s.google_calendar_id === WORK.id)!.epoch).toBeGreaterThan(work.epoch);
      expect(after.find((s) => s.google_calendar_id === HOLIDAYS.id)!.selected).toBe(true);
      expect(await f.eventRows(work.id)).toHaveLength(0);
      const workChannel = (await channels(ownerId)).find((c) => c.subscription_id === work.id)!;
      expect(workChannel.stopped_at).not.toBeNull();
      expect(f.fake.callsTo('channels.stop').length).toBe(stopsBefore + 1);
      expect((await channels(ownerId)).filter((c) => c.stopped_at === null)).toHaveLength(1);
    });

    it('reselects a deselected calendar with a fresh channel and a sync flag', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id]);
      await svc.updateSelection(ownerId, []);
      const mid = (await subs(ownerId))[0];
      expect(mid.selected).toBe(false);
      expect(mid.needs_sync_at).toBeNull();

      await svc.updateSelection(ownerId, [WORK.id]);

      const after = await subs(ownerId);
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(mid.id);
      expect(after[0].selected).toBe(true);
      expect(after[0].needs_sync_at).not.toBeNull();
      expect(after[0].epoch).toBeGreaterThan(mid.epoch);
      const chans = await channels(ownerId);
      expect(chans).toHaveLength(2);
      expect(chans.filter((c) => c.stopped_at === null)).toHaveLength(1);
    });

    it('makes the selected calendar syncable end to end (due worker run, then the feed)', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      f.fake.seedEvent(HOLIDAYS.id, { id: 'h1', status: 'confirmed', summary: 'Holiday', start: { date: '2026-06-20' }, end: { date: '2026-06-21' } });
      await svc.updateSelection(ownerId, [HOLIDAYS.id]);
      const sub = (await subs(ownerId))[0];

      expect((await f.service.syncSubscription(sub.id)).status).toBe('rebuilt');

      const feed = await svc.feed(ownerId, new Date('2026-06-01Z'), new Date('2026-07-01Z'));
      expect(feed.events.map((e) => e.title)).toEqual(['Holiday']);
      expect(feed.hiddenLegacyItemIds).toEqual([]);
    });

    it('rejects unknown, managed and free/busy-only calendars and writes nothing', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      const subId = await f.createSubscription(ownerId, MANAGED.id, { selected: false });
      await f.markManaged(ownerId, subId);

      for (const id of ['not-a-calendar@example.test', MANAGED.id, BUSY.id]) {
        await expect(svc.updateSelection(ownerId, [WORK.id, id])).rejects.toMatchObject({ status: 400 });
      }

      const rows = await subs(ownerId);
      expect(rows.map((r) => r.google_calendar_id)).toEqual([MANAGED.id]);
      expect(rows[0].selected).toBe(false);
      expect(await channels(ownerId)).toHaveLength(0);
    });

    it('does not touch anything when Google cannot be read', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id]);
      f.fake.injectFailure('calendarList.list', { status: 500 });

      await expect(svc.updateSelection(ownerId, [])).rejects.toBeDefined();

      expect((await subs(ownerId))[0].selected).toBe(true);
    });

    it('keeps the selection when the channel registration fails, leaving no half-registered channel', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      f.fake.injectFailure('events.watch', { status: 500 });

      const res = await svc.updateSelection(ownerId, [WORK.id]);

      expect(res.selected).toEqual([WORK.id]);
      expect((await subs(ownerId))[0].selected).toBe(true);
      expect(await channels(ownerId)).toHaveLength(0);
    });

    it('still deselects when Google refuses to stop the channel, and marks the channel stopped', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id]);
      f.fake.injectFailure('channels.stop', { status: 500 });

      await svc.updateSelection(ownerId, []);

      expect((await subs(ownerId))[0].selected).toBe(false);
      expect((await channels(ownerId))[0].stopped_at).not.toBeNull();
    });

    it('refuses to change the selection while the connection needs a reconnect', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id]);
      await q(`UPDATE google_calendar_connection SET status = 'needs_reconnect' WHERE owner_id = $1`, [ownerId]);

      await expect(svc.updateSelection(ownerId, [])).rejects.toMatchObject({ status: 409 });
      expect((await subs(ownerId))[0].selected).toBe(true);
    });

    it('requires a connected Google account', async () => {
      const svc = makeService();
      const ownerId = await f.createUser(`owner-${++n}@example.test`);
      await expect(svc.updateSelection(ownerId, [WORK.id])).rejects.toBeInstanceOf(ApiException);
      expect(await subs(ownerId)).toHaveLength(0);
    });

    it('is strictly owner-scoped: another user never sees, selects or deselects the first user subscriptions', async () => {
      const svc = makeService();
      const alice = await newOwner();
      const bob = await newOwner();
      await svc.updateSelection(alice, [WORK.id, HOLIDAYS.id]);
      const aliceBefore = JSON.stringify([await subs(alice), await channels(alice)]);

      // Bob sees nothing selected, selects the same shared calendar, then clears his own selection.
      expect((await svc.listCalendars(bob)).filter((c) => c.selected)).toEqual([]);
      await svc.updateSelection(bob, [WORK.id]);
      const bobRows = await subs(bob);
      expect(bobRows).toHaveLength(1);
      expect(bobRows[0].id).not.toBe((await subs(alice)).find((s) => s.google_calendar_id === WORK.id)!.id);
      await svc.updateSelection(bob, []);

      expect(JSON.stringify([await subs(alice), await channels(alice)])).toBe(aliceBefore);
      expect((await svc.listCalendars(alice)).filter((c) => c.selected).map((c) => c.id).sort()).toEqual([HOLIDAYS.id, WORK.id]);
      // Bob's own channel was created for his subscription and stopped by his own deselect.
      const bobChannels = await channels(bob);
      expect(bobChannels).toHaveLength(1);
      expect(bobChannels[0].subscription_id).toBe(bobRows[0].id);
      expect(bobChannels[0].stopped_at).not.toBeNull();
    });
  });

  describe('statusExtras', () => {
    const legacy = (over: Partial<{ connected: boolean; lastSyncAt: Date | null; scopes: string[] }> = {}) => ({
      connected: true,
      lastSyncAt: null,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      ...over,
    });

    it('is the legacy shape while the flag is off and a failing tombstone lookup never breaks it', async () => {
      const throwing = { query: () => Promise.reject(new Error('must not be queried')) };
      const svc = new GoogleCalendarSelectionService(
        throwing as never,
        { get: () => undefined } as unknown as ConfigService,
        f.makeService(undefined),
        fakeGateway(f.fake),
        { webhookUrl: undefined } as unknown as GoogleCalendarConfig,
      );
      const when = new Date('2026-06-15T08:00:00Z');

      await expect(svc.statusExtras('1', legacy({ lastSyncAt: when }))).resolves.toEqual({
        paused: false,
        v2Enabled: false,
        mode: 'legacy',
        needsReconnect: false,
        selectedCount: 0,
        lastSyncAt: '2026-06-15T08:00:00.000Z',
        lastError: null,
        writeEnabled: false,
        revokeFailed: false,
      });
    });

    it('reports selection count, newest sync, a sanitized error and the reconnect state with the flag on', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await svc.updateSelection(ownerId, [WORK.id, HOLIDAYS.id]);
      const rows = await subs(ownerId);
      await q(`UPDATE google_calendar_subscription SET last_sync_at = '2026-06-10T10:00:00Z' WHERE id = $1`, [rows[0].id]);
      await q(`UPDATE google_calendar_subscription SET last_sync_at = '2026-06-12T10:00:00Z', last_error = $2 WHERE id = $1`, [
        rows[1].id,
        'failed Bearer abc.def.ghi-123',
      ]);

      const extras = await svc.statusExtras(ownerId, legacy());

      expect(extras).toMatchObject({
        v2Enabled: true,
        mode: 'v2_read',
        needsReconnect: false,
        selectedCount: 2,
        lastSyncAt: '2026-06-12T10:00:00.000Z',
      });
      expect(extras.lastError).not.toContain('abc.def.ghi-123');
      expect(extras.lastError).toContain('failed');

      await q(`UPDATE google_calendar_connection SET status = 'needs_reconnect' WHERE owner_id = $1`, [ownerId]);
      expect((await svc.statusExtras(ownerId, legacy())).needsReconnect).toBe(true);
    });

    it('counts only the caller own selected calendars', async () => {
      const svc = makeService();
      const alice = await newOwner();
      const bob = await newOwner();
      await svc.updateSelection(alice, [WORK.id, HOLIDAYS.id, PRIMARY.id]);
      await svc.updateSelection(bob, [WORK.id]);

      expect((await svc.statusExtras(alice, legacy())).selectedCount).toBe(3);
      expect((await svc.statusExtras(bob, legacy())).selectedCount).toBe(1);
    });

    it('reports v2_read with nothing selected for a connected owner without any subscription', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      expect(await svc.statusExtras(ownerId, legacy())).toMatchObject({ v2Enabled: true, selectedCount: 0, lastSyncAt: null, lastError: null });
    });

    it('reports mode legacy for a connected owner without a connection row, even with the flag on', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      expect(await svc.statusExtras(ownerId, legacy())).toMatchObject({ v2Enabled: true, mode: 'legacy' });
    });

    it('reports the narrowed mode once the broad scope is gone', async () => {
      const svc = makeService();
      const ownerId = await newOwner();
      await q(
        `INSERT INTO google_calendar_connection (owner_id, status, granted_scopes) VALUES ($1, 'active', '[]'::jsonb)`,
        [ownerId],
      );
      const extras = await svc.statusExtras(
        ownerId,
        legacy({ scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'] }),
      );
      expect(extras.mode).toBe('narrowed');
    });
  });

  describe('feed', () => {
    it('is empty and Google-free while the flag is off', async () => {
      const svc = makeService({ flag: undefined });
      const ownerId = await newOwner();
      expect(await svc.feed(ownerId, new Date('2026-06-01Z'), new Date('2026-07-01Z'))).toEqual({
        events: [],
        hiddenLegacyItemIds: [],
      });
    });
  });
});
