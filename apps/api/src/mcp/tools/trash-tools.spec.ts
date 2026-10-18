import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTrashTools } from './trash-tools';
import { ApiException } from '../../common/api.exception';

describe('trash-tools: list_deleted', () => {
  let server: McpServer;
  let trashService: { list: jest.Mock };

  const auth = (scopes: string[]) => ({ authInfo: { scopes, extra: { ownerId: 'u1' } } });
  const handler = () => (server as any)._registeredTools['list_deleted'].handler;
  const parse = (res: any) => JSON.parse(res.content[0].text);

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    trashService = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    registerTrashTools(server, { trashService: trashService as never });
  });

  it('is registered with a name that is neither a delete nor a generate tool', () => {
    const names = Object.keys((server as any)._registeredTools);
    expect(names).toEqual(['list_deleted']);
  });

  it('rejects without auth before touching the input', async () => {
    await expect(handler()({ kind: 'bogus', limit: 0 }, {})).rejects.toThrow(
      'Unauthorized: missing owner context',
    );
    expect(trashService.list).not.toHaveBeenCalled();
  });

  it('rejects with empty scopes before touching the input', async () => {
    await expect(handler()({ kind: 'bogus', limit: 0 }, auth([]))).rejects.toThrow(
      'Forbidden: missing required scope',
    );
    expect(trashService.list).not.toHaveBeenCalled();
  });

  it('rejects a token with no trash-readable scope at all', async () => {
    await expect(handler()({}, auth(['notes:read', 'sport:read']))).rejects.toThrow('Forbidden');
    expect(trashService.list).not.toHaveBeenCalled();
  });

  it('with no kind requested, silently drops the kinds the token cannot read', async () => {
    await handler()({}, auth(['calendar:read']));
    expect(trashService.list).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ kinds: ['calendar_event'] }),
    );

    trashService.list.mockClear();
    await handler()({}, auth(['items:read']));
    expect(trashService.list).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ kinds: ['reminder', 'reminder_list'] }),
    );

    trashService.list.mockClear();
    await handler()({}, auth(['projects:read', 'goals:read']));
    expect(trashService.list).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ kinds: ['task', 'project', 'goal'] }),
    );
  });

  it('maps every kind to its read scope (reminders accept reminders:read or items:read)', async () => {
    const cases: Array<[string, string]> = [
      ['task', 'projects:read'],
      ['project', 'projects:read'],
      ['calendar_event', 'calendar:read'],
      ['reminder', 'reminders:read'],
      ['reminder_list', 'reminders:read'],
      ['reminder', 'items:read'],
      ['reminder_list', 'items:read'],
      ['goal', 'goals:read'],
    ];
    for (const [kind, scope] of cases) {
      trashService.list.mockClear();
      await handler()({ kind }, auth([scope]));
      expect(trashService.list).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ kinds: [kind] }),
      );
    }
  });

  it('throws Forbidden when a kind is explicitly requested without its scope', async () => {
    await expect(handler()({ kind: 'goal' }, auth(['calendar:read']))).rejects.toThrow(
      "Forbidden: missing required scope 'goals:read'",
    );
    await expect(
      handler()({ kind: ['calendar_event', 'task'] }, auth(['calendar:read'])),
    ).rejects.toThrow("Forbidden: missing required scope 'projects:read'");
    expect(trashService.list).not.toHaveBeenCalled();
  });

  it('accepts a single kind or an array and forwards since, limit and cursor', async () => {
    await handler()(
      { kind: ['task', 'goal'], since: '2026-03-01T00:00:00.000Z', limit: 7, cursor: 'abc' },
      auth(['projects:read', 'goals:read']),
    );
    expect(trashService.list).toHaveBeenCalledWith('u1', {
      kinds: ['task', 'goal'],
      since: '2026-03-01T00:00:00.000Z',
      limit: 7,
      cursor: 'abc',
    });
  });

  it('defaults limit to 20 and returns a tool error for an invalid limit, since or kind', async () => {
    await handler()({}, auth(['goals:read']));
    expect(trashService.list).toHaveBeenCalledWith('u1', expect.objectContaining({ limit: 20 }));

    for (const bad of [
      { limit: 0 },
      { limit: 101 },
      { limit: 2.5 },
      { since: 'yesterday' },
      { kind: 'note' },
    ]) {
      trashService.list.mockClear();
      const res = await handler()(bad, auth(['goals:read']));
      expect(res.isError).toBe(true);
      expect(trashService.list).not.toHaveBeenCalled();
    }
  });

  it('turns a service ApiException (e.g. malformed cursor) into a tool error', async () => {
    trashService.list.mockRejectedValueOnce(ApiException.badRequest('Invalid cursor'));
    const res = await handler()({ cursor: 'zzz' }, auth(['goals:read']));
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe('Invalid cursor');
  });

  it('returns items with restore hints and redacts secret-looking titles', async () => {
    trashService.list.mockResolvedValueOnce({
      items: [
        {
          kind: 'goal',
          id: '1',
          title: 'Ship the trash screen',
          deletedAt: '2026-03-01T10:00:00.000Z',
          projectId: null,
          projectName: null,
          restoreTool: 'restore_goal',
          restorePath: '/goals/1/restore',
        },
        {
          kind: 'task',
          id: '2',
          title: 'prod api_key: sk-abcdefghijklmnopqrstuvwxyz',
          deletedAt: '2026-03-01T09:00:00.000Z',
          projectId: '7',
          projectName: 'Apollo',
          restoreTool: 'restore_task',
          restorePath: '/tasks/2/restore',
        },
      ],
      nextCursor: 'next',
    });

    const out = parse(await handler()({}, auth(['projects:read', 'goals:read'])));

    expect(out.nextCursor).toBe('next');
    expect(out.items[0]).toMatchObject({
      title: 'Ship the trash screen',
      restoreTool: 'restore_goal',
    });
    expect(out.items[1].title).toBe('[redacted]');
    expect(out.items[1]).toMatchObject({
      id: '2',
      restorePath: '/tasks/2/restore',
      projectName: 'Apollo',
    });
    expect(JSON.stringify(out)).not.toContain('sk-abcdef');
  });

  it('redacts a secret-looking project name, not only the title', async () => {
    trashService.list.mockResolvedValueOnce({
      items: [
        {
          kind: 'task',
          id: '3',
          title: 'Plain task title',
          deletedAt: '2026-03-01T09:00:00.000Z',
          projectId: '9',
          projectName: 'prod api_key: sk-zyxwvutsrqponmlkjihgfedcba',
          restoreTool: 'restore_task',
          restorePath: '/tasks/3/restore',
        },
      ],
      nextCursor: null,
    });

    const res = await handler()({}, auth(['projects:read']));
    const out = parse(res);

    expect(out.items[0].title).toBe('Plain task title');
    expect(out.items[0].projectName).toBe('[redacted]');
    expect(JSON.stringify(out)).not.toContain('sk-zyxw');
  });
});
