import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleCalendarService } from './google-calendar.service';
import { IntegrationAccountService } from './integration-account.service';
import { ExternalLink } from './external-link.entity';
import { Item } from '../item/item.entity';
import { ApiException } from '../common/api.exception';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarSyncService,
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
});
