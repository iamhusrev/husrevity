import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramConfig } from './telegram.config';

describe('TelegramConfig', () => {
  let config: TelegramConfig;

  const createTestingModule = async (env: Record<string, string | undefined>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramConfig,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => env[key]),
          },
        },
      ],
    }).compile();

    return module.get<TelegramConfig>(TelegramConfig);
  };

  it('should report isConfigured as false when TELEGRAM_BOT_TOKEN is missing', async () => {
    config = await createTestingModule({});

    expect(config.isConfigured()).toBe(false);
    expect(config.botToken).toBeUndefined();
  });

  it('should report isConfigured as true when TELEGRAM_BOT_TOKEN is set', async () => {
    config = await createTestingModule({
      TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      TELEGRAM_BOT_USERNAME: 'HusrevityBot',
    });

    expect(config.isConfigured()).toBe(true);
    expect(config.botToken).toBe('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
    expect(config.botUsername).toBe('HusrevityBot');
  });

  it('should return undefined for botUsername when TELEGRAM_BOT_USERNAME is not set', async () => {
    config = await createTestingModule({});

    expect(config.botUsername).toBeUndefined();
  });
});
