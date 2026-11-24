import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { GoogleEventDto } from '../google-calendar-event.mapper';
import { GoogleEventsReader } from '../google-events-reader';
import { GcalWebhookController } from '../gcal-webhook.controller';
import { hashChannelToken } from '../channel-token';
import { createSyncFixture, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Real-Postgres test of plan item 33 (webhook routing) and the minute worker
 * coalescing. The route is the existing `POST /hooks/gcal` (outside the /api
 * prefix, see main.ts): Google keeps calling the address it was registered
 * with, so nothing changes on the Google side. A UUID channel id is routed
 * through `google_calendar_channel`; anything else (legacy
 * `husrevity-gcal-<owner>-<ts>` ids) keeps the legacy behaviour.
 */
jest.setTimeout(240_000);

const GENERIC = { success: false, message: 'Channel not found or inactive' };

describe('webhook_routes_and_rejects (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let n = 0;
  const legacyLookup = jest.fn();
  const legacySync = jest.fn();

  const controllerFor = (flag: string | undefined): GcalWebhookController =>
    new GcalWebhookController(
      { findByChannelId: legacyLookup } as never,
      { syncIncremental: legacySync } as never,
      f.makeService(flag),
    );
  const needsSync = async (subId: string): Promise<unknown> => (await f.subscriptionRow(subId)).needs_sync_at;
  const newSub = async (): Promise<{ ownerId: string; subId: string; cal: string }> => {
    const ownerId = await f.createUser(`hook-${++n}@example.test`);
    const cal = `hook-cal-${n}@example.test`;
    return { ownerId, subId: await f.createSubscription(ownerId, cal), cal };
  };

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    f = await createSyncFixture(h);
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    legacyLookup.mockReset().mockResolvedValue(null);
    legacySync.mockReset();
  });

  it('routes a valid UUID channel and token to its own subscription and only marks needs_sync_at', async () => {
    const a = await newSub();
    const b = await newSub();
    const chA = await f.createChannel(a.ownerId, a.subId);
    await f.createChannel(b.ownerId, b.subId);
    const callsBefore = f.fake.calls.length;
    const rowsBefore = await f.eventRows(a.subId);

    const res = await controllerFor('true').handleWebhook(chA.channelId, 'resource-1', 'exists', chA.token);

    expect(res.success).toBe(true);
    expect(await needsSync(a.subId)).not.toBeNull();
    expect(await needsSync(b.subId)).toBeNull();
    // Marking only: no Google call, no row change, no sync token change, legacy engine untouched.
    expect(f.fake.calls.length).toBe(callsBefore);
    expect(await f.eventRows(a.subId)).toEqual(rowsBefore);
    expect((await f.subscriptionRow(a.subId)).sync_token).toBeNull();
    expect(legacySync).not.toHaveBeenCalled();
  });

  it('does not mark anything for the initial sync handshake, but still authenticates it', async () => {
    const a = await newSub();
    const ch = await f.createChannel(a.ownerId, a.subId);
    const ctrl = controllerFor('true');
    expect((await ctrl.handleWebhook(ch.channelId, 'resource-1', 'sync', ch.token)).success).toBe(true);
    expect(await needsSync(a.subId)).toBeNull();
    expect(await ctrl.handleWebhook(ch.channelId, 'resource-1', 'sync', 'wrong')).toEqual(GENERIC);
  });

  describe('rejections have no effect and answer identically', () => {
    it.each([
      ['wrong token', (c: { channelId: string; token: string }) => [c.channelId, 'resource-1', 'exists', 'wrong-token']],
      ['missing token', (c: { channelId: string; token: string }) => [c.channelId, 'resource-1', 'exists', undefined]],
      ['resource id mismatch', (c: { channelId: string; token: string }) => [c.channelId, 'other-resource', 'exists', c.token]],
      ['unknown channel', (c: { channelId: string; token: string }) => [randomUUID(), 'resource-1', 'exists', c.token]],
    ])('%s', async (_name, args) => {
      const a = await newSub();
      const ch = await f.createChannel(a.ownerId, a.subId);
      const res = await controllerFor('true').handleWebhook(...(args(ch) as [string, string, string, string?]));
      expect(res).toEqual(GENERIC);
      expect(await needsSync(a.subId)).toBeNull();
    });

    it('uses the token of another channel, a stopped channel, an expired channel and a deselected subscription', async () => {
      const a = await newSub();
      const b = await newSub();
      const chA = await f.createChannel(a.ownerId, a.subId);
      const chB = await f.createChannel(b.ownerId, b.subId);
      const ctrl = controllerFor('true');
      // Valid channel of A with B's token.
      expect(await ctrl.handleWebhook(chA.channelId, 'resource-1', 'exists', chB.token)).toEqual(GENERIC);

      const stopped = await newSub();
      const chStopped = await f.createChannel(stopped.ownerId, stopped.subId, { stopped: true });
      expect(await ctrl.handleWebhook(chStopped.channelId, 'resource-1', 'exists', chStopped.token)).toEqual(GENERIC);

      const expired = await newSub();
      const chExpired = await f.createChannel(expired.ownerId, expired.subId, { expiresInSeconds: -60 });
      expect(await ctrl.handleWebhook(chExpired.channelId, 'resource-1', 'exists', chExpired.token)).toEqual(GENERIC);

      const off = await newSub();
      const chOff = await f.createChannel(off.ownerId, off.subId);
      await f.service.deselectSubscription(off.subId);
      expect(await ctrl.handleWebhook(chOff.channelId, 'resource-1', 'exists', chOff.token)).toEqual(GENERIC);

      for (const s of [a, b, stopped, expired, off]) expect(await needsSync(s.subId)).toBeNull();
    });

    it('does not leak stored hashes, owners or subscription ids in any answer', async () => {
      const a = await newSub();
      const ch = await f.createChannel(a.ownerId, a.subId);
      const ctrl = controllerFor('true');
      const bodies = JSON.stringify([
        await ctrl.handleWebhook(ch.channelId, 'resource-1', 'exists', 'wrong'),
        await ctrl.handleWebhook(ch.channelId, 'bad-resource', 'exists', ch.token),
        await ctrl.handleWebhook(randomUUID(), 'resource-1', 'exists', ch.token),
      ]);
      for (const secret of [hashChannelToken(ch.token), ch.token, a.ownerId, a.subId, a.cal]) {
        expect(bodies).not.toContain(secret);
      }
    });
  });

  it('does nothing on the new path while GOOGLE_CALENDAR_V2_ENABLED is not true', async () => {
    const a = await newSub();
    const ch = await f.createChannel(a.ownerId, a.subId);
    for (const flag of [undefined, 'false', 'TRUE']) {
      expect(await controllerFor(flag).handleWebhook(ch.channelId, 'resource-1', 'exists', ch.token)).toEqual(GENERIC);
    }
    expect(await needsSync(a.subId)).toBeNull();
    expect(legacyLookup).toHaveBeenCalled(); // unchanged behaviour: it fell through to the legacy lookup
  });

  it('keeps the legacy hooks/gcal behaviour for legacy channels, alongside the new route', async () => {
    legacyLookup.mockResolvedValue({
      ownerId: 'legacy-owner',
      resourceId: 'legacy-res',
      channelToken: 'legacy-token',
    });
    legacySync.mockResolvedValue({});
    const res = await controllerFor('true').handleWebhook('husrevity-gcal-7-1700000000', 'legacy-res', 'exists', 'legacy-token');
    expect(res).toEqual({ success: true, message: 'Incremental sync triggered' });
    expect(legacySync).toHaveBeenCalledWith('legacy-owner');
  });

  it('falls through to the legacy lookup when a UUID channel is not in the new table', async () => {
    legacyLookup.mockResolvedValue({ ownerId: 'legacy-owner', resourceId: 'r', channelToken: 't' });
    legacySync.mockResolvedValue({});
    const legacyUuid = randomUUID();
    const res = await controllerFor('true').handleWebhook(legacyUuid, 'r', 'exists', 't');
    expect(res.success).toBe(true);
    expect(legacyLookup).toHaveBeenCalledWith(legacyUuid);
  });

  it('never logs channel tokens or their hashes', async () => {
    const a = await newSub();
    const ch = await f.createChannel(a.ownerId, a.subId);
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((m) => jest.spyOn(Logger.prototype, m).mockImplementation());
    try {
      const ctrl = controllerFor('true');
      await ctrl.handleWebhook(ch.channelId, 'resource-1', 'exists', ch.token);
      await ctrl.handleWebhook(ch.channelId, 'resource-1', 'exists', 'wrong-token-value');
      await ctrl.handleWebhook(ch.channelId, 'bad-resource', 'exists', ch.token);
      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
      for (const secret of [ch.token, 'wrong-token-value', hashChannelToken(ch.token)]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  describe('worker coalescing', () => {
    it('syncs a due subscription once per tick however many webhooks arrived, and not again until flagged', async () => {
      // Isolate the tick: only this subscription may be eligible.
      await h.dataSource.query(`UPDATE google_calendar_subscription SET selected = false`);
      const a = await newSub();
      await h.dataSource.query(`UPDATE google_calendar_subscription SET selected = true WHERE id = $1`, [a.subId]);
      f.fake.seedEvent(a.cal, {
        id: 'e1',
        status: 'confirmed',
        summary: 'E1',
        start: { dateTime: '2026-06-20T10:00:00Z' },
        end: { dateTime: '2026-06-20T11:00:00Z' },
      });
      const ch = await f.createChannel(a.ownerId, a.subId);
      const ctrl = controllerFor('true');
      for (let i = 0; i < 5; i++) await ctrl.handleWebhook(ch.channelId, 'resource-1', 'exists', ch.token);
      const callsBefore = f.fake.callsTo('events.list').length;

      const tick = await f.service.runDueSyncs();
      expect(tick.attempted).toBe(1);
      expect(tick.results.map((r) => r.status)).toEqual(['rebuilt']);
      // One initial sync = one token walk + one window read; five webhooks did not multiply it.
      expect(f.fake.callsTo('events.list').length - callsBefore).toBe(2);
      expect(await needsSync(a.subId)).toBeNull();

      expect(await f.service.runDueSyncs()).toEqual({ attempted: 0, results: [] });
      await ctrl.handleWebhook(ch.channelId, 'resource-1', 'exists', ch.token);
      const next = await f.service.runDueSyncs();
      expect(next.results.map((r) => r.status)).toEqual(['synced']);
    });

    it('keeps a webhook that arrives while a sync is running for the next tick', async () => {
      await h.dataSource.query(`UPDATE google_calendar_subscription SET selected = false`);
      const a = await newSub();
      await h.dataSource.query(`UPDATE google_calendar_subscription SET selected = true WHERE id = $1`, [a.subId]);
      const ch = await f.createChannel(a.ownerId, a.subId);
      let fired = false;
      const reader: GoogleEventsReader = {
        listEvents: async (_o, req) => {
          if (!fired) {
            fired = true;
            await controllerFor('true').handleWebhook(ch.channelId, 'resource-1', 'exists', ch.token);
          }
          const res = await f.fake.eventsList(req);
          return { ...res, items: res.items as GoogleEventDto[] };
        },
      };
      await f.makeService('true', reader).runDueSyncs();
      expect(await needsSync(a.subId)).not.toBeNull();
      expect((await f.service.runDueSyncs()).attempted).toBe(1);
      expect(await needsSync(a.subId)).toBeNull();
    });
  });
});
