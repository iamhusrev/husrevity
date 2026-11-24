/**
 * In-memory, scriptable stand-in for the Google calls the app makes. Tests
 * only: no network, no real clock, no randomness, so every run is identical.
 *
 * Covered calls: calendarList.list, events.list (pagination, syncToken,
 * 410 Gone), events.watch, channels.stop, calendars.insert, events.insert
 * (409 on an existing id, even a deleted one), events.patch (404 when missing,
 * restores a deleted event when the body is `confirmed`), events.delete, OAuth code exchange, token refresh,
 * token revoke, and ID token verification (the verifier input is a token
 * registered up front; the fake never parses or signs anything).
 *
 * Scripting:
 *   setCalendars / seedEvent / upsertEvent / cancelEvent   shape the data
 *   expireSyncTokens(calendarId)                           next syncToken call gets 410
 *   injectFailure(method, { status, message?, reason?, onCall?, times? })   inject HTTP-style failures
 *   registerAuthCode / registerIdToken                     script the auth side
 *   calls                                                  ordered log of every call
 *
 * Extension points for later slices: add a method to `GatewayMethod`, log it
 * through `enter()` (which also applies injected failures), and keep state in
 * plain maps. Slices that need event writes (insert/update/delete) should add
 * them next to `upsertEvent`, bumping `version` so syncTokens stay consistent.
 */

export type GatewayMethod =
  | 'calendarList.list'
  | 'events.list'
  | 'events.watch'
  | 'channels.stop'
  | 'calendars.insert'
  | 'events.insert'
  | 'events.patch'
  | 'events.delete'
  | 'oauth.exchangeCode'
  | 'oauth.refresh'
  | 'oauth.revoke'
  | 'idToken.verify';

export class FakeGoogleApiError extends Error {
  /** Same shape as googleapis errors: `errors[0].reason` carries e.g. `rateLimitExceeded`. */
  readonly errors?: { reason: string }[];

  constructor(
    public readonly status: number,
    message?: string,
    reason?: string,
  ) {
    super(message ?? `Fake Google API error ${status}`);
    this.name = 'FakeGoogleApiError';
    if (reason) this.errors = [{ reason }];
  }
}

export interface FakeCalendar {
  id: string;
  summary: string;
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
  primary?: boolean;
  backgroundColor?: string;
}

export interface FakeEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  etag?: string;
  htmlLink?: string;
  updated?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  /**
   * Master of a series, e.g. ['RRULE:FREQ=DAILY'] or ['RRULE:FREQ=DAILY;COUNT=5'].
   * Only DAILY (optional COUNT) is understood. With `singleEvents=true` the
   * listing expands it into instances (`<id>_<start>`) inside timeMin/timeMax;
   * a stored event with an instance's id overrides (or, when cancelled,
   * removes) that generated instance. With `singleEvents` unset the master is
   * returned as is.
   */
  recurrence?: string[];
}

export interface FakeTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

export interface FakeIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  aud?: string;
  iss?: string;
  exp?: number;
  nonce?: string;
}

export interface EventsListParams {
  calendarId: string;
  pageToken?: string;
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  /** When true the fake expands recurring masters and filters by timeMin/timeMax. */
  singleEvents?: boolean;
  /** Recorded only (cancelled events are returned by incremental listings regardless). */
  showDeleted?: boolean;
}

export interface EventsListResult {
  items: FakeEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface FailureSpec {
  status: number;
  /** Error message, e.g. `invalid_grant` for a revoked grant (default `Fake Google API error <status>`). */
  message?: string;
  /** Google error reason, e.g. `rateLimitExceeded` or `insufficientPermissions` (exposed as `errors[0].reason`). */
  reason?: string;
  /** 1-based call number of this method to fail; omit to fail the next calls. */
  onCall?: number;
  /** How many consecutive calls fail (default 1). */
  times?: number;
  /**
   * Write calls only: apply the change first, then fail. Models a lost
   * response (Google did the work, the caller sees an error).
   */
  afterEffect?: boolean;
}

export interface RecordedCall {
  method: GatewayMethod;
  args: unknown;
}

interface StoredEvent {
  event: FakeEvent;
  version: number;
}

export class FakeGoogleGateway {
  readonly calls: RecordedCall[] = [];
  /** Page size used when `maxResults` is not given. */
  defaultPageSize = 250;

