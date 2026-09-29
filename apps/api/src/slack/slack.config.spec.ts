import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlackConfig } from './slack.config';

describe('SlackConfig', () => {
  let config: SlackConfig;

  const createTestingModule = async (env: Record<string, string | undefined>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackConfig,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => env[key]),
          },
        },
      ],
    }).compile();

    return module.get<SlackConfig>(SlackConfig);
  };

  it('should report isConfigured as false when both tokens are missing', async () => {
    config = await createTestingModule({});

    expect(config.isConfigured()).toBe(false);
    expect(config.botToken).toBeUndefined();
    expect(config.appToken).toBeUndefined();
  });

  it('should report isConfigured as false when only SLACK_BOT_TOKEN is set', async () => {
    config = await createTestingModule({
      SLACK_BOT_TOKEN: 'xoxb-1234567890-test',
    });

    expect(config.isConfigured()).toBe(false);
    expect(config.botToken).toBe('xoxb-1234567890-test');
    expect(config.appToken).toBeUndefined();
  });

  it('should report isConfigured as false when only SLACK_APP_TOKEN is set', async () => {
    config = await createTestingModule({
      SLACK_APP_TOKEN: 'xapp-1234567890-test',
    });

    expect(config.isConfigured()).toBe(false);
    expect(config.botToken).toBeUndefined();
    expect(config.appToken).toBe('xapp-1234567890-test');
  });

  it('should report isConfigured as true when both SLACK_BOT_TOKEN and SLACK_APP_TOKEN are set', async () => {
    config = await createTestingModule({
      SLACK_BOT_TOKEN: 'xoxb-1234567890-test',
      SLACK_APP_TOKEN: 'xapp-1234567890-test',
      SLACK_BOT_USERNAME: 'HusrevitySlackBot',
    });

    expect(config.isConfigured()).toBe(true);
    expect(config.botToken).toBe('xoxb-1234567890-test');
    expect(config.appToken).toBe('xapp-1234567890-test');
    expect(config.botUsername).toBe('HusrevitySlackBot');
  });

  it('should return undefined for botUsername when SLACK_BOT_USERNAME is not set', async () => {
    config = await createTestingModule({
      SLACK_BOT_TOKEN: 'xoxb-1234567890-test',
      SLACK_APP_TOKEN: 'xapp-1234567890-test',
    });

    expect(config.botUsername).toBeUndefined();
  });
});
