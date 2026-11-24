import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ValidationError } from 'class-validator';
import request from 'supertest';
import { ApiException } from '../common/api.exception';
import { GlobalExceptionFilter } from '../common/global-exception.filter';
import { ResponseInterceptor } from '../common/response.interceptor';
import { GoogleCalendarConnectService } from './google-calendar-connect.service';
import { GoogleCalendarLifecycleService } from './google-calendar-lifecycle.service';
import { GoogleCalendarPublishService } from './google-calendar-publish.service';
import { GoogleCalendarWriteService } from './google-calendar-write.service';
import { GoogleCalendarSelectionService } from './google-calendar-selection.service';
import { GoogleCalendarV2Controller } from './google-calendar-v2.controller';

class FakeAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    ctx.switchToHttp().getRequest().user = { userId: 'user-7', email: 'u@example.test', role: 'user' };
    return true;
  }
}

const CH = 'a'.repeat(43);

describe('GoogleCalendarV2Controller (contract)', () => {
  let app: INestApplication;
  let svc: {
    isEnabled: jest.Mock;
    listCalendars: jest.Mock;
    updateSelection: jest.Mock;
    feed: jest.Mock;
  };
  let lifecycle: { beginNarrow: jest.Mock; disconnectPreview: jest.Mock };
  let write: { setWriteEnabled: jest.Mock };
  let publish: { migrateLegacy: jest.Mock };

  async function boot(enabled: boolean): Promise<void> {
    svc = {
      isEnabled: jest.fn().mockReturnValue(enabled),
      listCalendars: jest.fn().mockResolvedValue([]),
      updateSelection: jest.fn().mockResolvedValue({ selected: [] }),
      feed: jest.fn().mockResolvedValue({ events: [], hiddenLegacyItemIds: [] }),
    };
    lifecycle = {
      beginNarrow: jest.fn().mockResolvedValue({ ticket: 'ticket-9' }),
      disconnectPreview: jest.fn().mockResolvedValue({ legacyCopyCount: 3 }),
    };
    write = { setWriteEnabled: jest.fn().mockResolvedValue({ enabled: true, consentUrl: null }) };
    publish = { migrateLegacy: jest.fn().mockResolvedValue({ published: 2, skipped: 1, failed: 0, remaining: 0 }) };
    const moduleRef = await Test.createTestingModule({
      controllers: [GoogleCalendarV2Controller],
      providers: [
        { provide: GoogleCalendarWriteService, useValue: write },
        { provide: GoogleCalendarPublishService, useValue: publish },
        { provide: GoogleCalendarSelectionService, useValue: svc },
        { provide: GoogleCalendarLifecycleService, useValue: lifecycle },
        {
          provide: GoogleCalendarConnectService,
          useValue: { startUrlFor: (t: string) => `https://api.test/api/integrations/google-calendar/start?ticket=${t}` },
        },
        { provide: APP_GUARD, useClass: FakeAuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) =>
          ApiException.badRequest(`Validation failed: ${errors.map((e) => e.property).join('; ')}`),
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');
  }

  afterEach(async () => {
    await app?.close();
  });

  const base = '/api/integrations/google-calendar';

  describe('flag off', () => {
    beforeEach(() => boot(false));

    it.each([
      ['GET', `${base}/calendars`],
      ['PUT', `${base}/calendars/selection`],
      ['GET', `${base}/events?from=2026-06-01T00:00:00Z&to=2026-06-10T00:00:00Z`],
      ['POST', `${base}/narrow`],
      ['GET', `${base}/disconnect-preview`],
      ['PUT', `${base}/write`],
      ['POST', `${base}/write/migrate-legacy`],
    ])('answers a clean 404 envelope for %s %s and does no work', async (method, url) => {
      const http = request(app.getHttpServer());
      const req = method === 'GET' ? http.get(url) : method === 'POST' ? http.post(url).send({ codeChallenge: CH }) : http.put(url).send({ selected: [], enabled: true });
      const res = await req.expect(404);
      expect(res.body).toEqual({ success: false, message: 'Not found', code: 404, data: null });
      expect(svc.listCalendars).not.toHaveBeenCalled();
      expect(svc.updateSelection).not.toHaveBeenCalled();
      expect(svc.feed).not.toHaveBeenCalled();
      expect(lifecycle.beginNarrow).not.toHaveBeenCalled();
      expect(lifecycle.disconnectPreview).not.toHaveBeenCalled();
      expect(write.setWriteEnabled).not.toHaveBeenCalled();
      expect(publish.migrateLegacy).not.toHaveBeenCalled();
    });
  });

  describe('PUT /write', () => {
    beforeEach(() => boot(true));

    it('enables write for the caller and returns the state with no consent URL', async () => {
      const res = await request(app.getHttpServer()).put(`${base}/write`).send({ enabled: true }).expect(200);
      expect(res.body).toEqual({ success: true, message: 'OK', code: 200, data: { enabled: true, consentUrl: null } });
      expect(write.setWriteEnabled).toHaveBeenCalledWith('user-7', true, undefined);
    });

    it('returns the API start URL when the extra permission is still missing', async () => {
      write.setWriteEnabled.mockResolvedValueOnce({ enabled: false, consentUrl: 'https://api.test/start?ticket=t-1' });
      const res = await request(app.getHttpServer()).put(`${base}/write`).send({ enabled: true }).expect(200);
      expect(res.body.data).toEqual({ enabled: false, consentUrl: 'https://api.test/start?ticket=t-1' });
    });

    it('passes the PKCE challenge through for the consent and rejects a malformed one', async () => {
      await request(app.getHttpServer()).put(`${base}/write`).send({ enabled: true, codeChallenge: CH }).expect(200);
      expect(write.setWriteEnabled).toHaveBeenCalledWith('user-7', true, CH);
      await request(app.getHttpServer()).put(`${base}/write`).send({ enabled: true, codeChallenge: 'x' }).expect(400);
    });

    it('turns write off', async () => {
      write.setWriteEnabled.mockResolvedValueOnce({ enabled: false, consentUrl: null });
      await request(app.getHttpServer()).put(`${base}/write`).send({ enabled: false }).expect(200);
      expect(write.setWriteEnabled).toHaveBeenCalledWith('user-7', false, undefined);
    });

    it.each([[{}], [{ enabled: 'yes' }], [{ enabled: 1 }]])('rejects a body without a boolean enabled: %j', async (body) => {
      const res = await request(app.getHttpServer()).put(`${base}/write`).send(body).expect(400);
      expect(res.body).toMatchObject({ success: false, code: 400 });
      expect(write.setWriteEnabled).not.toHaveBeenCalled();
    });

    it('requires a valid PKCE challenge before anything is paused or revoked', async () => {
      for (const body of [{}, { codeChallenge: 'short' }]) {
        await request(app.getHttpServer()).post(`${base}/narrow`).send(body).expect(400);
      }
      expect(lifecycle.beginNarrow).not.toHaveBeenCalled();
    });

    it('passes a domain conflict through and hides a provider failure behind a stable 502', async () => {
      write.setWriteEnabled.mockRejectedValueOnce(ApiException.conflict('Narrow the Google permissions first'));
      await request(app.getHttpServer()).put(`${base}/write`).send({ enabled: true }).expect(409);

      write.setWriteEnabled.mockRejectedValueOnce(new Error('boom ya29.secret-token-value'));
      const res = await request(app.getHttpServer()).put(`${base}/write`).send({ enabled: true }).expect(502);
      expect(res.body).toEqual({ success: false, message: 'Could not update the write setting', code: 502, data: null });
    });
  });

  describe('POST /write/migrate-legacy', () => {
    beforeEach(() => boot(true));

    it('publishes the caller\'s existing items on request and returns the counts', async () => {
      const res = await request(app.getHttpServer()).post(`${base}/write/migrate-legacy`).expect(200);
      expect(res.body).toEqual({
        success: true,
        message: 'OK',
        code: 200,
        data: { published: 2, skipped: 1, failed: 0, remaining: 0 },
      });
      expect(publish.migrateLegacy).toHaveBeenCalledWith('user-7');
    });

    it('passes the not-enabled conflict through and hides a provider failure behind a stable 502', async () => {
      publish.migrateLegacy.mockRejectedValueOnce(ApiException.conflict('Writing to Google Calendar is not enabled'));
      await request(app.getHttpServer()).post(`${base}/write/migrate-legacy`).expect(409);

      publish.migrateLegacy.mockRejectedValueOnce(new Error('boom'));
      const res = await request(app.getHttpServer()).post(`${base}/write/migrate-legacy`).expect(502);
      expect(res.body.message).toBe('Could not move the events to the new calendar');
    });
  });

  describe('POST /narrow', () => {
    beforeEach(() => boot(true));

    it('returns the API start URL with the ticket in the success envelope for the caller', async () => {
      const res = await request(app.getHttpServer()).post(`${base}/narrow`).send({ codeChallenge: CH }).expect(200);
      expect(res.body).toEqual({
        success: true,
        message: 'OK',
        code: 200,
        data: { url: 'https://api.test/api/integrations/google-calendar/start?ticket=ticket-9' },
      });
      expect(lifecycle.beginNarrow).toHaveBeenCalledWith('user-7', CH);
    });

    it('requires a valid PKCE challenge before anything is paused or revoked', async () => {
      for (const body of [{}, { codeChallenge: 'short' }]) {
        await request(app.getHttpServer()).post(`${base}/narrow`).send(body).expect(400);
      }
      expect(lifecycle.beginNarrow).not.toHaveBeenCalled();
    });

    it('passes a domain conflict through and hides a provider failure behind a stable 502', async () => {
      lifecycle.beginNarrow.mockRejectedValueOnce(ApiException.conflict('Google Calendar permissions are already narrowed'));
      const conflict = await request(app.getHttpServer()).post(`${base}/narrow`).send({ codeChallenge: CH }).expect(409);
      expect(conflict.body).toMatchObject({ success: false, code: 409 });

      lifecycle.beginNarrow.mockRejectedValueOnce(new Error('boom ya29.secret-token-value'));
      const res = await request(app.getHttpServer()).post(`${base}/narrow`).send({ codeChallenge: CH }).expect(502);
      expect(res.body).toEqual({ success: false, message: 'Could not start the permission change', code: 502, data: null });
    });
  });

  describe('GET /disconnect-preview', () => {
    beforeEach(() => boot(true));

    it('returns the legacy copy count of the caller in the success envelope', async () => {
      const res = await request(app.getHttpServer()).get(`${base}/disconnect-preview`).expect(200);
      expect(res.body).toEqual({ success: true, message: 'OK', code: 200, data: { legacyCopyCount: 3 } });
      expect(lifecycle.disconnectPreview).toHaveBeenCalledWith('user-7');
    });
  });

  describe('GET /calendars', () => {
    beforeEach(() => boot(true));

    it('returns the success envelope with the calendars of the caller', async () => {
      const calendars = [
        {
          id: 'cal-1',
          summary: 'Work',
          backgroundColor: '#112233',
          accessRole: 'owner',
          primary: true,
          selected: true,
          managed: false,
        },
      ];
      svc.listCalendars.mockResolvedValue(calendars);
      const res = await request(app.getHttpServer()).get(`${base}/calendars`).expect(200);
      expect(res.body).toEqual({ success: true, message: 'OK', code: 200, data: calendars });
      expect(svc.listCalendars).toHaveBeenCalledWith('user-7');
    });

    it('maps a Google failure to a stable error envelope without leaking its message', async () => {
      svc.listCalendars.mockRejectedValue(new Error('boom ya29.secret-token-value'));
      const res = await request(app.getHttpServer()).get(`${base}/calendars`).expect(502);
      expect(res.body).toEqual({
        success: false,
        message: 'Could not read the Google calendar list',
        code: 502,
        data: null,
      });
    });

    it('passes an ApiException (for example not connected) through unchanged', async () => {
      svc.listCalendars.mockRejectedValue(ApiException.notFound('Google Calendar is not connected'));
      const res = await request(app.getHttpServer()).get(`${base}/calendars`).expect(404);
      expect(res.body).toMatchObject({ success: false, message: 'Google Calendar is not connected', code: 404 });
    });
  });

  describe('PUT /calendars/selection', () => {
    beforeEach(() => boot(true));
    const put = (body: unknown) => request(app.getHttpServer()).put(`${base}/calendars/selection`).send(body as object);

    it('applies the selection for the caller and returns the envelope', async () => {
      svc.updateSelection.mockResolvedValue({ selected: ['a', 'b'] });
      const res = await put({ selected: ['a', 'b'] }).expect(200);
      expect(res.body).toEqual({ success: true, message: 'OK', code: 200, data: { selected: ['a', 'b'] } });
      expect(svc.updateSelection).toHaveBeenCalledWith('user-7', ['a', 'b']);
    });

    it('accepts an empty selection (deselect everything)', async () => {
      await put({ selected: [] }).expect(200);
      expect(svc.updateSelection).toHaveBeenCalledWith('user-7', []);
    });

    it.each([
      ['a missing body', {}],
      ['a non-array', { selected: 'a' }],
      ['non-string items', { selected: [1] }],
      ['an empty id', { selected: [''] }],
      ['an over-long id', { selected: ['x'.repeat(256)] }],
      ['duplicates', { selected: ['a', 'a'] }],
      ['too many ids', { selected: Array.from({ length: 251 }, (_, i) => `c${i}`) }],
    ])('rejects %s with a 400 envelope and does nothing', async (_label, body) => {
      const res = await put(body).expect(400);
      expect(res.body).toMatchObject({ success: false, code: 400, data: null });
      expect(svc.updateSelection).not.toHaveBeenCalled();
    });

    it('maps an unexpected failure to a generic 502 envelope', async () => {
      svc.updateSelection.mockRejectedValue(new Error('connection refused to 10.0.0.1'));
      const res = await put({ selected: ['a'] }).expect(502);
      expect(res.body).toEqual({
        success: false,
        message: 'Could not update the calendar selection',
        code: 502,
        data: null,
      });
    });
  });

  describe('GET /events', () => {
    beforeEach(() => boot(true));
    const get = (qs: string) => request(app.getHttpServer()).get(`${base}/events${qs}`);

    it('returns events and hidden legacy item ids in the envelope, dates as ISO strings', async () => {
      svc.feed.mockResolvedValue({
        events: [
          {
            id: '1',
            subscriptionId: '9',
            googleEventId: 'g1',
            recurringEventId: null,
            title: 'Standup',
            allDay: false,
            startAt: new Date('2026-06-02T09:00:00Z'),
            endAt: new Date('2026-06-02T09:30:00Z'),
            startDate: null,
            endDateExclusive: null,
            status: 'confirmed',
            htmlLink: null,
          },
        ],
        hiddenLegacyItemIds: ['42'],
      });
      const res = await get('?from=2026-06-01T00:00:00Z&to=2026-06-10T00:00:00Z').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hiddenLegacyItemIds).toEqual(['42']);
      expect(res.body.data.events[0]).toMatchObject({
        id: '1',
        subscriptionId: '9',
        googleEventId: 'g1',
        title: 'Standup',
        allDay: false,
        startAt: '2026-06-02T09:00:00.000Z',
        endAt: '2026-06-02T09:30:00.000Z',
        startDate: null,
        endDateExclusive: null,
        status: 'confirmed',
      });
      const [owner, from, to] = svc.feed.mock.calls[0];
      expect(owner).toBe('user-7');
      expect((from as Date).toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect((to as Date).toISOString()).toBe('2026-06-10T00:00:00.000Z');
    });

    it.each([
      ['no params', ''],
      ['no to', '?from=2026-06-01T00:00:00Z'],
      ['a malformed from', '?from=yesterday&to=2026-06-10T00:00:00Z'],
      ['an inverted range', '?from=2026-06-10T00:00:00Z&to=2026-06-01T00:00:00Z'],
      ['a range over 100 days', '?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z'],
    ])('rejects %s with a 400 envelope', async (_label, qs) => {
      const res = await get(qs).expect(400);
      expect(res.body).toMatchObject({ success: false, code: 400, data: null });
      expect(svc.feed).not.toHaveBeenCalled();
    });

    it('returns a stable error envelope when the feed fails, without leaking the cause', async () => {
      svc.feed.mockRejectedValue(new Error('relation "google_calendar_event" does not exist'));
      const res = await get('?from=2026-06-01T00:00:00Z&to=2026-06-10T00:00:00Z').expect(502);
      expect(res.body).toEqual({
        success: false,
        message: 'Google Calendar events are unavailable',
        code: 502,
        data: null,
      });
    });
  });
});