  private calendars: FakeCalendar[] = [];
  private version = 0;
  private events = new Map<string, Map<string, StoredEvent>>();
  private expired = new Set<string>();
  private failures: { method: GatewayMethod; spec: FailureSpec; left: number }[] = [];
  private callCounts = new Map<GatewayMethod, number>();
  private authCodes = new Map<string, FakeTokenSet>();
  private idTokens = new Map<string, FakeIdTokenClaims>();
  private refreshCounter = 0;
  private createdCalendarCounter = 0;
  private etagCounter = 0;
  private channelCounter = 0;
  readonly activeChannels = new Map<string, { resourceId: string; calendarId: string; token?: string }>();
  readonly revokedTokens: string[] = [];

  // ---- scripting -------------------------------------------------------

  setCalendars(calendars: FakeCalendar[]): void {
    this.calendars = calendars.map((c) => ({ ...c }));
  }

  seedEvent(calendarId: string, event: FakeEvent): void {
    this.upsertEvent(calendarId, event);
  }

  upsertEvent(calendarId: string, event: FakeEvent): void {
    this.bucket(calendarId).set(event.id, { event: { ...event }, version: ++this.version });
  }

  cancelEvent(calendarId: string, eventId: string): void {
    const existing = this.bucket(calendarId).get(eventId);
    this.upsertEvent(calendarId, { ...(existing?.event ?? { id: eventId }), id: eventId, status: 'cancelled' });
  }

  /** Makes every syncToken issued so far for the calendar answer 410 Gone. */
  expireSyncTokens(calendarId: string): void {
    this.expired.add(calendarId);
  }

  injectFailure(method: GatewayMethod, spec: FailureSpec): void {
    this.failures.push({ method, spec, left: spec.times ?? 1 });
  }

  registerAuthCode(code: string, tokens: Partial<FakeTokenSet> = {}): void {
    this.authCodes.set(code, {
      access_token: `access-${code}`,
      refresh_token: `refresh-${code}`,
      expires_in: 3600,
      scope: 'openid email profile',
      ...tokens,
    });
  }

  registerIdToken(idToken: string, claims: FakeIdTokenClaims): void {
    this.idTokens.set(idToken, { ...claims });
  }

  callsTo(method: GatewayMethod): RecordedCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  // ---- Google surface --------------------------------------------------

  async calendarListList(): Promise<{ items: FakeCalendar[] }> {
    this.enter('calendarList.list', {});
    return { items: this.calendars.map((c) => ({ ...c })) };
  }

  async eventsList(params: EventsListParams): Promise<EventsListResult> {
    this.enter('events.list', params);
    const { calendarId } = params;
    const pageSize = params.maxResults ?? this.defaultPageSize;

    let sinceVersion = 0;
    let snapshotVersion = this.version;
    let pageStart = 0;
    let incremental = Boolean(params.syncToken);

    if (params.pageToken) {
      const parsed = this.parseToken(params.pageToken, 'page');
      sinceVersion = parsed.since;
      snapshotVersion = parsed.snapshot;
      pageStart = parsed.offset;
      incremental = parsed.incremental;
    } else if (params.syncToken) {
      if (this.expired.has(calendarId)) {
        throw new FakeGoogleApiError(410, 'Sync token is no longer valid');
      }
      sinceVersion = this.parseToken(params.syncToken, 'sync').since;
    }

    const rows = [...this.bucket(calendarId).values()]
      .filter((s) => s.version > sinceVersion && s.version <= snapshotVersion)
      // A full listing never returns cancelled events; an incremental one does.
      .filter((s) => incremental || s.event.status !== 'cancelled')
      .sort((a, b) => a.version - b.version);

    const listed = params.singleEvents
      ? this.expandForWindow(
          rows.map((s) => s.event),
          [...this.bucket(calendarId).values()].map((s) => s.event),
          params,
        )
      : rows.map((s) => s.event);
    const page = listed.slice(pageStart, pageStart + pageSize).map((e) => ({ ...e }));
    const end = pageStart + pageSize;
    if (end < listed.length) {
      return {
        items: page,
        nextPageToken: `page:${sinceVersion}:${snapshotVersion}:${end}:${incremental ? 1 : 0}`,
      };
    }
    // A fresh full sync after a 410 clears the expiry for that calendar.
    if (!params.syncToken && !params.pageToken) this.expired.delete(calendarId);
    return { items: page, nextSyncToken: `sync:${snapshotVersion}` };
  }

