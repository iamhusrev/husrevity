import { Test, TestingModule } from '@nestjs/testing';
import { TelegramApiService } from './telegram-api.service';
import { TelegramConfig } from './telegram.config';

describe('TelegramApiService', () => {
  let service: TelegramApiService;
  let config: jest.Mocked<TelegramConfig>;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramApiService,
        {
          provide: TelegramConfig,
          useValue: {
            isConfigured: jest.fn(),
            botToken: '123456:mocktoken',
          },
        },
      ],
    }).compile();

    service = module.get<TelegramApiService>(TelegramApiService);
    config = module.get(TelegramConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  describe('sendMessage', () => {
    it('should return null when TelegramConfig is not configured', async () => {
      config.isConfigured.mockReturnValue(false);

      const result = await service.sendMessage(12345, 'Hello');
      expect(result).toBeNull();
    });

    it('should send a message successfully when configured', async () => {
      config.isConfigured.mockReturnValue(true);
      const mockMessage = {
        message_id: 1,
        chat: { id: 12345, type: 'private' },
        date: 1600000000,
        text: 'Hello',
      };

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: true,
          result: mockMessage,
        }),
      } as any);

      const result = await service.sendMessage(12345, 'Hello', { parse_mode: 'HTML' });

      expect(result).toEqual(mockMessage);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bot123456:mocktoken/sendMessage',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: 12345,
            text: 'Hello',
            parse_mode: 'HTML',
          }),
        },
      );
    });

    it('should return null if Telegram API returns ok: false', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: false,
          description: 'Bad Request: chat not found',
          error_code: 400,
        }),
      } as any);

      const result = await service.sendMessage(12345, 'Hello');
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

      const result = await service.sendMessage(12345, 'Hello');
      expect(result).toBeNull();
    });
  });

  describe('getUpdates', () => {
    it('should return [] when TelegramConfig is not configured', async () => {
      config.isConfigured.mockReturnValue(false);

      const result = await service.getUpdates();
      expect(result).toEqual([]);
    });

    it('should fetch updates successfully when configured', async () => {
      config.isConfigured.mockReturnValue(true);
      const mockUpdates = [
        {
          update_id: 100,
          message: {
            message_id: 1,
            chat: { id: 12345, type: 'private' },
            date: 1600000000,
            text: '/start',
          },
        },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: true,
          result: mockUpdates,
        }),
      } as any);

      const result = await service.getUpdates(100, 30);

      expect(result).toEqual(mockUpdates);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bot123456:mocktoken/getUpdates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset: 100,
            timeout: 30,
            allowed_updates: ['message'],
          }),
        },
      );
    });

    it('should return [] if Telegram API returns ok: false', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: false,
          description: 'Unauthorized',
          error_code: 401,
        }),
      } as any);

      const result = await service.getUpdates();
      expect(result).toEqual([]);
    });

    it('should return [] on network error', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockRejectedValue(new Error('Fetch timeout'));

      const result = await service.getUpdates();
      expect(result).toEqual([]);
    });
  });
});
