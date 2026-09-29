import { Test, TestingModule } from '@nestjs/testing';
import { TelegramPollerService } from './telegram-poller.service';
import { TelegramConfig } from './telegram.config';
import { TelegramApiService, TelegramUpdate } from './telegram-api.service';
import { TelegramMessageHandlerService } from './telegram-message-handler.service';

describe('TelegramPollerService', () => {
  let service: TelegramPollerService;
  let telegramConfig: jest.Mocked<TelegramConfig>;
  let telegramApiService: jest.Mocked<TelegramApiService>;
  let telegramMessageHandlerService: jest.Mocked<TelegramMessageHandlerService>;

  beforeEach(async () => {
    telegramConfig = {
      isConfigured: jest.fn().mockReturnValue(true),
      botToken: 'test-token',
      botUsername: 'test_bot',
    } as unknown as jest.Mocked<TelegramConfig>;

    telegramApiService = {
      getUpdates: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<TelegramApiService>;

    telegramMessageHandlerService = {
      handleUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TelegramMessageHandlerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramPollerService,
        { provide: TelegramConfig, useValue: telegramConfig },
        { provide: TelegramApiService, useValue: telegramApiService },
        { provide: TelegramMessageHandlerService, useValue: telegramMessageHandlerService },
      ],
    }).compile();

    service = module.get<TelegramPollerService>(TelegramPollerService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should not start polling if Telegram is not configured', () => {
      telegramConfig.isConfigured.mockReturnValue(false);

      service.onModuleInit();

      expect(service.getIsPolling()).toBe(false);
      expect(telegramApiService.getUpdates).not.toHaveBeenCalled();
    });

    it('should start polling loop when configured and stop on module destroy', async () => {
      telegramConfig.isConfigured.mockReturnValue(true);
      telegramApiService.getUpdates.mockImplementation(async () => {
        // Return empty updates and pause slightly to simulate async loop step
        await new Promise((r) => setTimeout(r, 10));
        return [];
      });

      service.onModuleInit();
      expect(service.getIsPolling()).toBe(true);

      await service.onModuleDestroy();
      expect(service.getIsPolling()).toBe(false);
    });
  });

  describe('pollOnce', () => {
    it('should do nothing when getUpdates returns empty array', async () => {
      telegramApiService.getUpdates.mockResolvedValue([]);

      await service.pollOnce();

      expect(telegramMessageHandlerService.handleUpdate).not.toHaveBeenCalled();
      expect(service.getOffset()).toBeUndefined();
    });

    it('should dispatch each update to handleUpdate and update offset', async () => {
      const updates: TelegramUpdate[] = [
        {
          update_id: 100,
          message: {
            message_id: 1,
            chat: { id: 12345, type: 'private' },
            date: 1600000000,
            text: 'Hello',
          },
        },
        {
          update_id: 101,
          message: {
            message_id: 2,
            chat: { id: 12345, type: 'private' },
            date: 1600000005,
            text: 'World',
          },
        },
      ];
      telegramApiService.getUpdates.mockResolvedValue(updates);

      // Mark service as polling for pollOnce processing loop
      (service as any).isPolling = true;

      await service.pollOnce();

      expect(telegramApiService.getUpdates).toHaveBeenCalledWith(undefined, 30);
      expect(telegramMessageHandlerService.handleUpdate).toHaveBeenNthCalledWith(1, updates[0]);
      expect(telegramMessageHandlerService.handleUpdate).toHaveBeenNthCalledWith(2, updates[1]);
      expect(service.getOffset()).toBe(102);
    });

    it('should handle update processing errors gracefully and increment offset', async () => {
      const updates: TelegramUpdate[] = [
        {
          update_id: 200,
          message: {
            message_id: 3,
            chat: { id: 999, type: 'private' },
            date: 1600000010,
            text: 'Fail update',
          },
        },
      ];
      telegramApiService.getUpdates.mockResolvedValue(updates);
      telegramMessageHandlerService.handleUpdate.mockRejectedValue(new Error('Handler crashed'));
      (service as any).isPolling = true;

      await service.pollOnce();

      expect(telegramMessageHandlerService.handleUpdate).toHaveBeenCalledWith(updates[0]);
      expect(service.getOffset()).toBe(201);
    });
  });
});
