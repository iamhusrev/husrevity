import { FakeGoogleApiError, FakeGoogleGateway, FakeEvent } from './fake-google-gateway';

const ev = (id: string, extra: Partial<FakeEvent> = {}): FakeEvent => ({
  id,
  status: 'confirmed',
  summary: id,
  ...extra,
});

describe('FakeGoogleGateway', () => {
  let g: FakeGoogleGateway;
  beforeEach(() => {
    g = new FakeGoogleGateway();
  });

  it('lists calendars', async () => {
    g.setCalendars([{ id: 'cal-1', summary: 'Work', accessRole: 'owner', primary: true }]);
    expect((await g.calendarListList()).items.map((c) => c.id)).toEqual(['cal-1']);
  });

  it('paginates a full listing and ends with a syncToken', async () => {
    ['a', 'b', 'c'].forEach((id) => g.seedEvent('cal', ev(id)));
    const p1 = await g.eventsList({ calendarId: 'cal', maxResults: 2 });
    expect(p1.items.map((e) => e.id)).toEqual(['a', 'b']);
    expect(p1.nextPageToken).toBeDefined();
    expect(p1.nextSyncToken).toBeUndefined();
    const p2 = await g.eventsList({ calendarId: 'cal', maxResults: 2, pageToken: p1.nextPageToken });
    expect(p2.items.map((e) => e.id)).toEqual(['c']);
    expect(p2.nextSyncToken).toBeDefined();
  });

  it('returns only changes (including cancellations) for a syncToken', async () => {
    g.seedEvent('cal', ev('a'));
    g.seedEvent('cal', ev('b'));
    const full = await g.eventsList({ calendarId: 'cal' });
    g.upsertEvent('cal', ev('a', { summary: 'renamed' }));
    g.cancelEvent('cal', 'b');
    const delta = await g.eventsList({ calendarId: 'cal', syncToken: full.nextSyncToken });
    expect(delta.items.map((e) => [e.id, e.status])).toEqual([
      ['a', 'confirmed'],
      ['b', 'cancelled'],
    ]);
    const none = await g.eventsList({ calendarId: 'cal', syncToken: delta.nextSyncToken });
    expect(none.items).toEqual([]);
  });

  it('omits cancelled events from a full listing', async () => {
    g.seedEvent('cal', ev('a'));
    g.cancelEvent('cal', 'a');
    expect((await g.eventsList({ calendarId: 'cal' })).items).toEqual([]);
  });

  it('answers 410 for an expired syncToken until a full listing is done', async () => {
    g.seedEvent('cal', ev('a'));
    const full = await g.eventsList({ calendarId: 'cal' });
    g.expireSyncTokens('cal');
    await expect(
      g.eventsList({ calendarId: 'cal', syncToken: full.nextSyncToken }),
    ).rejects.toMatchObject({ status: 410 });
    const again = await g.eventsList({ calendarId: 'cal' });
    await expect(
      g.eventsList({ calendarId: 'cal', syncToken: again.nextSyncToken }),
    ).resolves.toBeDefined();
  });

  it('injects a failure on the second page only', async () => {
    ['a', 'b', 'c'].forEach((id) => g.seedEvent('cal', ev(id)));
    g.injectFailure('events.list', { status: 500, onCall: 2 });
    const p1 = await g.eventsList({ calendarId: 'cal', maxResults: 1 });
    await expect(
      g.eventsList({ calendarId: 'cal', maxResults: 1, pageToken: p1.nextPageToken }),
    ).rejects.toBeInstanceOf(FakeGoogleApiError);
    // the failure was consumed, a retry succeeds
    await expect(
      g.eventsList({ calendarId: 'cal', maxResults: 1, pageToken: p1.nextPageToken }),
    ).resolves.toBeDefined();
  });

  it('tracks watch channels and stops them', async () => {
    const w = await g.eventsWatch({ calendarId: 'cal', id: 'ch-1', address: 'https://example.test/hook', token: 't' });
    expect(g.activeChannels.get('ch-1')?.resourceId).toBe(w.resourceId);
    await g.channelsStop({ id: 'ch-1', resourceId: w.resourceId });
    expect(g.activeChannels.size).toBe(0);
  });

  it('exchanges an auth code once, refreshes and revokes', async () => {
    g.registerAuthCode('code-1');
    expect((await g.exchangeCode('code-1')).refresh_token).toBe('refresh-code-1');
    await expect(g.exchangeCode('code-1')).rejects.toMatchObject({ status: 400 });
    expect((await g.refreshAccessToken('refresh-code-1')).access_token).toContain('access');
    await g.revokeToken('refresh-code-1');
    await expect(g.refreshAccessToken('refresh-code-1')).rejects.toMatchObject({ status: 400 });
  });

  it('verifies only registered ID tokens', async () => {
    g.registerIdToken('idt', { sub: 'sub-1', email: 'u@example.test', email_verified: true });
    expect((await g.verifyIdToken('idt')).sub).toBe('sub-1');
    await expect(g.verifyIdToken('forged')).rejects.toMatchObject({ status: 401 });
  });

  it('records every call in order', async () => {
    await g.calendarListList();
    await g.eventsList({ calendarId: 'cal' });
    expect(g.calls.map((c) => c.method)).toEqual(['calendarList.list', 'events.list']);
  });
});

