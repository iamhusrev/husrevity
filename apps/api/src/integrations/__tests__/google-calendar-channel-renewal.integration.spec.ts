import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';
import { hashChannelToken } from '../channel-token';
import { GoogleCalendarConfig } from '../google-calendar.config';
import { GoogleCalendarGateway, GoogleWatchRequest } from '../google-calendar-gateway';
import { GoogleCalendarSelectionService } from '../google-calendar-selection.service';
import { createSyncFixture, fakeGateway, SyncFixture } from '../testing/google-calendar-sync-fixtures';

/**
 * Real-Postgres tests (disposable Testcontainers database) of push-channel
 * renewal: new channel first, old one stopped, exactly one new channel under
 * concurrency, failures keep the old channel, only eligible subscriptions.
 */
jest.setTimeout(240_000);

const WEBHOOK = 'https://hooks.example.test/hooks/gcal';
const HOUR = 3600;

describe('Google Calendar channel renewal (integration)', () => {
  let h: MigrationHarness;
  let f: SyncFixture;
  let n = 0;

  /** Gateway wrapper recording the raw watch requests (tokens) and allowing failure injection. */
  const makeSetup = (opts: { flag?: string; gatewayHooks?: Partial<GoogleCalendarGateway> } = {}) => {
    const watches: GoogleWatchRequest[] = [];
    const base = fakeGateway(f.fake);
    const gateway: GoogleCalendarGateway = {
      ...base,
      watchEvents: async (ownerId, req) => {
        watches.push(req);
        return (opts.gatewayHooks?.watchEvents ?? base.watchEvents)(ownerId, req);
      },
      stopChannel: (opts.gatewayHooks?.stopChannel ?? base.stopChannel) as GoogleCalendarGateway['stopChannel'],
    };
    const flag = 'flag' in opts ? opts.flag : 'true';
    const config = { get: (k: string) => (k === 'GOOGLE_CALENDAR_V2_ENABLED' ? flag : undefined) } as unknown as ConfigService;
    const svc = new GoogleCalendarSelectionService(
      h.dataSource,
      config,
      f.makeService('true'),
      gateway,
      { webhookUrl: WEBHOOK } as unknown as GoogleCalendarConfig,
    );
    return { svc, watches };
  };

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    h.dataSource.query(sql, params);
  const channels = (subscriptionId: string) =>
    q<{ id: string; token_hash: string; resource_id: string | null; stopped_at: Date | null; expires_at: Date }>(
      `SELECT * FROM google_calendar_channel WHERE subscription_id = $1 ORDER BY created_at, id`,
      [subscriptionId],
    );
  const owner = async () => f.createUser(`renew-${++n}@example.test`);
  const setup = async (opts: { expiresInSeconds?: number } = {}) => {
    const o = await owner();
    const sub = await f.createSubscription(o, `renew-cal-${n}@example.test`);
    const old = await f.createChannel(o, sub, { expiresInSeconds: opts.expiresInSeconds ?? 2 * HOUR, resourceId: `old-res-${n}` });
    return { o, sub, old };
  };

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    f = await createSyncFixture(h);
  });

  // Each test starts without channels of earlier tests (the container is shared per file).
  afterEach(async () => {
    await q(`UPDATE google_calendar_channel SET stopped_at = now() WHERE stopped_at IS NULL`);
    // A selected subscription without a live channel is itself due for a channel: park earlier tests' ones.
    await q(`UPDATE google_calendar_subscription SET selected = false`);
  });

  afterAll(async () => {
    await h.close();
  });

  it('renews an expiring channel: new one first, old one stopped, the webhook routes only the new token', async () => {
    const { o, sub, old } = await setup();
    const { svc, watches } = makeSetup();

    expect(await svc.renewDueChannels()).toEqual({ attempted: 1, renewed: 1 });

    const rows = await channels(sub);
    expect(rows).toHaveLength(2);
    const oldRow = rows.find((r) => r.id === old.channelId)!;
    const newRow = rows.find((r) => r.id !== old.channelId)!;
    expect(oldRow.stopped_at).not.toBeNull();
    expect(newRow.stopped_at).toBeNull();
    expect(newRow.resource_id).toMatch(/^resource-/);
    expect(new Date(newRow.expires_at).getTime()).toBeGreaterThan(Date.now() + 24 * HOUR * 1000);
    // Order: watch of the new channel happened before the old one was stopped.
    const methods = f.fake.callsTo('events.watch').length;
    expect(methods).toBeGreaterThan(0);
    expect(f.fake.callsTo('channels.stop').some((c) => JSON.stringify(c).includes(old.channelId))).toBe(true);
    // Only the hash of the token is stored.
    expect(watches).toHaveLength(1);
    expect(newRow.token_hash).toBe(hashChannelToken(watches[0].token));
    expect(JSON.stringify(rows)).not.toContain(watches[0].token);
    // Webhook routing: the new token works, the old one does not.
    const engine = f.makeService('true');
    expect(await engine.markSyncNeededByChannel(newRow.id, newRow.resource_id!, watches[0].token, false)).toBe(true);
    expect(await engine.markSyncNeededByChannel(old.channelId, 'old-res-' + n, old.token, false)).toBe(false);
    expect(o).toBeDefined();
  });

  it('keeps the old channel untouched when registering the new one fails', async () => {
    const { sub, old } = await setup();
    const { svc } = makeSetup({
      gatewayHooks: {
        watchEvents: async () => {
          throw Object.assign(new Error('Bearer secret-token-value'), { code: 503 });
        },
      },
    });
    const stopsBefore = f.fake.callsTo('channels.stop').length;

    expect(await svc.renewDueChannels()).toEqual({ attempted: 1, renewed: 0 });

    const rows = await channels(sub);
    expect(rows.map((r) => r.id)).toEqual([old.channelId]);
    expect(rows[0].stopped_at).toBeNull();
    expect(f.fake.callsTo('channels.stop').length).toBe(stopsBefore);
    const engine = f.makeService('true');
    expect(await engine.markSyncNeededByChannel(old.channelId, rows[0].resource_id!, old.token, false)).toBe(true);
  });

  it('marks the old channel stopped locally when Google refuses to stop it, and routes only the new one', async () => {
    const { sub, old } = await setup();
    const { svc, watches } = makeSetup({
      gatewayHooks: {
        stopChannel: async () => {
          throw Object.assign(new Error('boom'), { code: 500 });
        },
      },
    });

    expect(await svc.renewDueChannels()).toEqual({ attempted: 1, renewed: 1 });

    const rows = await channels(sub);
    expect(rows.find((r) => r.id === old.channelId)!.stopped_at).not.toBeNull();
    const fresh = rows.find((r) => r.id !== old.channelId)!;
    const engine = f.makeService('true');
    expect(await engine.markSyncNeededByChannel(fresh.id, fresh.resource_id!, watches[0].token, false)).toBe(true);
    expect(await engine.markSyncNeededByChannel(old.channelId, rows[0].resource_id ?? 'x', old.token, false)).toBe(false);
  });

  it('creates exactly one new channel when two renewals run concurrently', async () => {
    const { sub } = await setup();
    const a = makeSetup();
    const b = makeSetup();

    const [ra, rb] = await Promise.all([a.svc.renewDueChannels(), b.svc.renewDueChannels()]);

    expect(ra.renewed + rb.renewed).toBe(1);
    const rows = await channels(sub);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.stopped_at === null)).toHaveLength(1);
    // A later run finds nothing to do.
    expect(await a.svc.renewDueChannels()).toEqual({ attempted: 0, renewed: 0 });
  });

  it('leaves a channel that is not about to expire untouched', async () => {
    const { sub } = await setup({ expiresInSeconds: 3 * 24 * HOUR });
    const { svc } = makeSetup();
    expect(await svc.renewDueChannels()).toEqual({ attempted: 0, renewed: 0 });
    expect(await channels(sub)).toHaveLength(1);
  });

  it('skips deselected, managed and non-active-connection subscriptions', async () => {
    const deselected = await setup();
    await q(`UPDATE google_calendar_subscription SET selected = false WHERE id = $1`, [deselected.sub]);
    const managed = await setup();
    await f.markManaged(managed.o, managed.sub);
    const reconnect = await setup();
    await q(`UPDATE google_calendar_connection SET status = 'needs_reconnect' WHERE owner_id = $1`, [reconnect.o]);
    const { svc } = makeSetup();

    const res = await svc.renewDueChannels();

    for (const s of [deselected, managed, reconnect]) {
      expect(await channels(s.sub)).toHaveLength(1);
    }
    expect(res.renewed).toBe(0);
  });

  it('does nothing while the flag is off', async () => {
    const { sub } = await setup();
    const { svc, watches } = makeSetup({ flag: 'false' });
    expect(await svc.renewDueChannels()).toEqual({ attempted: 0, renewed: 0 });
    expect(watches).toEqual([]);
    expect(await channels(sub)).toHaveLength(1);
  });

  describe('selected subscriptions without any live channel (first registration failed)', () => {
    const bare = async () => {
      const o = await owner();
      const sub = await f.createSubscription(o, `bare-cal-${n}@example.test`);
      return { o, sub };
    };
    const failing: Partial<GoogleCalendarGateway> = {
      watchEvents: async () => {
        throw Object.assign(new Error('Bearer secret-token-value'), { code: 503 });
      },
    };

    it('registration fails at selection, the next renewal pass creates the channel', async () => {
      const { o, sub } = await bare();
      const failed = makeSetup({ gatewayHooks: failing });
      await failed.svc.registerChannelsForSelected(o);
      expect(await channels(sub)).toHaveLength(0);

      const { svc, watches } = makeSetup();
      expect(await svc.renewDueChannels()).toEqual({ attempted: 1, renewed: 1 });

      const rows = await channels(sub);
      expect(rows).toHaveLength(1);
      expect(rows[0].stopped_at).toBeNull();
      expect(rows[0].resource_id).toMatch(/^resource-/);
      expect(rows[0].token_hash).toBe(hashChannelToken(watches[0].token));
      expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now() + 24 * HOUR * 1000);
      // A later pass has nothing left to do.
      expect(await svc.renewDueChannels()).toEqual({ attempted: 0, renewed: 0 });
    });

    it('a failing retry leaves no placeholder channel behind and the following pass tries again', async () => {
      const { sub } = await bare();
      expect(await makeSetup({ gatewayHooks: failing }).svc.renewDueChannels()).toEqual({ attempted: 1, renewed: 0 });
      expect(await channels(sub)).toHaveLength(0);
      expect(await makeSetup().svc.renewDueChannels()).toEqual({ attempted: 1, renewed: 1 });
      expect(await channels(sub)).toHaveLength(1);
    });

    it('skips deselected, managed and needs_reconnect subscriptions that have no channel', async () => {
      const deselected = await bare();
      await q(`UPDATE google_calendar_subscription SET selected = false WHERE id = $1`, [deselected.sub]);
      const managed = await bare();
      await f.markManaged(managed.o, managed.sub);
      const reconnect = await bare();
      await q(`UPDATE google_calendar_connection SET status = 'needs_reconnect' WHERE owner_id = $1`, [reconnect.o]);
      const disconnected = await bare();
      await q(`UPDATE google_calendar_connection SET status = 'disconnected' WHERE owner_id = $1`, [disconnected.o]);
      const { svc, watches } = makeSetup();

      expect(await svc.renewDueChannels()).toEqual({ attempted: 0, renewed: 0 });

      expect(watches).toEqual([]);
      for (const s of [deselected, managed, reconnect, disconnected]) expect(await channels(s.sub)).toHaveLength(0);
    });

    it('creates exactly one channel when two passes run concurrently', async () => {
      const { sub } = await bare();
      const a = makeSetup();
      const b = makeSetup();

      const [ra, rb] = await Promise.all([a.svc.renewDueChannels(), b.svc.renewDueChannels()]);

      expect(ra.renewed + rb.renewed).toBe(1);
      const rows = await channels(sub);
      expect(rows).toHaveLength(1);
      expect(rows[0].stopped_at).toBeNull();
    });

    it('does nothing while the flag is off or without a webhook address', async () => {
      const { sub } = await bare();
      expect(await makeSetup({ flag: 'false' }).svc.renewDueChannels()).toEqual({ attempted: 0, renewed: 0 });
      const noHook = new GoogleCalendarSelectionService(
        h.dataSource,
        { get: () => 'true' } as unknown as ConfigService,
        f.makeService('true'),
        fakeGateway(f.fake),
        { webhookUrl: undefined } as unknown as GoogleCalendarConfig,
      );
      expect(await noHook.renewDueChannels()).toEqual({ attempted: 0, renewed: 0 });
      expect(await channels(sub)).toHaveLength(0);
    });
  });
});