  async eventsWatch(args: {
    calendarId: string;
    id: string;
    address: string;
    token?: string;
    ttlSeconds?: number;
  }): Promise<{ id: string; resourceId: string; expiration: string }> {
    this.enter('events.watch', args);
    const resourceId = `resource-${++this.channelCounter}`;
    this.activeChannels.set(args.id, { resourceId, calendarId: args.calendarId, token: args.token });
    const expiration = String((this.version + 1) * 1000 + (args.ttlSeconds ?? 604800) * 1000);
    return { id: args.id, resourceId, expiration };
  }

  async channelsStop(args: { id: string; resourceId: string }): Promise<void> {
    this.enter('channels.stop', args);
    this.activeChannels.delete(args.id);
  }

  // ---- write surface (optional write-back) --------------------------------

  async calendarsInsert(body: { summary: string; timeZone?: string }): Promise<{ id: string }> {
    const lost = this.enter('calendars.insert', body);
    const id = `created-calendar-${++this.createdCalendarCounter}@example.test`;
    this.calendars.push({ id, summary: body.summary, accessRole: 'owner' });
    this.finish(lost);
    return { id };
  }

  async eventsInsert(args: { calendarId: string; event: FakeEvent }): Promise<FakeEvent> {
    const lost = this.enter('events.insert', args);
    // A deleted event keeps its id reserved in Google, so re-inserting it is a 409 as well.
    if (this.bucket(args.calendarId).has(args.event.id)) throw new FakeGoogleApiError(409, 'Identifier already exists');
    this.upsertEvent(args.calendarId, { ...args.event, status: 'confirmed', etag: this.nextEtag() });
    this.finish(lost);
    return { ...this.bucket(args.calendarId).get(args.event.id)!.event };
  }

  async eventsPatch(args: { calendarId: string; eventId: string; patch: Partial<FakeEvent> }): Promise<FakeEvent> {
    const lost = this.enter('events.patch', args);
    const stored = this.bucket(args.calendarId).get(args.eventId);
    if (!stored) throw new FakeGoogleApiError(404, 'Not Found');
    if (stored.event.status === 'cancelled' && args.patch.status !== 'confirmed') {
      throw new FakeGoogleApiError(404, 'Not Found');
    }
    this.upsertEvent(args.calendarId, { ...stored.event, ...args.patch, id: args.eventId, etag: this.nextEtag() });
    this.finish(lost);
    return { ...this.bucket(args.calendarId).get(args.eventId)!.event };
  }

  async eventsDelete(args: { calendarId: string; eventId: string }): Promise<void> {
    const lost = this.enter('events.delete', args);
    const stored = this.bucket(args.calendarId).get(args.eventId);
    if (!stored) throw new FakeGoogleApiError(404, 'Not Found');
    if (stored.event.status === 'cancelled') throw new FakeGoogleApiError(410, 'Resource has been deleted');
    this.cancelEvent(args.calendarId, args.eventId);
    this.finish(lost);
  }

  /** Live (not cancelled) events of a calendar, for assertions. */
  storedEvents(calendarId: string): FakeEvent[] {
    return [...this.bucket(calendarId).values()].map((s) => ({ ...s.event })).filter((e) => e.status !== 'cancelled');
  }

  /** Ids of the calendars created through calendars.insert. */
  createdCalendarIds(): string[] {
    return this.calendars.filter((c) => c.id.startsWith('created-calendar-')).map((c) => c.id);
  }

  async exchangeCode(code: string): Promise<FakeTokenSet> {
    this.enter('oauth.exchangeCode', { code });
    const tokens = this.authCodes.get(code);
    if (!tokens) throw new FakeGoogleApiError(400, 'invalid_grant');
    this.authCodes.delete(code); // authorization codes are single use
    return { ...tokens };
  }

  async refreshAccessToken(refreshToken: string): Promise<FakeTokenSet> {
    this.enter('oauth.refresh', { refreshToken });
    if (this.revokedTokens.includes(refreshToken)) {
      throw new FakeGoogleApiError(400, 'invalid_grant');
    }
    return {
      access_token: `access-refreshed-${++this.refreshCounter}`,
      expires_in: 3600,
      scope: 'openid email profile',
    };
  }

  async revokeToken(token: string): Promise<void> {
    this.enter('oauth.revoke', { token });
    this.revokedTokens.push(token);
  }

  async verifyIdToken(idToken: string): Promise<FakeIdTokenClaims> {
    this.enter('idToken.verify', { idToken });
    const claims = this.idTokens.get(idToken);
    if (!claims) throw new FakeGoogleApiError(401, 'Invalid ID token');
    return { ...claims };
  }

  // ---- internals -------------------------------------------------------

