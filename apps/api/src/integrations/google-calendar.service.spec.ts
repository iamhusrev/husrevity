import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { google } from 'googleapis';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { ExternalLink } from './external-link.entity';
import { ApiException } from '../common/api.exception';

jest.mock('googleapis', () => {
  const original = jest.requireActual('googleapis');
  return {
    ...original,
    google: {
      ...original.google,
      calendar: jest.fn(),
    },
  };
});

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let mockGoogleCalendarConfig: {
    isConfigured: jest.Mock;
    createOAuth2Client: jest.Mock;
    webhookUrl?: string;
  };
  let mockIntegrationAccountService: {
    get: jest.Mock;
    updateCalendarId: jest.Mock;
    updateWatchChannel: jest.Mock;
  };
  let mockGoogleCalendarSyncService: {
    syncIncremental: jest.Mock;
  };
  let mockExternalLinkRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockOAuth2Client: any;
  let mockCalendarApi: any;

  const ownerId = 'user-123';

  beforeEach(async () => {
    mockOAuth2Client = {
      setCredentials: jest.fn(),
    };

    mockCalendarApi = {
      calendars: {
        insert: jest.fn(),
      },
      channels: {
        stop: jest.fn(),
      },
      events: {
        get: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        watch: jest.fn(),
      },
    };

    (google.calendar as jest.Mock).mockReturnValue(mockCalendarApi);

    mockGoogleCalendarConfig = {
      isConfigured: jest.fn().mockReturnValue(true),
      createOAuth2Client: jest.fn().mockReturnValue(mockOAuth2Client),
      webhookUrl: 'https://api.example.com/hooks/gcal',
    };

    mockIntegrationAccountService = {
      get: jest.fn().mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          status: 'connected',
          calendarId: null,
          channelId: null,
          resourceId: null,
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      }),
      updateCalendarId: jest.fn().mockResolvedValue(undefined),
      updateWatchChannel: jest.fn().mockResolvedValue(undefined),
    };

    mockGoogleCalendarSyncService = {
      syncIncremental: jest
        .fn()
        .mockResolvedValue({ syncedCount: 1, deletedCount: 0, syncToken: 'st' }),
    };

    mockExternalLinkRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarService,
        { provide: GoogleCalendarConfig, useValue: mockGoogleCalendarConfig },
        { provide: IntegrationAccountService, useValue: mockIntegrationAccountService },
        { provide: GoogleCalendarSyncService, useValue: mockGoogleCalendarSyncService },
        { provide: getRepositoryToken(ExternalLink), useValue: mockExternalLinkRepo },
      ],
    }).compile();

    service = module.get<GoogleCalendarService>(GoogleCalendarService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCalendarClient', () => {
    it('should throw badRequest if GoogleCalendarConfig is not configured', async () => {
      mockGoogleCalendarConfig.isConfigured.mockReturnValue(false);

      await expect(service.getCalendarClient(ownerId)).rejects.toThrow(ApiException);
    });

    it('should throw notFound if integration account is missing or disconnected', async () => {
      mockIntegrationAccountService.get.mockResolvedValueOnce(null);

      await expect(service.getCalendarClient(ownerId)).rejects.toThrow(ApiException);
    });

    it('should return authenticated calendar instance and calendarId', async () => {
      const result = await service.getCalendarClient(ownerId);

      expect(mockGoogleCalendarConfig.createOAuth2Client).toHaveBeenCalled();
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
      });
      expect(google.calendar).toHaveBeenCalledWith({ version: 'v3', auth: mockOAuth2Client });
      expect(result.calendar).toBe(mockCalendarApi);
      expect(result.calendarId).toBeNull();
    });
  });

  describe('ensureHusrevityCalendar', () => {
    it('should return existing calendarId without calling insert if already set', async () => {
      mockIntegrationAccountService.get.mockResolvedValueOnce({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          calendarId: 'existing-cal-id-999',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      const calendarId = await service.ensureHusrevityCalendar(ownerId);

      expect(calendarId).toBe('existing-cal-id-999');
      expect(mockCalendarApi.calendars.insert).not.toHaveBeenCalled();
    });

    it('should create Husrevity secondary calendar, update calendarId, and return new ID if not set', async () => {
      mockCalendarApi.calendars.insert.mockResolvedValueOnce({
        data: { id: 'new-gcal-id-456' },
      });

      const calendarId = await service.ensureHusrevityCalendar(ownerId);

      expect(mockCalendarApi.calendars.insert).toHaveBeenCalledWith({
        requestBody: {
          summary: 'Husrevity',
          description: 'Husrevity synchronized calendar',
          timeZone: 'Europe/Istanbul',
        },
      });
      expect(mockIntegrationAccountService.updateCalendarId).toHaveBeenCalledWith(
        ownerId,
        'google_calendar',
        'new-gcal-id-456',
      );
      expect(calendarId).toBe('new-gcal-id-456');
    });

    it('should throw badRequest if Google API insert fails or returns no ID', async () => {
      mockCalendarApi.calendars.insert.mockRejectedValueOnce(
        new Error('Google API quota exceeded'),
      );

      await expect(service.ensureHusrevityCalendar(ownerId)).rejects.toThrow(
        'Failed to create Husrevity calendar: Google API quota exceeded',
      );
    });
  });

  describe('formatEventForGoogle', () => {
    it('should format item into Google Calendar event payload with extendedProperties.private.husrevityId', () => {
      const item = {
        id: 'item-abc-123',
        title: 'Strategy Meeting',
        notes: 'Discuss Q4 roadmap',
        scheduledAt: new Date('2026-10-15T09:00:00.000Z'),
        durationMin: 45,
      };

      const result = service.formatEventForGoogle(item);

      expect(result).toEqual({
        summary: 'Strategy Meeting',
        description: 'Discuss Q4 roadmap',
        start: { dateTime: '2026-10-15T09:00:00.000Z' },
        end: { dateTime: '2026-10-15T09:45:00.000Z' },
        extendedProperties: {
          private: {
            husrevityId: 'item-abc-123',
          },
        },
      });
    });

    it('should default duration to 30 mins if durationMin is omitted', () => {
      const item = {
        id: 'item-def-456',
        title: 'Quick Catchup',
        scheduledAt: new Date('2026-10-15T10:00:00.000Z'),
      };

      const result = service.formatEventForGoogle(item);

      expect(result.start?.dateTime).toBe('2026-10-15T10:00:00.000Z');
      expect(result.end?.dateTime).toBe('2026-10-15T10:30:00.000Z');
      expect(result.extendedProperties?.private?.husrevityId).toBe('item-def-456');
    });
  });

  describe('getHusrevityIdFromEvent', () => {
    it('should extract husrevityId from event private extendedProperties', () => {
      const gcalEvent = {
        id: 'gcal-evt-1',
        extendedProperties: {
          private: {
            husrevityId: 'item-xyz-789',
          },
        },
      };

      expect(service.getHusrevityIdFromEvent(gcalEvent)).toBe('item-xyz-789');
    });

    it('should return null if extendedProperties or husrevityId is missing', () => {
      expect(service.getHusrevityIdFromEvent({ id: 'gcal-evt-2' })).toBeNull();
      expect(
        service.getHusrevityIdFromEvent({ id: 'gcal-evt-3', extendedProperties: {} }),
      ).toBeNull();
    });
  });

  describe('syncItemToGoogleCalendar', () => {
    it('should return null if item kind is not event or source is gcal', async () => {
      const taskItem = { id: '1', ownerId, kind: 'task', title: 'Buy milk' };
      const gcalItem = { id: '2', ownerId, kind: 'event', source: 'gcal', title: 'Synced event' };

      expect(await service.syncItemToGoogleCalendar(taskItem)).toBeNull();
      expect(await service.syncItemToGoogleCalendar(gcalItem)).toBeNull();
      expect(mockExternalLinkRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return null if GoogleCalendarConfig is not configured', async () => {
      mockGoogleCalendarConfig.isConfigured.mockReturnValueOnce(false);
      const eventItem = { id: '1', ownerId, kind: 'event', source: 'web', title: 'Meeting' };

      expect(await service.syncItemToGoogleCalendar(eventItem)).toBeNull();
    });

    it('should return null if user integration account is disconnected or missing', async () => {
      mockIntegrationAccountService.get.mockResolvedValueOnce(null);
      const eventItem = { id: '1', ownerId, kind: 'event', source: 'web', title: 'Meeting' };

      expect(await service.syncItemToGoogleCalendar(eventItem)).toBeNull();
    });

    it('should insert event into Google Calendar and create external_link when no external_link exists', async () => {
      mockCalendarApi.calendars.insert.mockResolvedValueOnce({ data: { id: 'husrevity-cal-123' } });
      mockCalendarApi.events.insert.mockResolvedValueOnce({
        data: { id: 'new-gcal-event-999', etag: '"etag-111"' },
      });
      mockExternalLinkRepo.findOne.mockResolvedValueOnce(null);

      const eventItem = {
        id: 'item-100',
        ownerId,
        kind: 'event',
        source: 'web',
        title: 'Team Sync',
        notes: 'Discussion',
        scheduledAt: new Date('2026-10-20T10:00:00Z'),
        durationMin: 60,
      };

      const link = await service.syncItemToGoogleCalendar(eventItem);

      expect(mockCalendarApi.events.insert).toHaveBeenCalledWith({
        calendarId: 'husrevity-cal-123',
        requestBody: expect.objectContaining({
          summary: 'Team Sync',
          description: 'Discussion',
          extendedProperties: { private: { husrevityId: 'item-100' } },
        }),
      });
      expect(mockExternalLinkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-100',
          provider: 'google_calendar',
          externalId: 'new-gcal-event-999',
          etag: '"etag-111"',
        }),
      );
      expect(link).toEqual(
        expect.objectContaining({
          itemId: 'item-100',
          externalId: 'new-gcal-event-999',
          etag: '"etag-111"',
        }),
      );
    });

    it('should update event on Google Calendar and update external_link when external_link exists and etags match', async () => {
      mockIntegrationAccountService.get.mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          status: 'connected',
          calendarId: 'existing-cal-id-555',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
      mockExternalLinkRepo.findOne.mockResolvedValueOnce({
        itemId: 'item-100',
        provider: 'google_calendar',
        externalId: 'gcal-event-999',
        etag: '"old-etag"',
      });
      mockCalendarApi.events.get.mockResolvedValueOnce({
        data: { id: 'gcal-event-999', etag: '"old-etag"', updated: '2026-09-28T09:00:00Z' },
      });
      mockCalendarApi.events.update.mockResolvedValueOnce({
        data: { id: 'gcal-event-999', etag: '"new-etag"' },
      });

      const eventItem = {
        id: 'item-100',
        ownerId,
        kind: 'event',
        source: 'web',
        title: 'Updated Team Sync',
      };

      const link = await service.syncItemToGoogleCalendar(eventItem);

      expect(mockCalendarApi.events.get).toHaveBeenCalledWith({
        calendarId: 'existing-cal-id-555',
        eventId: 'gcal-event-999',
      });
      expect(mockCalendarApi.events.update).toHaveBeenCalledWith({
        calendarId: 'existing-cal-id-555',
        eventId: 'gcal-event-999',
        requestBody: expect.objectContaining({
          summary: 'Updated Team Sync',
        }),
      });
      expect(link).toEqual(
        expect.objectContaining({
          itemId: 'item-100',
          externalId: 'gcal-event-999',
          etag: '"new-etag"',
        }),
      );
    });

    it('should skip local write and trigger pull sync when Google event is newer (conflict resolution)', async () => {
      mockIntegrationAccountService.get.mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          status: 'connected',
          calendarId: 'existing-cal-id-555',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      const existingLink = {
        itemId: 'item-100',
        provider: 'google_calendar',
        externalId: 'gcal-event-999',
        etag: '"old-etag"',
      };
      mockExternalLinkRepo.findOne.mockResolvedValueOnce(existingLink);

      // Google event updated at 12:00:00Z with a new etag
      mockCalendarApi.events.get.mockResolvedValueOnce({
        data: {
          id: 'gcal-event-999',
          etag: '"newer-google-etag"',
          updated: '2026-09-28T12:00:00.000Z',
        },
      });

      // Local item updated at 10:00:00Z (older than Google event)
      const eventItem = {
        id: 'item-100',
        ownerId,
        kind: 'event',
        source: 'web',
        title: 'Conflicting Stale Local Update',
        updatedAt: new Date('2026-09-28T10:00:00.000Z'),
      };

      const resultLink = await service.syncItemToGoogleCalendar(eventItem);

      // Local write should be skipped
      expect(mockCalendarApi.events.update).not.toHaveBeenCalled();
      // Incremental sync should be triggered to pull newer Google changes
      expect(mockGoogleCalendarSyncService.syncIncremental).toHaveBeenCalledWith(ownerId);
      expect(resultLink).toBe(existingLink);
    });

    it('should proceed with local write when local item is newer than conflicting Google event', async () => {
      mockIntegrationAccountService.get.mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          status: 'connected',
          calendarId: 'existing-cal-id-555',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      mockExternalLinkRepo.findOne.mockResolvedValueOnce({
        itemId: 'item-100',
        provider: 'google_calendar',
        externalId: 'gcal-event-999',
        etag: '"old-etag"',
      });

      // Google event updated at 08:00:00Z with a new etag
      mockCalendarApi.events.get.mockResolvedValueOnce({
        data: {
          id: 'gcal-event-999',
          etag: '"intermediate-google-etag"',
          updated: '2026-09-28T08:00:00.000Z',
        },
      });

      mockCalendarApi.events.update.mockResolvedValueOnce({
        data: { id: 'gcal-event-999', etag: '"overwritten-etag"' },
      });

      // Local item updated at 14:00:00Z (newer than Google event)
      const eventItem = {
        id: 'item-100',
        ownerId,
        kind: 'event',
        source: 'web',
        title: 'Newer Local Update Wins',
        updatedAt: new Date('2026-09-28T14:00:00.000Z'),
      };

      const link = await service.syncItemToGoogleCalendar(eventItem);

      expect(mockCalendarApi.events.update).toHaveBeenCalled();
      expect(mockGoogleCalendarSyncService.syncIncremental).not.toHaveBeenCalled();
      expect(link?.etag).toBe('"overwritten-etag"');
    });
  });

  describe('registerWatchChannel', () => {
    it('skips registration (no events.watch call) when GOOGLE_CALENDAR_WEBHOOK_URL is unset', async () => {
      mockGoogleCalendarConfig.webhookUrl = undefined;

      expect(await service.registerWatchChannel(ownerId)).toBeNull();
      expect(mockCalendarApi.events.watch).not.toHaveBeenCalled();
    });

    it('returns null if config is not configured or user account missing', async () => {
      mockGoogleCalendarConfig.isConfigured.mockReturnValueOnce(false);
      expect(await service.registerWatchChannel(ownerId)).toBeNull();

      mockIntegrationAccountService.get.mockResolvedValueOnce(null);
      expect(await service.registerWatchChannel(ownerId)).toBeNull();
    });

    it('registers watch channel with events.watch and updates integration account', async () => {
      mockIntegrationAccountService.get.mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          status: 'connected',
          calendarId: 'cal-husrevity-123',
          channelId: null,
          resourceId: null,
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      const expMs = Date.now() + 86400000;
      mockCalendarApi.events.watch.mockResolvedValueOnce({
        data: {
          id: 'husrevity-gcal-user-123-999',
          resourceId: 'res-abc-123',
          expiration: String(expMs),
        },
      });

      const result = await service.registerWatchChannel(ownerId);

      expect(mockCalendarApi.events.watch).toHaveBeenCalledWith({
        calendarId: 'cal-husrevity-123',
        requestBody: {
          id: expect.stringMatching(/^husrevity-gcal-user-123-/),
          type: 'web_hook',
          address: 'https://api.example.com/hooks/gcal',
          token: expect.any(String),
        },
      });
      expect(mockIntegrationAccountService.updateWatchChannel).toHaveBeenCalledWith(
        ownerId,
        'google_calendar',
        expect.stringMatching(/^husrevity-gcal-user-123-/),
        'res-abc-123',
        new Date(expMs),
        expect.any(String),
      );
      expect(result).toEqual({
        channelId: expect.stringMatching(/^husrevity-gcal-user-123-/),
        resourceId: 'res-abc-123',
        expiration: new Date(expMs),
      });
    });

    it('stops existing active channel before registering a new one if present', async () => {
      mockIntegrationAccountService.get.mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          status: 'connected',
          calendarId: 'cal-husrevity-123',
          channelId: 'old-channel-1',
          resourceId: 'old-resource-1',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      mockCalendarApi.channels.stop.mockResolvedValueOnce({});
      mockCalendarApi.events.watch.mockResolvedValueOnce({
        data: {
          id: 'new-channel-2',
          resourceId: 'new-resource-2',
          expiration: String(Date.now() + 86400000),
        },
      });

      await service.registerWatchChannel(ownerId);

      expect(mockCalendarApi.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: 'old-channel-1',
          resourceId: 'old-resource-1',
        },
      });
    });
  });

  describe('stopWatchChannel', () => {
    it('returns false if not configured or no active watch channel exists', async () => {
      mockGoogleCalendarConfig.isConfigured.mockReturnValueOnce(false);
      expect(await service.stopWatchChannel(ownerId)).toBe(false);

      mockIntegrationAccountService.get.mockResolvedValueOnce({
        account: { channelId: null, resourceId: null },
      });
      expect(await service.stopWatchChannel(ownerId)).toBe(false);
    });

    it('stops active watch channel and clears channel info in integration account', async () => {
      mockIntegrationAccountService.get.mockResolvedValue({
        account: {
          id: 'acc-1',
          ownerId,
          provider: 'google_calendar',
          status: 'connected',
          calendarId: 'cal-123',
          channelId: 'chan-to-stop',
          resourceId: 'res-to-stop',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      mockCalendarApi.channels.stop.mockResolvedValueOnce({});

      const stopped = await service.stopWatchChannel(ownerId);

      expect(stopped).toBe(true);
      expect(mockCalendarApi.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: 'chan-to-stop',
          resourceId: 'res-to-stop',
        },
      });
      expect(mockIntegrationAccountService.updateWatchChannel).toHaveBeenCalledWith(
        ownerId,
        'google_calendar',
        null,
        null,
        null,
        null,
      );
    });
  });
});
