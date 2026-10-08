import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleCalendarConfig } from './google-calendar.config';
import { ApiException } from '../common/api.exception';

describe('GoogleCalendarConfig', () => {
  let config: GoogleCalendarConfig;
  let configService: ConfigService;

  const createTestingModule = async (env: Record<string, string | undefined>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarConfig,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => env[key]),
          },
        },
      ],
    }).compile();

    return module.get<GoogleCalendarConfig>(GoogleCalendarConfig);
  };

  it('should report isConfigured as false when env vars are missing', async () => {
    config = await createTestingModule({});

    expect(config.isConfigured()).toBe(false);
    expect(config.clientId).toBeUndefined();
    expect(config.clientSecret).toBeUndefined();
    expect(config.redirectUri).toBeUndefined();
  });

  it('should throw badRequest ApiException when createOAuth2Client is called on unconfigured service', async () => {
    config = await createTestingModule({});

    expect(() => config.createOAuth2Client()).toThrow(ApiException);
    expect(() => config.createOAuth2Client()).toThrow(
      'Google Calendar integration is not configured',
    );
  });

  it('should report isConfigured as true and return OAuth2Client when env vars are set', async () => {
    config = await createTestingModule({
      GOOGLE_CALENDAR_CLIENT_ID: 'test-client-id',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_CALENDAR_REDIRECT_URI:
        'http://localhost:4090/api/integrations/google-calendar/callback',
    });

    expect(config.isConfigured()).toBe(true);
    expect(config.clientId).toBe('test-client-id');
    expect(config.clientSecret).toBe('test-client-secret');
    expect(config.redirectUri).toBe(
      'http://localhost:4090/api/integrations/google-calendar/callback',
    );

    const client = config.createOAuth2Client();
    expect(client).toBeDefined();
    expect((client as any)._clientId).toBe('test-client-id');
    expect((client as any)._clientSecret).toBe('test-client-secret');
    expect((client as any).redirectUri).toBe(
      'http://localhost:4090/api/integrations/google-calendar/callback',
    );
  });
});
