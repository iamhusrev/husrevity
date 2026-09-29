import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { Auth } from 'googleapis';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarService } from './google-calendar.service';
import { AuthenticatedUser } from '../common/current-user.decorator';
import { ApiException } from '../common/api.exception';

describe('GoogleCalendarController', () => {
  let controller: GoogleCalendarController;
  let jwtService: JwtService;
  let mockGoogleCalendarConfig: jest.Mocked<Partial<GoogleCalendarConfig>>;
  let mockIntegrationAccountService: jest.Mocked<Partial<IntegrationAccountService>>;
  let mockGoogleCalendarService: jest.Mocked<Partial<GoogleCalendarService>>;
  let mockOAuth2Client: jest.Mocked<Partial<Auth.OAuth2Client>>;

  const mockUser: AuthenticatedUser = {
    userId: 'user-123',
    email: 'user@example.com',
    role: 'user',
  };

  beforeEach(async () => {
    mockOAuth2Client = {
      generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=true'),
      getToken: jest.fn().mockResolvedValue({
        tokens: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          scope: 'https://www.googleapis.com/auth/calendar',
        },
      } as any),
    };

    mockGoogleCalendarConfig = {
      createOAuth2Client: jest.fn().mockReturnValue(mockOAuth2Client as any),
    };

    mockIntegrationAccountService = {
      save: jest.fn().mockResolvedValue({
        id: 'acc-123',
        ownerId: 'user-123',
        provider: 'google_calendar',
        status: 'connected',
        connectedAt: new Date('2026-09-28T12:00:00Z'),
      } as any),
    };

    mockGoogleCalendarService = {
      ensureHusrevityCalendar: jest.fn().mockResolvedValue('cal-husrevity-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [GoogleCalendarController],
      providers: [
        { provide: GoogleCalendarConfig, useValue: mockGoogleCalendarConfig },
        { provide: IntegrationAccountService, useValue: mockIntegrationAccountService },
        { provide: GoogleCalendarService, useValue: mockGoogleCalendarService },
      ],
    }).compile();

    controller = module.get<GoogleCalendarController>(GoogleCalendarController);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('connect', () => {
    it('should generate a signed state token and redirect user', () => {
      const mockRes = {
        redirect: jest.fn(),
      } as unknown as Response;

      controller.connect(mockUser, mockRes);

      expect(mockGoogleCalendarConfig.createOAuth2Client).toHaveBeenCalled();
      const call = (mockOAuth2Client.generateAuthUrl as jest.Mock).mock.calls[0][0];
      expect(call.access_type).toBe('offline');
      expect(call.prompt).toBe('consent');
      expect(call.scope).toEqual(['https://www.googleapis.com/auth/calendar']);

      // state must be a signed token bound to the user, not the raw userId
      expect(call.state).not.toBe('user-123');
      const decoded = jwtService.verify(call.state);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.purpose).toBe('gcal-oauth-state');

      expect(mockRes.redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?mock=true');
    });
  });

  describe('callback', () => {
    const signState = (userId: string) =>
      jwtService.sign({ purpose: 'gcal-oauth-state' }, { subject: userId, expiresIn: '10m' });

    it('should throw bad request if code is missing', async () => {
      await expect(controller.callback('', signState('user-123'))).rejects.toThrow(ApiException);
    });

    it('should throw bad request if both state and user are missing', async () => {
      await expect(controller.callback('auth-code')).rejects.toThrow(ApiException);
    });

    it('should reject a raw/unsigned state value (not just accept it as the ownerId)', async () => {
      await expect(controller.callback('auth-code', 'user-123')).rejects.toThrow(ApiException);
      expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
    });

    it('should reject a state token signed for a different purpose', async () => {
      const forged = jwtService.sign({ purpose: 'not-gcal' }, { subject: 'victim-id', expiresIn: '10m' });
      await expect(controller.callback('auth-code', forged)).rejects.toThrow(ApiException);
      expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
    });

    it('should reject an expired state token', async () => {
      const expired = jwtService.sign({ purpose: 'gcal-oauth-state' }, { subject: 'user-123', expiresIn: '-1s' });
      await expect(controller.callback('auth-code', expired)).rejects.toThrow(ApiException);
      expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
    });

    it('should exchange code for tokens and save integration account using a verified state token', async () => {
      const result = await controller.callback('auth-code', signState('user-123'));

      expect(mockGoogleCalendarConfig.createOAuth2Client).toHaveBeenCalled();
      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('auth-code');
      expect(mockIntegrationAccountService.save).toHaveBeenCalledWith(
        'user-123',
        'google_calendar',
        {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
        ['https://www.googleapis.com/auth/calendar'],
      );
      expect(result).toEqual({
        message: 'Google Calendar successfully connected',
        account: {
          id: 'acc-123',
          provider: 'google_calendar',
          status: 'connected',
          calendarId: 'cal-husrevity-123',
          connectedAt: new Date('2026-09-28T12:00:00Z'),
        },
      });
    });

    it('should resolve user from CurrentUser if state is missing', async () => {
      await controller.callback('auth-code', undefined, mockUser);

      expect(mockIntegrationAccountService.save).toHaveBeenCalledWith(
        'user-123',
        'google_calendar',
        {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
        ['https://www.googleapis.com/auth/calendar'],
      );
    });

    it('should throw bad request if Google does not return an access token', async () => {
      (mockOAuth2Client.getToken as jest.Mock).mockResolvedValueOnce({
        tokens: { access_token: undefined },
      });

      await expect(controller.callback('auth-code', signState('user-123'))).rejects.toThrow(ApiException);
    });

    it('should throw bad request if token exchange fails', async () => {
      (mockOAuth2Client.getToken as jest.Mock).mockRejectedValueOnce(new Error('Invalid grant'));

      await expect(controller.callback('auth-code', signState('user-123'))).rejects.toThrow(
        'Failed to exchange code for tokens: Invalid grant',
      );
    });
  });
});
