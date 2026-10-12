import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCaptureTool } from './capture-tool';
import { ApiException } from '../../common/api.exception';
import * as parser from '@husrevity/parser';

describe('capture tool', () => {
  let server: McpServer;
  let itemService: any;
  let changeSetService: any;

  const fakeManager = { mock: 'manager' };
  // 2026-10-13 13:00 in Istanbul (UTC+3), a Tuesday
  const NOW_MS = Date.parse('2026-10-13T10:00:00.000Z');

  const auth = (scopes: string[] = ['items:write']) => ({
    authInfo: { scopes, extra: { ownerId: 'u1' } },
  });
  const getHandler = () => (server as any)._registeredTools['capture']?.handler;
  const call = (params: any, scopes?: string[]) => getHandler()(params, auth(scopes));
  const parse = (res: any) => JSON.parse(res.content[0].text);

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    server = new McpServer({ name: 'test', version: '1.0.0' });
    itemService = {
      create: jest.fn(async (_owner: string, req: any) => ({
        id: '101',
        kind: req.kind,
        title: req.title,
        notes: req.notes ?? null,
        context: req.context ?? null,
        projectId: req.projectId ?? null,
        scheduledAt: req.scheduledAt ?? null,
        dueAt: req.dueAt ?? null,
        durationMin: req.durationMin ?? null,
        rrule: req.rrule ?? null,
        status: 'open',
        updatedAt: '2026-10-13T10:00:00.000Z',
      })),
    };
    changeSetService = {
      runWithChangeSet: jest.fn(async (_owner: string, _meta: any, fn: any) => {
        const result = await fn('cs-1', fakeManager);
        return { result, changeSetId: 'cs-1' };
      }),
      recordEntry: jest.fn().mockResolvedValue({}),
    };
    registerCaptureTool(server, { itemService, changeSetService } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is registered under the name capture', () => {
    expect(getHandler()).toBeDefined();
  });

  describe('text only', () => {
    it('runs the shared quick-add parser and creates a native task in one change set', async () => {
      const res = await call({ text: 'yarın 9da HGS kontrol' });

      expect(res.isError).toBeUndefined();
      expect(changeSetService.runWithChangeSet).toHaveBeenCalledTimes(1);
      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        { source: 'mcp', label: 'capture: HGS kontrol' },
        expect.any(Function),
      );
      expect(itemService.create).toHaveBeenCalledTimes(1);
      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          kind: 'task',
          title: 'HGS kontrol',
          scheduledAt: '2026-10-14T06:00:00.000Z',
          notifyMinutesBefore: 0,
          source: 'mcp',
        }),
        fakeManager,
      );
      expect(changeSetService.recordEntry).toHaveBeenCalledTimes(1);
      expect(changeSetService.recordEntry).toHaveBeenCalledWith(
        'cs-1',
        'u1',
        expect.objectContaining({
          targetType: 'item',
          targetId: '101',
          op: 'create',
          before: null,
          after: expect.objectContaining({ title: 'HGS kontrol' }),
        }),
        fakeManager,
      );
    });

    it('returns the item, an interpretation and the change set id', async () => {
      const parsed = parse(await call({ text: 'yarın 9da HGS kontrol' }));

      expect(parsed.item).toEqual(
        expect.objectContaining({
          id: '101',
          kind: 'task',
          title: 'HGS kontrol',
          scheduledAt: '2026-10-14T06:00:00.000Z',
          dueAt: null,
          durationMin: null,
        }),
      );
      expect(parsed.changeSetId).toBe('cs-1');
      expect(typeof parsed.interpretation).toBe('string');
      expect(parsed.interpretation).toContain('HGS kontrol');
      expect(parsed.interpretation).toContain('2026-10-14 09:00');
    });

    it('creates an unscheduled task without a notification when no time is recognised', async () => {
      await call({ text: 'Kitap oku' });

      const req = itemService.create.mock.calls[0][1];
      expect(req.title).toBe('Kitap oku');
      expect(req.scheduledAt).toBeUndefined();
      expect(req.notifyMinutesBefore).toBeUndefined();
    });

    it('keeps a recognised recurrence and says so in the interpretation', async () => {
      const parsed = parse(await call({ text: 'her gün 7de koşu' }));

      const req = itemService.create.mock.calls[0][1];
      expect(req.rrule).toEqual(expect.stringContaining('FREQ=DAILY'));
      expect(parsed.interpretation).toMatch(/recur/i);
    });

    it('refuses a recurring item without a start time (L4)', async () => {
      jest.spyOn(parser, 'parseQuickAdd').mockResolvedValueOnce({
        title: 'spor',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
      } as any);

      const res = await call({ text: 'her pazartesi spor' });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toBe(
        "a recurring item needs a start time, e.g. 'every Monday at 09:00'",
      );
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it('allows a recurring item if scheduledAt is explicitly supplied as override', async () => {
      jest.spyOn(parser, 'parseQuickAdd').mockResolvedValueOnce({
        title: 'spor',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
      } as any);

      const res = await call({
        text: 'her pazartesi spor',
        scheduledAt: '2026-10-19T09:00:00+03:00',
      });
      expect(res.isError).toBeUndefined();
      expect(itemService.create).toHaveBeenCalled();
    });

    it('passes the #context tag from the text', async () => {
      await call({ text: 'fatura öde #ev' });
      expect(itemService.create.mock.calls[0][1]).toEqual(
        expect.objectContaining({ title: 'fatura öde', context: 'ev' }),
      );
    });

    it('reports a recognised but unresolved @project reference instead of guessing', async () => {
      const parsed = parse(await call({ text: 'rapor yaz @alican' }));

      expect(itemService.create.mock.calls[0][1].projectId).toBeUndefined();
      expect(parsed.interpretation).toContain('@alican');
      expect(parsed.interpretation).toContain('projectId');
    });
  });

  describe('structured overrides', () => {
    it('lets explicit fields win over the parsed text', async () => {
      await call({
        text: 'yarın 9da HGS kontrol #ev',
        kind: 'event',
        title: 'Dentist',
        notes: 'bring the card',
        scheduledAt: '2026-10-20T15:00:00+03:00',
        dueAt: '2026-10-21T12:00:00+03:00',
        durationMin: 45,
        projectId: '5',
        context: 'health',
      });

      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          kind: 'event',
          title: 'Dentist',
          notes: 'bring the card',
          scheduledAt: '2026-10-20T12:00:00.000Z',
          dueAt: '2026-10-21T09:00:00.000Z',
          durationMin: 45,
          projectId: '5',
          context: 'health',
        }),
        fakeManager,
      );
    });

    it('interprets a datetime without an offset as Istanbul time', async () => {
      await call({ text: 'toplantı', scheduledAt: '2026-10-20T15:00' });
      expect(itemService.create.mock.calls[0][1].scheduledAt).toBe('2026-10-20T12:00:00.000Z');
    });

    it('does not notify for a log item even when it has a time', async () => {
      await call({ text: 'koşu yaptım', kind: 'log', scheduledAt: '2026-10-13T08:00:00+03:00' });
      expect(itemService.create.mock.calls[0][1].notifyMinutesBefore).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it.each(['', '   ', '\n\t'])(
      'returns a tool error for blank text %j without writing',
      async (text) => {
        const res = await call({ text });

        expect(res.isError).toBe(true);
        expect(parse(res).error).toMatch(/text/i);
        expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
        expect(itemService.create).not.toHaveBeenCalled();
      },
    );

    it('returns a tool error for text longer than 2000 characters', async () => {
      const res = await call({ text: 'a'.repeat(2001) });
      expect(res.isError).toBe(true);
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it('returns a tool error when text is missing or not a string', async () => {
      expect((await call({})).isError).toBe(true);
      expect((await call({ text: 42 })).isError).toBe(true);
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it.each([
      [{ projectId: 'abc' }, /projectId/],
      [{ projectId: '9999999999999999999' }, /projectId/],
      [{ scheduledAt: 'garbage' }, /scheduledAt/],
      [{ dueAt: '2026-13-45' }, /dueAt/],
      [{ durationMin: -5 }, /durationMin/],
      [{ durationMin: 1.5 }, /durationMin/],
      [{ kind: 'reminder' }, /kind/],
      [{ title: 'x'.repeat(256) }, /title/],
      [{ context: 'c'.repeat(33) }, /context/],
    ])('returns a tool error for invalid override %j', async (override, pattern) => {
      const res = await call({ text: 'toplantı', ...override });

      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(pattern);
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it('moves an over-long derived title into the notes instead of failing', async () => {
      const long = 'uzun '.repeat(80).trim();
      await call({ text: long });

      const req = itemService.create.mock.calls[0][1];
      expect(req.title.length).toBeLessThanOrEqual(255);
      expect(req.title.endsWith('…')).toBe(true);
      expect(req.notes).toBe(long);
    });

    it('accepts and passes numeric goalId, rejecting malformed goalId', async () => {
      const badRes = await call({ text: 'görev', goalId: 'bad_id' }, [
        'items:write',
        'goals:write',
      ]);
      expect(badRes.isError).toBe(true);
      expect(parse(badRes).error).toMatch(/goalId must be a numeric ID/);

      const goodRes = await call({ text: 'görev', goalId: '555' }, ['items:write', 'goals:write']);
      expect(goodRes.isError).toBeUndefined();
      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ goalId: '555' }),
        expect.anything(),
      );
    });
  });

  describe('credential-looking text', () => {
    it.each([
      [{ text: 'password: hunter2' }],
      [{ text: 'bunu kaydet', notes: 'api key: sk-abc123def456' }],
      [{ text: 'bunu kaydet', title: 'şifre: kedi123' }],
      [{ text: 'bunu kaydet', context: 'password: 123' }],
      [{ text: 'bunu kaydet', title: 'wifi password', notes: 'hunter2' }],
      [{ text: 'pw: hunter2' }],
      [{ text: 'credentials: user admin pass Xk9!mQ2z' }],
      [{ text: 'pin: 4821' }],
      [{ text: 'passphrase=abc' }],
      [{ text: 'bunu kaydet 4a8b16c32d64e128f256a512b1024c20' }],
    ])('refuses %j and writes nothing', async (params) => {
      const res = await call(params);

      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/secret/i);
      expect(parse(res).error).toMatch(/not stored through MCP/i);
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it.each([
      'Pay the electricity bill',
      'buy a bus ticket token for Friday',
      'password manager review',
      'ProjectPlanReviewMeeting',
    ])('allows ordinary phrase %j', async (phrase) => {
      const res = await call({ text: phrase });
      expect(res.isError).toBeUndefined();
      expect(itemService.create).toHaveBeenCalled();
    });

    it('does not echo the refused value back', async () => {
      const res = await call({ text: 'password: hunter2' });
      expect(res.content[0].text).not.toContain('hunter2');
    });
  });

  describe('failures from the service layer', () => {
    it('turns an ApiException into a tool error and records nothing', async () => {
      itemService.create.mockRejectedValueOnce(ApiException.forbidden('No access to project'));

      const res = await call({ text: 'görev', projectId: '77' });

      expect(res.isError).toBe(true);
      expect(parse(res).error).toBe('No access to project');
      expect(changeSetService.recordEntry).not.toHaveBeenCalled();
    });

    it('rethrows unexpected errors', async () => {
      itemService.create.mockRejectedValueOnce(new Error('boom'));
      await expect(call({ text: 'görev' })).rejects.toThrow('boom');
    });
  });

  describe('scopes', () => {
    it('rejects without auth context', async () => {
      await expect(getHandler()({ text: 'x' }, {})).rejects.toThrow(
        'Unauthorized: missing owner context',
      );
    });

    it('rejects without items:write', async () => {
      await expect(call({ text: 'x' }, ['items:read'])).rejects.toThrow(
        "Forbidden: missing required scope 'items:write'",
      );
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it('rejects without goals:write when goalId is provided', async () => {
      await expect(call({ text: 'Task', goalId: '10' }, ['items:write'])).rejects.toThrow(
        "Forbidden: missing required scope 'goals:write'",
      );
      await expect(call({ text: 'Task', goalId: null }, ['items:write'])).rejects.toThrow(
        "Forbidden: missing required scope 'goals:write'",
      );
    });

    it('allows goalId when both items:write and goals:write scopes are present', async () => {
      const res = await call({ text: 'Task with goal', goalId: '10' }, [
        'items:write',
        'goals:write',
      ]);
      expect(res.isError).toBeUndefined();
      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ goalId: '10' }),
        fakeManager,
      );
    });
  });
});
