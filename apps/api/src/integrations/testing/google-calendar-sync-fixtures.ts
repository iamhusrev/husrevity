import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { GoogleCalendarReadSyncService } from '../google-calendar-read-sync.service';
import { GoogleEventDto } from '../google-calendar-event.mapper';
import { GoogleEventsReader } from '../google-events-reader';
import { hashChannelToken } from '../channel-token';
import { GoogleCalendarGateway } from '../google-calendar-gateway';
import { FakeGoogleGateway } from './fake-google-gateway';
import { MigrationHarness } from '../../db/migrations/__tests__/helpers/migration-harness';

/**
 * Shared setup for Testcontainers specs of the Google Calendar read engine:
 * wires the real service to the FakeGoogleGateway on a migrated database and
 * offers raw-SQL helpers to create owners, connections and subscriptions.
 * One container per spec file: call `createSyncFixture(harness)` in beforeAll.
 */
export interface SyncFixture {
  fake: FakeGoogleGateway;
  service: GoogleCalendarReadSyncService;
  /** Mutable clock the service reads; move it to simulate days passing. */
  clock: { now: Date };
  createUser(email: string): Promise<string>;
  /** Creates (or reuses) the owner's connection and a selected subscription. */
  createSubscription(
    ownerId: string,
    googleCalendarId: string,
    opts?: { selected?: boolean },
  ): Promise<string>;
  subscriptionRow(id: string): Promise<Record<string, unknown>>;
  /** Raw stored event rows of a subscription, all generations, dates as text. */
  eventRows(subscriptionId: string): Promise<Record<string, unknown>[]>;
  /** Builds another service instance on the same database; `reader` defaults to the fake gateway. */
  makeService(flag: string | undefined, reader?: GoogleEventsReader): GoogleCalendarReadSyncService;
  /** Inserts a push channel whose token is stored hashed; returns the raw token (test-only). */
  createChannel(
    ownerId: string,
    subscriptionId: string,
    opts?: { id?: string; token?: string; resourceId?: string | null; expiresInSeconds?: number; stopped?: boolean },
  ): Promise<{ channelId: string; token: string }>;
  /** Legacy integration account (the pre-v2 managed "Husrevity" calendar id) for an owner. */
  createLegacyAccount(ownerId: string, calendarId: string): Promise<void>;
  /** Inserts an item; `source: 'gcal'` makes it a legacy Google copy. */
  createItem(ownerId: string, title: string, source: string): Promise<string>;
  /** Marks the subscription's calendar as the managed publish target (one publication row). */
  markManaged(ownerId: string, subscriptionId: string): Promise<void>;
  /** Raw snapshot of every row of items and external_link (for "never touched" proofs). */
  itemsSnapshot(): Promise<string>;
}

export function fakeReader(fake: FakeGoogleGateway): GoogleEventsReader {
  return {
    listEvents: async (_ownerId, req) => {
      const res = await fake.eventsList(req);
      return { ...res, items: res.items as GoogleEventDto[] };
    },
  };
}

/** Adapts the fake to the calendar-management gateway (list calendars, watch, stop). */
export function fakeGateway(fake: FakeGoogleGateway): GoogleCalendarGateway {
  return {
    listCalendars: async () =>
      (await fake.calendarListList()).items.map((c) => ({
        id: c.id,
        summary: c.summary,
        backgroundColor: c.backgroundColor ?? null,
        accessRole: c.accessRole,
        primary: c.primary === true,
      })),
    watchEvents: async (_ownerId, req) => {
      const res = await fake.eventsWatch({
        calendarId: req.calendarId,
        id: req.channelId,
        address: req.address,
        token: req.token,
      });
      // The fake's expiration is a synthetic version-based number; use a real 7-day horizon.
      return { resourceId: res.resourceId, expiresAt: new Date(Date.now() + 7 * 86_400_000) };
    },
    stopChannel: async (_ownerId, channelId, resourceId) => {
      await fake.channelsStop({ id: channelId, resourceId });
    },
    revokeToken: async (token) => {
      await fake.revokeToken(token);
    },
    createCalendar: async (_ownerId, req) => fake.calendarsInsert(req),
    insertEvent: async (_ownerId, calendarId, eventId, event) => {
      const res = await fake.eventsInsert({ calendarId, event: { ...event, id: eventId } });
      return { id: res.id, etag: res.etag ?? null };
    },
    patchEvent: async (_ownerId, calendarId, eventId, event) => {
      const res = await fake.eventsPatch({ calendarId, eventId, patch: event });
      return { id: res.id, etag: res.etag ?? null };
    },
    deleteEvent: async (_ownerId, calendarId, eventId) => {
      await fake.eventsDelete({ calendarId, eventId });
    },
  };
}