describe('FakeGoogleGateway singleEvents window listing', () => {
  const master = (extra: Partial<FakeEvent> = {}): FakeEvent => ({
    id: 'm',
    status: 'confirmed',
    summary: 'Series',
    start: { dateTime: '2026-06-01T10:00:00Z' },
    end: { dateTime: '2026-06-01T11:00:00Z' },
    recurrence: ['RRULE:FREQ=DAILY'],
    ...extra,
  });

  it('expands an endless DAILY master only inside timeMin/timeMax', async () => {
    const g = new FakeGoogleGateway();
    g.seedEvent('cal', master());
    const res = await g.eventsList({
      calendarId: 'cal',
      singleEvents: true,
      timeMin: '2026-06-03T00:00:00Z',
      timeMax: '2026-06-06T00:00:00Z',
    });
    expect(res.items.map((e) => e.id)).toEqual([
      'm_20260603T100000Z',
      'm_20260604T100000Z',
      'm_20260605T100000Z',
    ]);
    expect(res.items[0].recurringEventId).toBe('m');
  });

  it('honours COUNT, exception overrides and cancelled instances; returns the master without singleEvents', async () => {
    const g = new FakeGoogleGateway();
    g.seedEvent('cal', master({ recurrence: ['RRULE:FREQ=DAILY;COUNT=3'] }));
    g.upsertEvent('cal', { id: 'm_20260602T100000Z', status: 'cancelled', recurringEventId: 'm' });
    const ids = (await g.eventsList({ calendarId: 'cal', singleEvents: true })).items.map((e) => e.id);
    expect(ids).toEqual(['m_20260601T100000Z', 'm_20260603T100000Z']);
    const raw = await g.eventsList({ calendarId: 'cal' });
    expect(raw.items.map((e) => e.id)).toEqual(['m']);
  });

  describe('write surface', () => {
    let g: FakeGoogleGateway;
    beforeEach(() => {
      g = new FakeGoogleGateway();
    });
    const body = (id: string, summary = 't') => ({ calendarId: 'cal', event: ev(id, { summary }) });

    it('creates calendars, inserts once and answers 409 for a known id, even a deleted one', async () => {
      const { id } = await g.calendarsInsert({ summary: 'App' });
      expect((await g.calendarListList()).items.map((c) => c.id)).toContain(id);
      await g.eventsInsert({ calendarId: id, event: ev('e1') });
      await expect(g.eventsInsert({ calendarId: id, event: ev('e1') })).rejects.toMatchObject({ status: 409 });
      await g.eventsDelete({ calendarId: id, eventId: 'e1' });
      await expect(g.eventsInsert({ calendarId: id, event: ev('e1') })).rejects.toMatchObject({ status: 409 });
    });

    it('patches, answers 404 for a missing event and restores a deleted one only with status confirmed', async () => {
      await expect(g.eventsPatch({ calendarId: 'cal', eventId: 'x', patch: { summary: 'n' } })).rejects.toMatchObject({ status: 404 });
      await g.eventsInsert(body('e1'));
      expect((await g.eventsPatch({ calendarId: 'cal', eventId: 'e1', patch: { summary: 'n' } })).summary).toBe('n');
      await g.eventsDelete({ calendarId: 'cal', eventId: 'e1' });
      await expect(g.eventsPatch({ calendarId: 'cal', eventId: 'e1', patch: { summary: 'n' } })).rejects.toMatchObject({ status: 404 });
      await g.eventsPatch({ calendarId: 'cal', eventId: 'e1', patch: { status: 'confirmed' } });
      expect(g.storedEvents('cal').map((e) => e.id)).toEqual(['e1']);
    });

    it('answers 404 or 410 when deleting something that is gone', async () => {
      await expect(g.eventsDelete({ calendarId: 'cal', eventId: 'x' })).rejects.toMatchObject({ status: 404 });
      await g.eventsInsert(body('e1'));
      await g.eventsDelete({ calendarId: 'cal', eventId: 'e1' });
      await expect(g.eventsDelete({ calendarId: 'cal', eventId: 'e1' })).rejects.toMatchObject({ status: 410 });
    });

    it('can lose the response after applying a write (afterEffect)', async () => {
      g.injectFailure('events.insert', { status: 503, afterEffect: true });
      await expect(g.eventsInsert(body('e1'))).rejects.toBeInstanceOf(FakeGoogleApiError);
      expect(g.storedEvents('cal').map((e) => e.id)).toEqual(['e1']);
    });

    it('fails before applying a plain injected failure', async () => {
      g.injectFailure('events.insert', { status: 500 });
      await expect(g.eventsInsert(body('e1'))).rejects.toMatchObject({ status: 500 });
      expect(g.storedEvents('cal')).toEqual([]);
    });
  });
});
