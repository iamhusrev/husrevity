import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleCalendarService } from './google-calendar.service';
import { IntegrationAccountService } from './integration-account.service';
import { ExternalLink } from './external-link.entity';
import { Item } from '../item/item.entity';
import { ApiException } from '../common/api.exception';
import { GoogleCalendarEngineService } from './google-calendar-engine.service';

describe('GoogleCalendarSyncService', () => {
  let service: GoogleCalendarSyncService;
  let mockGoogleCalendarService: {
    getCalendarClient: jest.Mock;
    ensureHusrevityCalendar: jest.Mock;
    getHusrevityIdFromEvent: jest.Mock;
    formatEventForGoogle: jest.Mock;
  };
  let mockIntegrationAccountService: {
    get: jest.Mock;
    updateSyncToken: jest.Mock;
    findConnectedAccounts: jest.Mock;
  };
  let mockExternalLinkRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
  };
  let mockItemRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
  };
  let mockCalendarApi: any;
  let mockEngine: { ownerUsesV2Engine: jest.Mock; legacyEngineAllowed: jest.Mock };

  const ownerId = 'user-100';

  beforeEach(async () => {
    mockCalendarApi = {
      events: {
        list: jest.fn(),
      },
    };

    mockGoogleCalendarService = {
      getCalendarClient: jest.fn().mockResolvedValue({
        calendar: mockCalendarApi,
        calendarId: 'husrevity-cal-123',
      }),
      ensureHusrevityCalendar: jest.fn().mockResolvedValue('husrevity-cal-123'),
      getHusrevityIdFromEvent: jest.fn(
        (evt: any) => evt.extendedProperties?.private?.husrevityId ?? null,
      ),
      formatEventForGoogle: jest.fn(),
    };

    mockIntegrationAccountService = {
      get: jest.fn().mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          calendarId: 'husrevity-cal-123',
          syncToken: 'initial-sync-token',
        },
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
      }),
      updateSyncToken: jest.fn().mockResolvedValue(undefined),
      findConnectedAccounts: jest.fn().mockResolvedValue([]),
    };

    mockExternalLinkRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ id: 'link-999', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      softRemove: jest.fn().mockResolvedValue(undefined),
    };

    mockItemRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ id: 'item-999', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      softRemove: jest.fn().mockResolvedValue(undefined),
    };

    const ownerUsesV2Engine = jest.fn().mockResolvedValue(false);
    mockEngine = {
      ownerUsesV2Engine,
      // Mirrors the real helper for an owner without a narrowed grant: allowed unless v2 is live.
      legacyEngineAllowed: jest.fn(async (id: string) => !(await ownerUsesV2Engine(id))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarSyncService,
        { provide: GoogleCalendarEngineService, useValue: mockEngine },
        { provide: GoogleCalendarService, useValue: mockGoogleCalendarService },
        { provide: IntegrationAccountService, useValue: mockIntegrationAccountService },
        { provide: getRepositoryToken(ExternalLink), useValue: mockExternalLinkRepo },
        { provide: getRepositoryToken(Item), useValue: mockItemRepo },
      ],
    }).compile();

    service = module.get<GoogleCalendarSyncService>(GoogleCalendarSyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw notFound if integration account is missing or disconnected', async () => {
    mockIntegrationAccountService.get.mockResolvedValueOnce(null);

    await expect(service.syncIncremental(ownerId)).rejects.toThrow(ApiException);
  });

  it('should create new Item and ExternalLink for a new Google Calendar event', async () => {
    mockCalendarApi.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'gcal-evt-1',
            summary: 'Team Sync',
            description: 'Weekly team meeting',
            start: { dateTime: '2026-10-01T10:00:00.000Z' },
            end: { dateTime: '2026-10-01T11:00:00.000Z' },
            etag: '"etag-123"',
            status: 'confirmed',
          },
        ],
        nextSyncToken: 'next-sync-token-456',
      },
    });

    mockExternalLinkRepo.findOne.mockResolvedValue(null);
    mockItemRepo.findOne.mockResolvedValue(null);

    const result = await service.syncIncremental(ownerId);

    expect(result).toEqual({
      syncedCount: 1,
      deletedCount: 0,
      syncToken: 'next-sync-token-456',
    });

    expect(mockItemRepo.create).toHaveBeenCalledWith({
      ownerId,
      kind: 'event',
      title: 'Team Sync',
      notes: 'Weekly team meeting',
      scheduledAt: new Date('2026-10-01T10:00:00.000Z'),
      durationMin: 60,
      status: 'open',
      source: 'gcal',
      payload: {},
    });

    expect(mockExternalLinkRepo.create).toHaveBeenCalledWith({
      itemId: 'item-999',
      provider: 'google_calendar',
      externalId: 'gcal-evt-1',
      etag: '"etag-123"',
      lastSyncedAt: expect.any(Date),
    });

    expect(mockIntegrationAccountService.updateSyncToken).toHaveBeenCalledWith(
      ownerId,
      'google_calendar',
      'next-sync-token-456',
    );
  });

  it('should update existing Item and ExternalLink when event was previously synced', async () => {
    mockCalendarApi.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'gcal-evt-1',
            summary: 'Updated Title',
            description: 'Updated description',
            start: { dateTime: '2026-10-01T14:00:00.000Z' },
            end: { dateTime: '2026-10-01T15:30:00.000Z' },
            etag: '"etag-999"',
            status: 'confirmed',
          },
        ],
        nextSyncToken: 'next-sync-token-789',
      },
    });

    const existingLink = {
      id: 'link-1',
      itemId: 'item-1',
      provider: 'google_calendar',
      externalId: 'gcal-evt-1',
      etag: '"etag-123"',
      lastSyncedAt: new Date('2026-09-01'),
    };

    const existingItem = {
      id: 'item-1',
      ownerId,
      kind: 'event',
      title: 'Old Title',
      notes: 'Old description',
      scheduledAt: new Date('2026-10-01T10:00:00.000Z'),
      durationMin: 60,
      source: 'gcal',
    };

    mockExternalLinkRepo.findOne.mockResolvedValueOnce(existingLink);
    mockItemRepo.findOne.mockResolvedValueOnce(existingItem);

    const result = await service.syncIncremental(ownerId);

    expect(result.syncedCount).toBe(1);
    expect(existingItem.title).toBe('Updated Title');
    expect(existingItem.notes).toBe('Updated description');
    expect(existingItem.scheduledAt).toEqual(new Date('2026-10-01T14:00:00.000Z'));
    expect(existingItem.durationMin).toBe(90);
    expect(existingLink.etag).toBe('"etag-999"');
    expect(mockItemRepo.save).toHaveBeenCalledWith(existingItem);
    expect(mockExternalLinkRepo.save).toHaveBeenCalledWith(existingLink);
  });

  it('should match existing Item by husrevityId in extendedProperties if ExternalLink is missing', async () => {
    mockCalendarApi.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'gcal-evt-2',
            summary: 'Locally Created Event',
            start: { dateTime: '2026-10-02T10:00:00.000Z' },
            end: { dateTime: '2026-10-02T11:00:00.000Z' },
            extendedProperties: {
              private: {
                husrevityId: 'item-local-123',
              },
            },
            status: 'confirmed',
          },
        ],
        nextSyncToken: 'next-sync-token-111',
      },
    });

    mockExternalLinkRepo.findOne.mockResolvedValueOnce(null);

    const existingLocalItem = {
      id: 'item-local-123',
      ownerId,
      kind: 'event',
      title: 'Locally Created Event',
      source: 'web',
    };

    mockItemRepo.findOne.mockResolvedValueOnce(existingLocalItem);

    const result = await service.syncIncremental(ownerId);

    expect(result.syncedCount).toBe(1);
    expect(existingLocalItem.source).toBe('web');
    expect(mockItemRepo.save).toHaveBeenCalledWith(existingLocalItem);
    expect(mockExternalLinkRepo.create).toHaveBeenCalledWith({
      itemId: 'item-local-123',
      provider: 'google_calendar',
      externalId: 'gcal-evt-2',
      etag: null,
      lastSyncedAt: expect.any(Date),
    });
  });

  it('should softRemove Item and ExternalLink when event status is cancelled', async () => {
    mockCalendarApi.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'gcal-evt-1',
            status: 'cancelled',
          },
        ],
        nextSyncToken: 'next-sync-token-cancelled',
      },
    });

    const existingLink = {
      id: 'link-1',
      itemId: 'item-1',
      provider: 'google_calendar',
      externalId: 'gcal-evt-1',
    };

    const existingItem = {
      id: 'item-1',
      ownerId,
      kind: 'event',
    };

    mockExternalLinkRepo.findOne.mockResolvedValueOnce(existingLink);
    mockItemRepo.findOne.mockResolvedValueOnce(existingItem);

    const result = await service.syncIncremental(ownerId);

    expect(result.deletedCount).toBe(1);
    expect(mockItemRepo.softRemove).toHaveBeenCalledWith(existingItem);
    expect(mockExternalLinkRepo.softRemove).toHaveBeenCalledWith(existingLink);
  });

  it('should handle pagination with nextPageToken', async () => {
    mockCalendarApi.events.list
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'gcal-evt-p1',
              summary: 'Page 1 Event',
              status: 'confirmed',
            },
          ],
          nextPageToken: 'page-2-token',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'gcal-evt-p2',
              summary: 'Page 2 Event',
              status: 'confirmed',
            },
          ],
          nextSyncToken: 'final-sync-token',
        },
      });

    mockExternalLinkRepo.findOne.mockResolvedValue(null);
    mockItemRepo.findOne.mockResolvedValue(null);

    const result = await service.syncIncremental(ownerId);

    expect(result.syncedCount).toBe(2);
    expect(mockCalendarApi.events.list).toHaveBeenCalledTimes(2);
    expect(mockCalendarApi.events.list).toHaveBeenNthCalledWith(1, {
      calendarId: 'husrevity-cal-123',
      syncToken: 'initial-sync-token',
      pageToken: undefined,
      maxResults: 250,
    });
    expect(mockCalendarApi.events.list).toHaveBeenNthCalledWith(2, {
      calendarId: 'husrevity-cal-123',
      syncToken: 'initial-sync-token',
      pageToken: 'page-2-token',
      maxResults: 250,
    });
    expect(result.syncToken).toBe('final-sync-token');
  });

  it('should fallback to full resync when Google returns 410 Gone for expired syncToken', async () => {
    // 1st call fails with 410 Gone
    mockCalendarApi.events.list.mockRejectedValueOnce({
      code: 410,
      message: 'Sync token is no longer valid',
    });

    // 2nd call (full sync retry without syncToken) succeeds
    mockCalendarApi.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'gcal-evt-resync-1',
            summary: 'Resynced Event',
            status: 'confirmed',
          },
        ],
        nextSyncToken: 'fresh-sync-token-999',
      },
    });

    mockExternalLinkRepo.findOne.mockResolvedValue(null);
    mockItemRepo.findOne.mockResolvedValue(null);

    const result = await service.syncIncremental(ownerId);

    expect(result).toEqual({
      syncedCount: 1,
      deletedCount: 0,
      syncToken: 'fresh-sync-token-999',
    });

    expect(mockIntegrationAccountService.updateSyncToken).toHaveBeenCalledWith(
      ownerId,
      'google_calendar',
      null,
    );

    expect(mockIntegrationAccountService.updateSyncToken).toHaveBeenCalledWith(
      ownerId,
      'google_calendar',
      'fresh-sync-token-999',
    );

    expect(mockCalendarApi.events.list).toHaveBeenCalledTimes(2);
    expect(mockCalendarApi.events.list).toHaveBeenNthCalledWith(1, {
      calendarId: 'husrevity-cal-123',
      syncToken: 'initial-sync-token',
      pageToken: undefined,
      maxResults: 250,
    });
    expect(mockCalendarApi.events.list).toHaveBeenNthCalledWith(2, {
      calendarId: 'husrevity-cal-123',
      pageToken: undefined,
      maxResults: 250,
    });
  });

  it('should rethrow non-410 errors without retrying full resync', async () => {
    mockCalendarApi.events.list.mockRejectedValueOnce({
      code: 500,
      message: 'Internal Server Error',
    });

    await expect(service.syncIncremental(ownerId)).rejects.toEqual({
      code: 500,
      message: 'Internal Server Error',
    });

    expect(mockCalendarApi.events.list).toHaveBeenCalledTimes(1);
    expect(mockIntegrationAccountService.updateSyncToken).not.toHaveBeenCalledWith(
      ownerId,
      'google_calendar',
      null,
    );
  });

  describe('sync_lookups_are_owner_scoped', () => {
    const linkFilter = (call: any[]) => call[0].where.itemId;

    it('scopes the external_link lookup of an upsert to links whose item belongs to the owner', async () => {
      mockCalendarApi.events.list.mockResolvedValueOnce({
        data: {
          items: [{ id: 'shared-evt', summary: 'Shared', status: 'confirmed', start: { dateTime: '2026-10-01T10:00:00.000Z' } }],
          nextSyncToken: 't',
        },
      });
      mockExternalLinkRepo.findOne.mockResolvedValue(null);
      mockItemRepo.findOne.mockResolvedValue(null);

      await service.syncIncremental(ownerId);

      const filter = linkFilter(mockExternalLinkRepo.findOne.mock.calls[0]);
      expect(filter).toBeDefined();
      expect(filter.objectLiteralParameters).toEqual({ linkOwnerId: ownerId });
      expect(filter.getSql('l.item_id')).toContain('owner_id = :linkOwnerId');
    });

    it('scopes the external_link lookup of a cancellation to the owner and never removes foreign rows', async () => {
      mockCalendarApi.events.list.mockResolvedValueOnce({
        data: { items: [{ id: 'shared-evt', status: 'cancelled' }], nextSyncToken: 't' },
      });
      mockExternalLinkRepo.findOne.mockResolvedValue(null);

      const result = await service.syncIncremental(ownerId);

      expect(linkFilter(mockExternalLinkRepo.findOne.mock.calls[0]).objectLiteralParameters).toEqual({
        linkOwnerId: ownerId,
      });
      expect(mockItemRepo.softRemove).not.toHaveBeenCalled();
      expect(mockExternalLinkRepo.softRemove).not.toHaveBeenCalled();
      expect(result.deletedCount).toBe(0);
    });

    it('filters the linked item lookup by owner on update and on cancellation', async () => {
      mockCalendarApi.events.list.mockResolvedValueOnce({
        data: {
          items: [
            { id: 'evt-a', summary: 'A', status: 'confirmed', start: { dateTime: '2026-10-01T10:00:00.000Z' } },
            { id: 'evt-b', status: 'cancelled' },
          ],
          nextSyncToken: 't',
        },
      });
      mockExternalLinkRepo.findOne.mockImplementation(async () => ({
        id: 'l',
        itemId: 'item-1',
        externalId: 'x',
      }));
      mockItemRepo.findOne.mockResolvedValue(null);

      await service.syncIncremental(ownerId);

      const itemLookups = mockItemRepo.findOne.mock.calls.map((c) => c[0].where);
      expect(itemLookups.length).toBeGreaterThanOrEqual(2);
      for (const where of itemLookups) expect(where).toMatchObject({ id: 'item-1', ownerId });
    });

    it('filters the husrevityId item lookup by owner', async () => {
      mockCalendarApi.events.list.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'evt-h',
              summary: 'H',
              status: 'confirmed',
              start: { dateTime: '2026-10-01T10:00:00.000Z' },
              extendedProperties: { private: { husrevityId: 'foreign-item' } },
            },
          ],
          nextSyncToken: 't',
        },
      });
      mockExternalLinkRepo.findOne.mockResolvedValue(null);
      mockItemRepo.findOne.mockResolvedValue(null);

      await service.syncIncremental(ownerId);

      expect(mockItemRepo.findOne.mock.calls[0][0].where).toEqual({ id: 'foreign-item', ownerId });
    });
  });

  describe('title truncation', () => {
    it('truncates a Google summary longer than the 255 character items.title column', async () => {
      mockCalendarApi.events.list.mockResolvedValueOnce({
        data: {
          items: [{ id: 'long', summary: 'x'.repeat(600), status: 'confirmed', start: { dateTime: '2026-10-01T10:00:00.000Z' } }],
          nextSyncToken: 't',
        },
      });
      mockExternalLinkRepo.findOne.mockResolvedValue(null);
      mockItemRepo.findOne.mockResolvedValue(null);

      await service.syncIncremental(ownerId);

      const created = mockItemRepo.create.mock.calls[0][0];
      expect(created.title).toHaveLength(255);
    });
  });

  describe('token logging', () => {
    it('never writes sync tokens or credentials found in error text to the logs', async () => {
      const logged: string[] = [];
      const capture = (m: unknown) => logged.push(String(m));
      jest.spyOn((service as any).logger, 'log').mockImplementation(capture);
      jest.spyOn((service as any).logger, 'warn').mockImplementation(capture);
      jest.spyOn((service as any).logger, 'error').mockImplementation(capture);

      mockCalendarApi.events.list.mockResolvedValueOnce({
        data: { items: [], nextSyncToken: 'super-secret-next-sync-token' },
      });
      await service.syncIncremental(ownerId);

      mockIntegrationAccountService.findConnectedAccounts.mockResolvedValueOnce([{ ownerId }]);
      mockCalendarApi.events.list.mockRejectedValueOnce(
        new Error('request failed: Authorization: Bearer ya29.leaked-access-token-value'),
      );
      await service.syncAllConnectedAccounts();

      const output = logged.join('\n');
      expect(output).not.toContain('super-secret-next-sync-token');
      expect(output).not.toContain('ya29.leaked-access-token-value');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('syncAllConnectedAccounts', () => {
    it('syncs all connected accounts and returns accurate metrics', async () => {
      mockIntegrationAccountService.findConnectedAccounts.mockResolvedValueOnce([
        { id: 'acc-1', ownerId: 'user-1' },
        { id: 'acc-2', ownerId: 'user-2' },
      ]);

      const syncSpy = jest.spyOn(service, 'syncIncremental').mockResolvedValue({
        syncedCount: 2,
        deletedCount: 0,
        syncToken: 'token-abc',
      });

      const res = await service.syncAllConnectedAccounts();

      expect(res).toEqual({
        total: 2,
        successful: 2,
        failed: 0,
      });
      expect(syncSpy).toHaveBeenCalledWith('user-1');
      expect(syncSpy).toHaveBeenCalledWith('user-2');
    });

    it('continues syncing other accounts when one account fails and counts failures', async () => {
      mockIntegrationAccountService.findConnectedAccounts.mockResolvedValueOnce([
        { id: 'acc-1', ownerId: 'user-1' },
        { id: 'acc-2', ownerId: 'user-2' },
      ]);

      const syncSpy = jest
        .spyOn(service, 'syncIncremental')
        .mockRejectedValueOnce(new Error('Auth failed'))
        .mockResolvedValueOnce({
          syncedCount: 1,
          deletedCount: 0,
          syncToken: 'token-def',
        });

      const res = await service.syncAllConnectedAccounts();

      expect(res).toEqual({
        total: 2,
        successful: 1,
        failed: 1,
      });
      expect(syncSpy).toHaveBeenCalledTimes(2);
    });
  });
  describe('legacy pull stops for owners on the v2 engine', () => {
    it('syncAllConnectedAccounts skips an owner that has a v2 connection and still syncs the others', async () => {
      mockIntegrationAccountService.findConnectedAccounts.mockResolvedValueOnce([
        { id: 'acc-1', ownerId: 'user-v2' },
        { id: 'acc-2', ownerId: 'user-legacy' },
      ]);
      mockEngine.ownerUsesV2Engine.mockImplementation(async (id: string) => id === 'user-v2');
      const syncSpy = jest.spyOn(service, 'syncIncremental').mockResolvedValue({
        syncedCount: 0,
        deletedCount: 0,
        syncToken: null,
      });

      const res = await service.syncAllConnectedAccounts();

      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(syncSpy).toHaveBeenCalledWith('user-legacy');
      expect(res).toEqual({ total: 1, successful: 1, failed: 0 });
    });

    it('syncIncremental (webhook path) does nothing for a v2 owner: no Google call, no row write', async () => {
      mockEngine.ownerUsesV2Engine.mockResolvedValue(true);

      const res = await service.syncIncremental(ownerId);

      expect(res).toEqual({ syncedCount: 0, deletedCount: 0, syncToken: null });
      expect(mockGoogleCalendarService.getCalendarClient).not.toHaveBeenCalled();
      expect(mockCalendarApi.events.list).not.toHaveBeenCalled();
      expect(mockItemRepo.save).not.toHaveBeenCalled();
      expect(mockIntegrationAccountService.updateSyncToken).not.toHaveBeenCalled();
    });

    it('rollback: an owner the engine helper does not allow (narrowed grant, flag off) is neither pulled by the job nor by a webhook', async () => {
      mockIntegrationAccountService.findConnectedAccounts.mockResolvedValueOnce([
        { id: 'acc-1', ownerId: 'user-narrow' },
        { id: 'acc-2', ownerId: 'user-broad' },
      ]);
      mockEngine.legacyEngineAllowed.mockImplementation(async (id: string) => id !== 'user-narrow');
      const syncSpy = jest.spyOn(service, 'syncIncremental').mockResolvedValue({
        syncedCount: 0,
        deletedCount: 0,
        syncToken: null,
      });

      const res = await service.syncAllConnectedAccounts();
      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(syncSpy).toHaveBeenCalledWith('user-broad');
      expect(res).toEqual({ total: 1, successful: 1, failed: 0 });
      syncSpy.mockRestore();

      const direct = await service.syncIncremental('user-narrow');
      expect(direct).toEqual({ syncedCount: 0, deletedCount: 0, syncToken: null });
      expect(mockGoogleCalendarService.getCalendarClient).not.toHaveBeenCalled();
      expect(mockCalendarApi.events.list).not.toHaveBeenCalled();
      expect(mockIntegrationAccountService.updateSyncToken).not.toHaveBeenCalled();
    });
  });

  describe('local edits and local deletes survive the pull', () => {
    const evt = (extra: Record<string, unknown> = {}) => ({
      id: 'gcal-evt-9',
      summary: 'From Google',
      status: 'confirmed',
      updated: '2026-10-01T00:00:00.000Z',
      start: { dateTime: '2026-10-01T10:00:00.000Z' },
      end: { dateTime: '2026-10-01T11:00:00.000Z' },
      etag: '"etag-g"',
      ...extra,
    });
    const link = () => ({ id: 'link-9', itemId: 'item-9', provider: 'google_calendar', externalId: 'gcal-evt-9', etag: '"old"' });
    const noToken = () =>
      mockIntegrationAccountService.get.mockResolvedValue({
        account: { id: 'acc-1', ownerId, provider: 'google_calendar', calendarId: 'husrevity-cal-123', syncToken: null },
        accessToken: 'a',
        refreshToken: 'r',
      });

    it('a full pull keeps a non-gcal item whose local edit is newer than the Google event, and still refreshes the link', async () => {
      noToken();
      mockCalendarApi.events.list.mockResolvedValueOnce({ data: { items: [evt()], nextSyncToken: 't' } });
      const l = link();
      const item = { id: 'item-9', ownerId, source: 'web', title: 'Local edit', updatedAt: new Date('2026-11-01T00:00:00.000Z') };
      mockExternalLinkRepo.findOne.mockResolvedValueOnce(l);
      mockItemRepo.findOne.mockResolvedValueOnce(item);

      await service.syncIncremental(ownerId);

      expect(item.title).toBe('Local edit');
      expect(mockItemRepo.save).not.toHaveBeenCalled();
      expect(l.etag).toBe('"etag-g"');
      expect(mockExternalLinkRepo.save).toHaveBeenCalledWith(l);
    });

    it('a full pull still lets a NEWER Google event update an older non-gcal item', async () => {
      noToken();
      mockCalendarApi.events.list.mockResolvedValueOnce({ data: { items: [evt()], nextSyncToken: 't' } });
      const item = { id: 'item-9', ownerId, source: 'web', title: 'Old', updatedAt: new Date('2026-09-01T00:00:00.000Z') };
      mockExternalLinkRepo.findOne.mockResolvedValueOnce(link());
      mockItemRepo.findOne.mockResolvedValueOnce(item);

      await service.syncIncremental(ownerId);

      expect(item.title).toBe('From Google');
      expect(mockItemRepo.save).toHaveBeenCalledWith(item);
    });

    it('the pull after a 410 is a full pull and keeps the newer local edit too', async () => {
      mockCalendarApi.events.list.mockRejectedValueOnce({ code: 410 });
      mockCalendarApi.events.list.mockResolvedValueOnce({ data: { items: [evt()], nextSyncToken: 't' } });
      const item = { id: 'item-9', ownerId, source: 'web', title: 'Local edit', updatedAt: new Date('2026-11-01T00:00:00.000Z') };
      mockExternalLinkRepo.findOne.mockResolvedValueOnce(link());
      mockItemRepo.findOne.mockResolvedValueOnce(item);

      await service.syncIncremental(ownerId);

      expect(item.title).toBe('Local edit');
      expect(mockItemRepo.save).not.toHaveBeenCalled();
    });

    it('an incremental pull keeps the existing behaviour (Google event applied)', async () => {
      mockCalendarApi.events.list.mockResolvedValueOnce({ data: { items: [evt()], nextSyncToken: 't' } });
      const item = { id: 'item-9', ownerId, source: 'web', title: 'Local edit', updatedAt: new Date('2026-11-01T00:00:00.000Z') };
      mockExternalLinkRepo.findOne.mockResolvedValueOnce(link());
      mockItemRepo.findOne.mockResolvedValueOnce(item);

      await service.syncIncremental(ownerId);

      expect(item.title).toBe('From Google');
    });

    it.each([['full', true], ['incremental', false]])(
      'a %s pull never recreates or updates an item soft-deleted behind its link',
      async (_mode, full) => {
        if (full) noToken();
        mockCalendarApi.events.list.mockResolvedValueOnce({ data: { items: [evt()], nextSyncToken: 't' } });
        const gone = { id: 'item-9', ownerId, source: 'gcal', title: 'Deleted', deletedAt: new Date('2026-10-02') };
        mockExternalLinkRepo.findOne.mockResolvedValueOnce(link());
        mockItemRepo.findOne.mockResolvedValueOnce(gone);

        const res = await service.syncIncremental(ownerId);

        expect(mockItemRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
        expect(mockItemRepo.create).not.toHaveBeenCalled();
        expect(mockItemRepo.save).not.toHaveBeenCalled();
        expect(mockExternalLinkRepo.create).not.toHaveBeenCalled();
        expect(res.syncedCount).toBe(0);
      },
    );

    it('does not create a copy for a Google event whose husrevityId item is soft-deleted', async () => {
      mockGoogleCalendarService.getHusrevityIdFromEvent.mockReturnValue('item-9');
      mockCalendarApi.events.list.mockResolvedValueOnce({ data: { items: [evt()], nextSyncToken: 't' } });
      mockExternalLinkRepo.findOne.mockResolvedValueOnce(null);
      mockItemRepo.findOne.mockResolvedValueOnce({ id: 'item-9', ownerId, source: 'web', deletedAt: new Date() });

      await service.syncIncremental(ownerId);

      expect(mockItemRepo.create).not.toHaveBeenCalled();
      expect(mockItemRepo.save).not.toHaveBeenCalled();
      expect(mockExternalLinkRepo.create).not.toHaveBeenCalled();
    });
  });
});
