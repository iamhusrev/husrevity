import { Test, TestingModule } from '@nestjs/testing';
import { SlackApiService } from './slack-api.service';
import { SlackConfig } from './slack.config';

describe('SlackApiService', () => {
  let service: SlackApiService;
  let config: jest.Mocked<SlackConfig>;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackApiService,
        {
          provide: SlackConfig,
          useValue: {
            isConfigured: jest.fn(),
            botToken: 'xoxb-mock-bot-token',
            appToken: 'xapp-mock-app-token',
          },
        },
      ],
    }).compile();

    service = module.get<SlackApiService>(SlackApiService);
    config = module.get(SlackConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  describe('postMessage', () => {
    it('should return null when SlackConfig is not configured', async () => {
      config.isConfigured.mockReturnValue(false);

      const result = await service.postMessage('U123456', 'Hello Slack');
      expect(result).toBeNull();
    });

    it('should send a message successfully when configured', async () => {
      config.isConfigured.mockReturnValue(true);
      const mockResponse = {
        ok: true,
        channel: 'U123456',
        ts: '1700000000.000100',
        message: { text: 'Hello Slack' },
      };

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await service.postMessage('U123456', 'Hello Slack');

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer xoxb-mock-bot-token',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          channel: 'U123456',
          text: 'Hello Slack',
        }),
      });
    });

    it('should return null if Slack API returns ok: false', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: false,
          error: 'channel_not_found',
        }),
      } as any);

      const result = await service.postMessage('invalid_channel', 'Hello');
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

      const result = await service.postMessage('U123456', 'Hello');
      expect(result).toBeNull();
    });
  });

  describe('openSocketConnection', () => {
    it('should return null when SlackConfig is not configured', async () => {
      config.isConfigured.mockReturnValue(false);

      const result = await service.openSocketConnection();
      expect(result).toBeNull();
    });

    it('should return WSS URL successfully when configured', async () => {
      config.isConfigured.mockReturnValue(true);
      const mockWssUrl = 'wss://wss-primary.slack.com/link/?ticket=mock-ticket';

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: true,
          url: mockWssUrl,
        }),
      } as any);

      const result = await service.openSocketConnection();

      expect(result).toBe(mockWssUrl);
      expect(global.fetch).toHaveBeenCalledWith('https://slack.com/api/apps.connections.open', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer xapp-mock-app-token',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    });

    it('should return null if Slack API returns ok: false', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: false,
          error: 'invalid_auth',
        }),
      } as any);

      const result = await service.openSocketConnection();
      expect(result).toBeNull();
    });

    it('should return null if Slack API returns ok: true but url is missing', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: true,
        }),
      } as any);

      const result = await service.openSocketConnection();
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      config.isConfigured.mockReturnValue(true);

      global.fetch = jest.fn().mockRejectedValue(new Error('Connection reset'));

      const result = await service.openSocketConnection();
      expect(result).toBeNull();
    });
  });
});
