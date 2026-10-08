import { Test, TestingModule } from '@nestjs/testing';
import { GcalWatchRenewalService } from './gcal-watch-renewal.service';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarService } from './google-calendar.service';

describe('GcalWatchRenewalService', () => {
  let service: GcalWatchRenewalService;
  let mockIntegrationAccountService: jest.Mocked<Partial<IntegrationAccountService>>;
  let mockGoogleCalendarService: jest.Mocked<Partial<GoogleCalendarService>>;

  const mockAccounts = [
    { id: 'acc-1', ownerId: 'user-10', provider: 'google_calendar', status: 'connected' },
    { id: 'acc-2', ownerId: 'user-20', provider: 'google_calendar', status: 'connected' },
  ];

  beforeEach(async () => {
    mockIntegrationAccountService = {
      findAccountsNeedingWatchRenewal: jest.fn().mockResolvedValue(mockAccounts as any),
    };

    mockGoogleCalendarService = {
      registerWatchChannel: jest.fn().mockImplementation((ownerId: string) => {
        return Promise.resolve({
          channelId: `chan-${ownerId}`,
          resourceId: `res-${ownerId}`,
          expiration: new Date('2026-10-01T00:00:00Z'),
        });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcalWatchRenewalService,
        { provide: IntegrationAccountService, useValue: mockIntegrationAccountService },
        { provide: GoogleCalendarService, useValue: mockGoogleCalendarService },
      ],
    }).compile();

    service = module.get<GcalWatchRenewalService>(GcalWatchRenewalService);
  });

  describe('renewWatchChannels', () => {
    it('should query accounts needing renewal and register watch channels for each', async () => {
      const count = await service.renewWatchChannels();

      expect(mockIntegrationAccountService.findAccountsNeedingWatchRenewal).toHaveBeenCalledWith(
        'google_calendar',
        24,
      );
      expect(mockGoogleCalendarService.registerWatchChannel).toHaveBeenCalledTimes(2);
      expect(mockGoogleCalendarService.registerWatchChannel).toHaveBeenCalledWith('user-10');
      expect(mockGoogleCalendarService.registerWatchChannel).toHaveBeenCalledWith('user-20');
      expect(count).toBe(2);
    });

    it('should return 0 when no accounts require renewal', async () => {
      (
        mockIntegrationAccountService.findAccountsNeedingWatchRenewal as jest.Mock
      ).mockResolvedValueOnce([]);

      const count = await service.renewWatchChannels();

      expect(count).toBe(0);
      expect(mockGoogleCalendarService.registerWatchChannel).not.toHaveBeenCalled();
    });

    it('should handle registration errors gracefully and continue with remaining accounts', async () => {
      (mockGoogleCalendarService.registerWatchChannel as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          channelId: 'chan-user-20',
          resourceId: 'res-user-20',
          expiration: new Date('2026-10-01T00:00:00Z'),
        });

      const count = await service.renewWatchChannels();

      expect(mockGoogleCalendarService.registerWatchChannel).toHaveBeenCalledTimes(2);
      expect(count).toBe(1);
    });
  });
});