export async function createSyncFixture(h: MigrationHarness): Promise<SyncFixture> {
  const fake = new FakeGoogleGateway();
  const clock = { now: new Date('2026-06-15T08:00:00Z') };
  const makeService = (flag: string | undefined, reader?: GoogleEventsReader): GoogleCalendarReadSyncService => {
    const config = { get: (k: string) => (k === 'GOOGLE_CALENDAR_V2_ENABLED' ? flag : undefined) };
    const svc = new GoogleCalendarReadSyncService(
      h.dataSource,
      config as unknown as ConfigService,
      reader ?? fakeReader(fake),
    );
    svc.now = () => clock.now;
    return svc;
  };
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    h.dataSource.query(sql, params);

  const createItem = async (ownerId: string, title: string, source: string): Promise<string> =>
    (
      await q<{ id: string }>(
        `INSERT INTO items (owner_id, kind, title, scheduled_at, source) VALUES ($1, 'event', $2, now(), $3) RETURNING id`,
        [ownerId, title, source],
      )
    )[0].id;

  return {
    fake,
    clock,
    service: makeService('true'),
    createItem,
    makeService,
    async createUser(email) {
      return (await q<{ id: string }>(`INSERT INTO app_user (email, password_hash) VALUES ($1, 'x') RETURNING id`, [email]))[0].id;
    },
    async createSubscription(ownerId, googleCalendarId, opts = {}) {
      const conn = await q<{ id: string }>(
        `INSERT INTO google_calendar_connection (owner_id) VALUES ($1)
         ON CONFLICT (owner_id) DO UPDATE SET updated_at = now() RETURNING id`,
        [ownerId],
      );
      const sub = await q<{ id: string }>(
        `INSERT INTO google_calendar_subscription (owner_id, connection_id, google_calendar_id, selected)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [ownerId, conn[0].id, googleCalendarId, opts.selected ?? true],
      );
      return sub[0].id;
    },
    async createChannel(ownerId, subscriptionId, opts = {}) {
      const channelId = opts.id ?? randomUUID();
      const token = opts.token ?? randomUUID();
      await q(
        `INSERT INTO google_calendar_channel (id, owner_id, subscription_id, token_hash, resource_id, expires_at, stopped_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6), $7)`,
        [
          channelId,
          ownerId,
          subscriptionId,
          hashChannelToken(token),
          opts.resourceId === undefined ? 'resource-1' : opts.resourceId,
          opts.expiresInSeconds ?? 86_400,
          opts.stopped ? new Date() : null,
        ],
      );
      return { channelId, token };
    },
    async createLegacyAccount(ownerId, calendarId) {
      await q(
        `INSERT INTO integration_account (owner_id, provider, encrypted_access_token, calendar_id, connected_at)
         VALUES ($1, 'google_calendar', 'enc', $2, now())`,
        [ownerId, calendarId],
      );
    },
    async markManaged(ownerId, subscriptionId) {
      const itemId = await createItem(ownerId, 'published', 'web');
      await q(
        `INSERT INTO google_calendar_publication (owner_id, item_id, subscription_id, google_event_id) VALUES ($1, $2, $3, 'pub-1')`,
        [ownerId, itemId, subscriptionId],
      );
    },
    async itemsSnapshot() {
      const items = await q(`SELECT * FROM items ORDER BY id`);
      const links = await q(`SELECT * FROM external_link ORDER BY id`);
      return JSON.stringify({ items, links });
    },
    async subscriptionRow(id) {
      return (await q(`SELECT * FROM google_calendar_subscription WHERE id = $1`, [id]))[0];
    },
    async eventRows(subscriptionId) {
      return q(
        `SELECT generation, google_event_id, recurring_event_id, title, all_day, start_at, end_at,
                start_date::text AS start_date, end_date_exclusive::text AS end_date_exclusive
           FROM google_calendar_event WHERE subscription_id = $1 ORDER BY generation, google_event_id`,
        [subscriptionId],
      );
    },
  };
}
