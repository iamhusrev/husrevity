import { Test, TestingModule } from '@nestjs/testing';
import { GcalWebhookController } from './gcal-webhook.controller';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { ApiException } from '../common/api.exception';

describe('GcalWebhookController', () => {
  let controller: GcalWebhookController;
  let mockIntegrationAccountService: jest.Mocked<Partial<IntegrationAccountService>>;
  let mockSyncService: jest.Mocked<Partial<GoogleCalendarSyncService>>;

  const mockAccount = {
    id: 'acc-1',
    ownerId: 'user-100',
    provider: 'google_calendar',
    status: 'connected',
    channelId: 'chan-123',
    resourceId: 'res-456',
    channelToken: 'tok-secret',
  };

  beforeEach(async () => {
    mockIntegrationAccountService = {
      findByChannelId: jest.fn().mockResolvedValue(mockAccount as any),
    };

    mockSyncService = {
      syncIncremental: jest.fn().mockResolvedValue({ createdCount: 1, updatedCount: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GcalWebhookController],
      providers: [
        { provide: IntegrationAccountService, useValue: mockIntegrationAccountService },
        { provide: GoogleCalendarSyncService, useValue: mockSyncService },
      ],
    }).compile();

    controller = module.get<GcalWebhookController>(GcalWebhookController);
  });

  describe('handleWebhook', () => {
    it('should throw ApiException.badRequest if channelId or resourceId header is missing', async () => {
      await expect(
        controller.handleWebhook(undefined, 'res-456', 'exists', 'tok-secret'),
      ).rejects.toThrow(ApiException);
      await expect(
        controller.handleWebhook('chan-123', undefined, 'exists', 'tok-secret'),
      ).rejects.toThrow(ApiException);
    });

    it('should return failure message if channelId is not found', async () => {
      (mockIntegrationAccountService.findByChannelId as jest.Mock).mockResolvedValueOnce(null);

      const res = await controller.handleWebhook('unknown-channel', 'res-456', 'exists', 'tok-secret');

      expect(res).toEqual({
        success: false,
        message: 'Channel not found or inactive',
      });
      expect(mockSyncService.syncIncremental).not.toHaveBeenCalled();
    });

    it('should return failure message if resourceId does not match stored resourceId', async () => {
      const res = await controller.handleWebhook('chan-123', 'wrong-res-id', 'exists', 'tok-secret');

      expect(res).toEqual({
        success: false,
        message: 'Resource ID mismatch',
      });
      expect(mockSyncService.syncIncremental).not.toHaveBeenCalled();
    });

    it('should return failure message if channelToken is missing or does not match stored token (forged webhook)', async () => {
      const missing = await controller.handleWebhook('chan-123', 'res-456', 'exists', undefined);
      expect(missing).toEqual({ success: false, message: 'Channel token mismatch' });

      const wrong = await controller.handleWebhook('chan-123', 'res-456', 'exists', 'attacker-guessed-token');
      expect(wrong).toEqual({ success: false, message: 'Channel token mismatch' });

      expect(mockSyncService.syncIncremental).not.toHaveBeenCalled();
    });

    it('should return failure message if the stored account has no channelToken (fails closed)', async () => {
      (mockIntegrationAccountService.findByChannelId as jest.Mock).mockResolvedValueOnce({
        ...mockAccount,
        channelToken: null,
      });

      const res = await controller.handleWebhook('chan-123', 'res-456', 'exists', 'tok-secret');

      expect(res).toEqual({ success: false, message: 'Channel token mismatch' });
      expect(mockSyncService.syncIncremental).not.toHaveBeenCalled();
    });

    it('should handle "sync" resourceState handshake notification without triggering sync', async () => {
      const res = await controller.handleWebhook('chan-123', 'res-456', 'sync', 'tok-secret');

      expect(res).toEqual({
        success: true,
        message: 'Sync handshake received',
      });
      expect(mockSyncService.syncIncremental).not.toHaveBeenCalled();
    });

    it('should trigger syncIncremental and return success for change notification', async () => {
      const res = await controller.handleWebhook('chan-123', 'res-456', 'exists', 'tok-secret');

      expect(mockIntegrationAccountService.findByChannelId).toHaveBeenCalledWith('chan-123');
      expect(mockSyncService.syncIncremental).toHaveBeenCalledWith('user-100');
      expect(res).toEqual({
        success: true,
        message: 'Incremental sync triggered',
      });
    });

    it('should catch error from syncIncremental and return failure response', async () => {
      (mockSyncService.syncIncremental as jest.Mock).mockRejectedValueOnce(
        new Error('Google API network error'),
      );

      const res = await controller.handleWebhook('chan-123', 'res-456', 'exists', 'tok-secret');

      expect(res).toEqual({
        success: false,
        message: 'Sync failed: Google API network error',
      });
    });
  });
});