  private bucket(calendarId: string): Map<string, StoredEvent> {
    let b = this.events.get(calendarId);
    if (!b) {
      b = new Map();
      this.events.set(calendarId, b);
    }
    return b;
  }

  /** singleEvents=true view: expand DAILY masters, then keep events inside timeMin/timeMax. */
  private expandForWindow(events: FakeEvent[], all: FakeEvent[], params: EventsListParams): FakeEvent[] {
    const min = params.timeMin ? Date.parse(params.timeMin) : -Infinity;
    const max = params.timeMax ? Date.parse(params.timeMax) : Infinity;
    const storedIds = new Set(all.map((e) => e.id));
    const out: FakeEvent[] = [];
    for (const ev of events) {
      if (ev.recurrence?.length) {
        out.push(...this.expandDaily(ev, storedIds, min, max));
        continue;
      }
      if (ev.status === 'cancelled' && !params.showDeleted) continue;
      if (this.eventOverlaps(ev, min, max)) out.push(ev);
    }
    return out;
  }

  private expandDaily(master: FakeEvent, storedIds: Set<string>, min: number, max: number): FakeEvent[] {
    if (master.status === 'cancelled' || !master.start) return [];
    const rule = master.recurrence!.find((r) => r.startsWith('RRULE:')) ?? '';
    if (!/FREQ=DAILY/.test(rule)) return [];
    const count = /COUNT=(\d+)/.exec(rule)?.[1];
    const limit = count ? Number(count) : 4000; // endless series: hard cap for the fake only
    const allDay = Boolean(master.start.date);
    const dayMs = 86_400_000;
    const startMs = Date.parse(allDay ? `${master.start.date}T00:00:00Z` : master.start.dateTime!);
    const endMs = Date.parse(
      allDay ? `${master.end?.date ?? master.start.date}T00:00:00Z` : (master.end?.dateTime ?? master.start.dateTime!),
    );
    const out: FakeEvent[] = [];
    for (let i = 0; i < limit; i++) {
      const s = startMs + i * dayMs;
      const e = endMs + i * dayMs;
      if (s >= max) break;
      if (e < min) continue;
      const stamp = new Date(s).toISOString();
      const id = allDay ? `${master.id}_${stamp.slice(0, 10).replace(/-/g, '')}` : `${master.id}_${stamp.replace(/[-:]/g, '').slice(0, 15)}Z`;
      if (storedIds.has(id)) continue; // overridden or cancelled by an exception event
      out.push({
        id,
        status: 'confirmed',
        summary: master.summary,
        recurringEventId: master.id,
        start: allDay ? { date: stamp.slice(0, 10) } : { dateTime: stamp },
        end: allDay ? { date: new Date(e).toISOString().slice(0, 10) } : { dateTime: new Date(e).toISOString() },
      });
    }
    return out;
  }

  private eventOverlaps(ev: FakeEvent, min: number, max: number): boolean {
    const startRaw = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : undefined);
    if (!startRaw) return true;
    const endRaw = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00Z` : startRaw);
    return Date.parse(startRaw) < max && Date.parse(endRaw) >= min;
  }

  private parseToken(token: string, kind: 'page' | 'sync'): { since: number; snapshot: number; offset: number; incremental: boolean } {
    const parts = token.split(':');
    if (parts[0] !== kind) throw new FakeGoogleApiError(400, 'Invalid token');
    if (kind === 'sync') return { since: Number(parts[1]), snapshot: this.version, offset: 0, incremental: true };
    return { since: Number(parts[1]), snapshot: Number(parts[2]), offset: Number(parts[3]), incremental: parts[4] === '1' };
  }

  private nextEtag(): string {
    return `etag-${++this.etagCounter}`;
  }

  /** Throws the deferred error of an `afterEffect` failure once the write has been applied. */
  private finish(lost: FakeGoogleApiError | undefined): void {
    if (lost) throw lost;
  }

  /** Logs the call and applies injected failures. Returns the error of an `afterEffect` failure instead of throwing it. */
  private enter(method: GatewayMethod, args: unknown): FakeGoogleApiError | undefined {
    this.calls.push({ method, args });
    const n = (this.callCounts.get(method) ?? 0) + 1;
    this.callCounts.set(method, n);
    for (const f of this.failures) {
      if (f.method !== method || f.left <= 0) continue;
      if (f.spec.onCall !== undefined && n < f.spec.onCall) continue;
      f.left -= 1;
      const err = new FakeGoogleApiError(f.spec.status, f.spec.message, f.spec.reason);
      if (f.spec.afterEffect) return err;
      throw err;
    }
    return undefined;
  }
}
