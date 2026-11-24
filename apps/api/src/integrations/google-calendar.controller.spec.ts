import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { Auth } from 'googleapis';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarConnectService } from './google-calendar-connect.service';
import { GoogleCalendarLifecycleService } from './google-calendar-lifecycle.service';
import { GoogleCalendarWriteService } from './google-calendar-write.service';
import { GoogleCalendarSelectionService } from './google-calendar-selection.service';
import { AuthenticatedUser } from '../common/current-user.decorator';
import { ApiException } from '../common/api.exception';

describe('GoogleCalendarController', () => {
  const CHALLENGE = 'c'.repeat(43);
  let controller: GoogleCalendarController;
  let mockConnect: jest.Mocked<Partial<GoogleCalendarConnectService>>;
  let mockGoogleCalendarConfig: jest.Mocked<Partial<GoogleCalendarConfig>>;
  let mockIntegrationAccountService: jest.Mocked<Partial<IntegrationAccountService>>;
  let mockGoogleCalendarService: jest.Mocked<Partial<GoogleCalendarService>>;
  let mockWrite: { completeWrite: jest.Mock };
  let mockOAuth2Client: jest.Mocked<Partial<Auth.OAuth2Client>>;
  let mockSelection: { statusExtras: jest.Mock; isEnabled: jest.Mock };
  let mockLifecycle: { disconnect: jest.Mock; completeNarrow: jest.Mock; markReconnected: jest.Mock };
  const legacyExtras = {
    v2Enabled: false,
    mode: 'legacy',
    needsReconnect: false,
    selectedCount: 0,
    lastSyncAt: null,
    lastError: null,
  };

  const mockUser: AuthenticatedUser = {
    userId: 'user-123',
    email: 'user@example.com',
    role: 'user',
  };

  beforeEach(async () => {
    mockOAuth2Client = {
      generateAuthUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=true'),
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
      isConfigured: jest.fn().mockReturnValue(true),
      webUrl: 'http://web.test',
      callbackPageUrl: 'http://web.test/settings/integrations/google-callback',
      v2Enabled: false,
    } as unknown as jest.Mocked<Partial<GoogleCalendarConfig>>;

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

    mockSelection = { statusExtras: jest.fn().mockResolvedValue(legacyExtras), isEnabled: jest.fn().mockReturnValue(false) };
    mockLifecycle = {
      disconnect: jest.fn().mockResolvedValue({ revokePending: false, legacyCopiesDeleted: 0 }),
      completeNarrow: jest.fn().mockResolvedValue(true),
      markReconnected: jest.fn().mockResolvedValue(undefined),
    };

    mockWrite = { completeWrite: jest.fn().mockResolvedValue(true) };

    mockConnect = {
      begin: jest.fn().mockResolvedValue({ ticket: 'ticket-1' }),
      startUrlFor: jest
        .fn()
        .mockImplementation((t: string) => `https://api.test/api/integrations/google-calendar/start?ticket=${t}`),
      start: jest
        .fn()
        .mockResolvedValue({ authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=true', cookieValue: 'flow.secret' }),
      handleCallback: jest
        .fn()
        .mockResolvedValue({ redirectUrl: 'http://web.test/settings/integrations/google-callback#code=handoff-1' }),
      redeemHandoff: jest.fn().mockResolvedValue({ ownerId: 'user-123', kind: 'connect', googleCode: 'auth-code' }),
      cookieOptions: jest.fn().mockReturnValue({ path: '/api/integrations/google-calendar/callback', secure: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleCalendarController],
      providers: [
        { provide: GoogleCalendarConfig, useValue: mockGoogleCalendarConfig },
        { provide: IntegrationAccountService, useValue: mockIntegrationAccountService },
        { provide: GoogleCalendarService, useValue: mockGoogleCalendarService },
        { provide: GoogleCalendarConnectService, useValue: mockConnect },
        { provide: GoogleCalendarSelectionService, useValue: mockSelection },
        { provide: GoogleCalendarLifecycleService, useValue: mockLifecycle },
        { provide: GoogleCalendarWriteService, useValue: mockWrite },
      ],
    }).compile();

    controller = module.get<GoogleCalendarController>(GoogleCalendarController);
  });

  describe('connect (legacy redirect)', () => {
    it('should begin a ticket flow for the caller and redirect to the API start route, never straight to Google', async () => {
      const mockRes = { redirect: jest.fn() } as unknown as Response;

      await controller.connect(mockUser, { codeChallenge: CHALLENGE }, mockRes);

      expect(mockConnect.begin).toHaveBeenCalledWith('user-123', CHALLENGE);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        302,
        'https://api.test/api/integrations/google-calendar/start?ticket=ticket-1',
      );
      expect(mockOAuth2Client.generateAuthUrl).not.toHaveBeenCalled();
    });
  });

  describe('start (browser navigation)', () => {
    const req = (headers: Record<string, string> = {}) => ({ headers }) as unknown as Request;
    const makeRes = () =>
      ({ cookie: jest.fn(), setHeader: jest.fn(), redirect: jest.fn() }) as unknown as Response;

    it('should set a locked-down flow cookie and redirect to Google with the offline, consent, unchanged scope URL', async () => {
      const res = makeRes();
      await controller.start('ticket-1', req(), res);

      expect(mockConnect.start).toHaveBeenCalledWith('ticket-1');
      expect(res.cookie).toHaveBeenCalledWith(
        'hv_gc_flow',
        'flow.secret',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          secure: true,
          path: '/api/integrations/google-calendar/callback',
        }),
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://accounts.google.com/o/oauth2/v2/auth?mock=true',
      );
    });

    it('should reject a non-navigation request (fetch/XHR or embed) before touching the ticket', async () => {
      const res = makeRes();
      await expect(
        controller.start('ticket-1', req({ 'sec-fetch-mode': 'cors' }), res),
      ).rejects.toThrow(ApiException);
      expect(mockConnect.start).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('connectUrl / status / disconnect', () => {
    it('should return the API start URL (with a single-use ticket) as JSON, not a Google URL', async () => {
      await expect(controller.connectUrl(mockUser, { codeChallenge: CHALLENGE })).resolves.toEqual({
        url: 'https://api.test/api/integrations/google-calendar/start?ticket=ticket-1',
      });
      expect(mockConnect.begin).toHaveBeenCalledWith('user-123', CHALLENGE);
    });

    it('should report connected state from the integration account, existing fields unchanged', async () => {
      (mockIntegrationAccountService as any).get = jest.fn().mockResolvedValue({
        account: { connectedAt: new Date('2026-09-28T12:00:00Z') },
      });
      await expect(controller.status(mockUser)).resolves.toEqual({
        configured: true,
        connected: true,
        connectedAt: '2026-09-28T12:00:00.000Z',
        ...legacyExtras,
      });
    });

    it('should report not connected when no account exists', async () => {
      (mockIntegrationAccountService as any).get = jest.fn().mockResolvedValue(null);
      await expect(controller.status(mockUser)).resolves.toEqual({
        configured: true,
        connected: false,
        connectedAt: null,
        ...legacyExtras,
      });
    });

    it('should add the v2 status fields additively and pass the legacy account data to the extras', async () => {
      const lastSyncAt = new Date('2026-09-29T08:00:00Z');
      (mockIntegrationAccountService as any).get = jest.fn().mockResolvedValue({
        account: {
          connectedAt: new Date('2026-09-28T12:00:00Z'),
          lastSyncAt,
          scopes: ['https://www.googleapis.com/auth/calendar'],
        },
      });
      mockSelection.statusExtras.mockResolvedValue({
        v2Enabled: true,
        mode: 'v2_read',
        needsReconnect: true,
        selectedCount: 2,
        lastSyncAt: '2026-09-30T08:00:00.000Z',
        lastError: 'google_500',
      });

      const status = await controller.status(mockUser);

      expect(status).toEqual({
        configured: true,
        connected: true,
        connectedAt: '2026-09-28T12:00:00.000Z',
        v2Enabled: true,
        mode: 'v2_read',
        needsReconnect: true,
        selectedCount: 2,
        lastSyncAt: '2026-09-30T08:00:00.000Z',
        lastError: 'google_500',
      });
      expect(mockSelection.statusExtras).toHaveBeenCalledWith('user-123', {
        connected: true,
        lastSyncAt,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
    });

    it.each([
      ['off', false],
      ['on', true],
    ])('disconnects through the purge-and-revoke lifecycle in every mode (v2 flag %s), never the legacy status flip', async (_n, flag) => {
      mockSelection.isEnabled.mockReturnValue(flag);
      (mockIntegrationAccountService as any).disconnect = jest.fn();

      await expect(controller.disconnect(mockUser)).resolves.toBeUndefined();

      expect(mockLifecycle.disconnect).toHaveBeenCalledWith('user-123', { deleteLegacyCopies: false });
      expect((mockIntegrationAccountService as any).disconnect).not.toHaveBeenCalled();
    });

    it.each([false, true])('keeps the existing event copies unless deleteLegacyCopies=true is confirmed (v2 flag %s)', async (flag) => {
      mockSelection.isEnabled.mockReturnValue(flag);

      await controller.disconnect(mockUser);
      await controller.disconnect(mockUser, 'false');
      await controller.disconnect(mockUser, 'true');

      expect(mockLifecycle.disconnect.mock.calls).toEqual([
        ['user-123', { deleteLegacyCopies: false }],
        ['user-123', { deleteLegacyCopies: false }],
        ['user-123', { deleteLegacyCopies: true }],
      ]);
    });
  });

  describe('callback (browser redirect)', () => {
    const makeRes = () =>
      ({ redirect: jest.fn(), clearCookie: jest.fn(), setHeader: jest.fn() }) as unknown as Response;
    const makeReq = (cookie = 'hv_gc_flow=flow.secret') =>
      ({ headers: { cookie } }) as unknown as Request;
    const ERROR_URL = 'http://web.test/settings/integrations/google-callback#error=google_failed';

    it('should hand state, code and cookie to the flow, store NO token and redirect to the web with the handoff fragment', async () => {
      const res = makeRes();
      const query = { code: 'auth-code', state: 'state-1' };
      await controller.callback(makeReq(), res, query);

      expect(mockConnect.handleCallback).toHaveBeenCalledWith(query, 'hv_gc_flow=flow.secret');
      expect(mockOAuth2Client.getToken).not.toHaveBeenCalled();
      expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
      expect(mockLifecycle.markReconnected).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'http://web.test/settings/integrations/google-callback#code=handoff-1',
      );
    });

    it('should redirect with an error fragment and store nothing when the flow check fails (no cookie, forged state, replay)', async () => {
      (mockConnect.handleCallback as jest.Mock).mockRejectedValueOnce(ApiException.badRequest('x'));
      const res = makeRes();
      await controller.callback(makeReq(''), res, { code: 'auth-code', state: 'forged' });

      expect(res.redirect).toHaveBeenCalledWith(302, ERROR_URL);
      expect(mockOAuth2Client.getToken).not.toHaveBeenCalled();
      expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
    });
  });

  describe('exchange (Bearer-authenticated handoff redemption)', () => {
    const body = { code: 'handoff-1', verifier: 'v'.repeat(43) };

    it('should redeem the handoff for the Bearer user and verifier, then store the tokens for the flow user', async () => {
      await expect(controller.exchange(mockUser, body)).resolves.toEqual({ kind: 'connect', connected: true });

      expect(mockConnect.redeemHandoff).toHaveBeenCalledWith('user-123', 'handoff-1', body.verifier);
      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('auth-code');
      expect(mockIntegrationAccountService.save).toHaveBeenCalledWith(
        'user-123',
        'google_calendar',
        { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
        ['https://www.googleapis.com/auth/calendar'],
      );
    });

    it('should store nothing and reject when the handoff does not match (wrong Bearer, verifier, replay, expiry)', async () => {
      (mockConnect.redeemHandoff as jest.Mock).mockRejectedValueOnce(ApiException.badRequest('x'));
      await expect(controller.exchange(mockUser, body)).rejects.toThrow(ApiException);
      expect(mockOAuth2Client.getToken).not.toHaveBeenCalled();
      expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
    });

    it('should report connected false when the code exchange with Google fails', async () => {
      (mockOAuth2Client.getToken as jest.Mock).mockRejectedValueOnce(new Error('Invalid grant'));
      await expect(controller.exchange(mockUser, body)).resolves.toEqual({ kind: 'connect', connected: false });
      expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
    });

    describe('narrowing consent', () => {
      beforeEach(() => {
        mockConnect.redeemHandoff = jest
          .fn()
          .mockResolvedValue({ ownerId: 'user-123', kind: 'narrow', googleCode: 'auth-code' });
      });

      it('should hand the code to the lifecycle (not the legacy store)', async () => {
        await expect(controller.exchange(mockUser, body)).resolves.toEqual({ kind: 'narrow', connected: true });
        expect(mockLifecycle.completeNarrow).toHaveBeenCalledWith('user-123', 'auth-code');
        expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
        expect(mockOAuth2Client.getToken).not.toHaveBeenCalled();
      });

      it('should report connected false when the grant is rejected', async () => {
        mockLifecycle.completeNarrow.mockResolvedValue(false);
        await expect(controller.exchange(mockUser, body)).resolves.toEqual({ kind: 'narrow', connected: false });
      });
    });

    describe('write consent', () => {
      beforeEach(() => {
        mockConnect.redeemHandoff = jest
          .fn()
          .mockResolvedValue({ ownerId: 'user-123', kind: 'write', googleCode: 'auth-code' });
      });

      it('should hand the code to the write service (not the legacy store)', async () => {
        await expect(controller.exchange(mockUser, body)).resolves.toEqual({ kind: 'write', connected: true });
        expect(mockWrite.completeWrite).toHaveBeenCalledWith('user-123', 'auth-code');
        expect(mockLifecycle.completeNarrow).not.toHaveBeenCalled();
        expect(mockIntegrationAccountService.save).not.toHaveBeenCalled();
      });

      it('should report connected false when the grant is rejected', async () => {
        mockWrite.completeWrite.mockResolvedValue(false);
        await expect(controller.exchange(mockUser, body)).resolves.toEqual({ kind: 'write', connected: false });
      });
    });

    it('should mark a waiting connection reconnected after a regular connect only when the v2 flag is on', async () => {
      await controller.exchange(mockUser, body);
      expect(mockLifecycle.markReconnected).not.toHaveBeenCalled();

      mockSelection.isEnabled.mockReturnValue(true);
      await controller.exchange(mockUser, body);
      expect(mockLifecycle.markReconnected).toHaveBeenCalledWith(
        'user-123',
        ['https://www.googleapis.com/auth/calendar'],
        expect.anything(),
      );
    });
  });

  describe('storeConnection', () => {
    it('should throw bad request if code is missing', async () => {
      await expect(controller.storeConnection('user-123', '')).rejects.toThrow(ApiException);
    });

    it('should exchange code for tokens and save integration account for the given owner', async () => {
      const result = await controller.storeConnection('user-123', 'auth-code');

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
        scopes: ['https://www.googleapis.com/auth/calendar'],
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

    it('should skip the legacy Husrevity calendar and watch channel under the v2 model and default to the read-only scopes', async () => {
      (mockGoogleCalendarConfig as { v2Enabled: boolean }).v2Enabled = true;
      (mockGoogleCalendarService as any).registerWatchChannel = jest.fn();
      (mockOAuth2Client.getToken as jest.Mock).mockResolvedValueOnce({
        tokens: { access_token: 'a', refresh_token: 'r' },
      });

      const result = await controller.storeConnection('user-123', 'auth-code');

      expect(mockGoogleCalendarService.ensureHusrevityCalendar).not.toHaveBeenCalled();
      expect((mockGoogleCalendarService as any).registerWatchChannel).not.toHaveBeenCalled();
      expect(result.scopes).toEqual([
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly',
      ]);
    });

    it('should throw bad request if Google does not return an access token', async () => {
      (mockOAuth2Client.getToken as jest.Mock).mockResolvedValueOnce({
        tokens: { access_token: undefined },
      });

      await expect(controller.storeConnection('user-123', 'auth-code')).rejects.toThrow(ApiException);
    });

    it('should throw bad request if token exchange fails', async () => {
      (mockOAuth2Client.getToken as jest.Mock).mockRejectedValueOnce(new Error('Invalid grant'));

      await expect(controller.storeConnection('user-123', 'auth-code')).rejects.toThrow(
        'Failed to exchange code for tokens: Invalid grant',
      );
    });
  });
});
