import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPlanTool, PlanToolDeps } from './plan-tool';
import { ApiException } from '../../common/api.exception';

describe('apply_plan tool', () => {
  let server: McpServer;
  let itemService: any;
  let changeSetService: any;

  const fakeManager = { mock: 'manager' };
  // 2026-10-14 10:00 Istanbul (UTC+3, Wednesday)
  const NOW_MS = Date.parse('2026-10-14T07:00:00.000Z');

  const auth = (scopes: string[] = ['items:write']) => ({
    authInfo: { scopes, extra: { ownerId: 'u1' } },
  });
  const getHandler = () => (server as any)._registeredTools['apply_plan']?.handler;
  const call = (params: any = {}, scopes?: string[]) => getHandler()(params, auth(scopes));
  const parse = (res: any) => JSON.parse(res.content[0].text);

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    server = new McpServer({ name: 'test', version: '1.0.0' });

    itemService = {
      create: jest.fn(async (_owner: string, req: any) => ({
        id: '101',
        kind: req.kind ?? 'task',
        title: req.title,
        notes: req.notes ?? null,
        context: req.context ?? null,
        projectId: req.projectId ?? null,
        scheduledAt: req.scheduledAt ? new Date(req.scheduledAt) : null,
        dueAt: req.dueAt ? new Date(req.dueAt) : null,
        durationMin: req.durationMin ?? null,
        rrule: req.rrule ?? null,
        status: 'open',
        updatedAt: new Date(),
      })),
      get: jest.fn(async (_owner: string, id: string) => {
        if (id === '999') throw ApiException.notFound('Item not found');
        if (id === '888') throw ApiException.forbidden('Forbidden');
        if (id === '80') {
          return {
            id: '80',
            kind: 'task',
            title: 'Shared Viewer Task',
            notes: null,
            context: null,
            projectId: '88',
            scheduledAt: null,
            dueAt: null,
            durationMin: 30,
            rrule: null,
            status: 'open',
            updatedAt: new Date(),
          };
        }
        if (id === '90') {
          return {
            id: '90',
            kind: 'task',
            title: 'Recurring Daily Task',
            notes: null,
            context: null,
            projectId: null,
            scheduledAt: new Date('2026-10-14T04:00:00.000Z'),
            dueAt: null,
            durationMin: 30,
            rrule: 'FREQ=DAILY',
            status: 'open',
            updatedAt: new Date(),
          };
        }
        return {
          id,
          kind: 'task',
          title: `Item ${id}`,
          notes: null,
          context: null,
          projectId: null,
          scheduledAt: id === '70' ? new Date('2026-10-14T11:00:00.000Z') : null,
          dueAt: null,
          durationMin: 30,
          rrule: null,
          status: 'open',
          updatedAt: new Date(),
        };
      }),
      update: jest.fn(async (_owner: string, id: string, req: any) => ({
        id,
        kind: 'task',
        title: req.title ?? `Item ${id}`,
        notes: req.notes ?? null,
        scheduledAt: req.scheduledAt ? new Date(req.scheduledAt) : null,
        dueAt: req.dueAt ? new Date(req.dueAt) : null,
        durationMin: req.durationMin ?? null,
        status: req.status ?? 'open',
        updatedAt: new Date(),
      })),
      completeWithDetails: jest.fn(async (_owner: string, id: string) => ({
        item: {
          id,
          kind: 'task',
          title: `Item ${id}`,
          status: 'done',
          updatedAt: new Date(),
        },
      })),
      findOccurrence: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([
        {
          id: '200',
          title: 'Existing Dentist',
          scheduledAt: '2026-10-14T11:00:00.000Z', // 14:00 Istanbul
          durationMin: 60,
          status: 'open',
        },
      ]),
    };

    const projectAccessService: any = {
      requireAccess: jest.fn(
        async (_userId: string, projectId: string, minRole: string = 'VIEWER') => {
          if (projectId === '999') {
            throw ApiException.notFound('Project not found');
          }
          if (projectId === '88' && minRole === 'EDITOR') {
            throw ApiException.forbidden('You do not have permission to do this in this project');
          }
          return { project: { id: projectId }, role: 'EDITOR' };
        },
      ),
    };

    changeSetService = {
      runWithChangeSet: jest.fn(async (_owner: string, _meta: any, fn: any) => {
        const result = await fn('cs-10', fakeManager);
        return { result, changeSetId: 'cs-10' };
      }),
      recordEntry: jest.fn().mockResolvedValue({}),
    };

    const deps: PlanToolDeps = {
      itemService,
      changeSetService,
      projectAccessService,
    };
    registerPlanTool(server, deps);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is registered under the name apply_plan', () => {
    expect(getHandler()).toBeDefined();
  });

  describe('scopes and auth', () => {
    it('rejects without auth context', async () => {
      await expect(getHandler()({}, {})).rejects.toThrow('Unauthorized: missing owner context');
    });

    it('rejects without items:write scope', async () => {
      await expect(call({}, ['items:read'])).rejects.toThrow(
        "Forbidden: missing required scope 'items:write'",
      );
    });
  });

  describe('validation before writes', () => {
    it.each(['', '   ', null, undefined])(
      'rejects missing or blank label %j without writing',
      async (label) => {
        const res = await call({
          label,
          operations: [{ op: 'create', title: 'Task 1' }],
        });
        expect(res.isError).toBe(true);
        expect(parse(res).error).toMatch(/label/i);
        expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
      },
    );

    it.each([
      [],
      null,
      undefined,
      Array.from({ length: 51 }, () => ({ op: 'create', title: 't' })),
    ])('rejects operations array outside 1-50 (%j) without writing', async (operations) => {
      const res = await call({
        label: 'Plan',
        operations,
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/1 to 50 operations/i);
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
    });

    it('rejects unknown operation op', async () => {
      const res = await call({
        label: 'Plan',
        operations: [{ op: 'unknown_op', title: 'Task' }],
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/unknown operation/i);
    });

    it('rejects create operation missing title', async () => {
      const res = await call({
        label: 'Plan',
        operations: [{ op: 'create' }],
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/title is required/i);
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it.each(['abc', '12345678901234567890', '-5'])(
      'rejects invalid numeric id %j on update/delete/complete',
      async (badId) => {
        const res = await call({
          label: 'Plan',
          operations: [{ op: 'delete', id: badId }],
        });
        expect(res.isError).toBe(true);
        expect(parse(res).error).toMatch(/numeric ID/i);
        expect(itemService.delete).not.toHaveBeenCalled();
      },
    );

    it.each(['garbage', '2026-02-30', '2026-10-12T10:00'])(
      'rejects invalid occursOn %j as a normal per-operation validation error (M4)',
      async (badOccursOn) => {
        const res = await call({
          label: 'Plan',
          operations: [{ op: 'complete', id: '71', occursOn: badOccursOn }],
        });
        expect(res.isError).toBe(true);
        expect(parse(res).error).toMatch(/Operation #0 \(complete #71\):.*occursOn/i);
        expect(itemService.completeWithDetails).not.toHaveBeenCalled();
      },
    );

    it.each(['garbage', '2026-02-30', '2026-10-12T10:00'])(
      'rejects invalid occursOn %j in inputSchema (M4)',
      (badOccursOn) => {
        const tool = (server as any)._registeredTools['apply_plan'];
        const schema = tool.inputSchema.shape.operations.element.shape.occursOn;
        expect(schema.safeParse(badOccursOn).success).toBe(false);
      },
    );

    it('rejects credential-looking text anywhere in the plan', async () => {
      const res = await call({
        label: 'Plan',
        operations: [{ op: 'create', title: 'Task', notes: 'password: hunter2' }],
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/secret/i);
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
    });

    it('rejects secret in label (M1) before any other validation and never echoes the secret', async () => {
      const secret = 'hunter2';
      const res = await call({
        label: `wifi password: ${secret}`,
        operations: [{ op: 'create', title: 'Valid task' }],
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/secret/i);
      expect(parse(res).error).not.toContain(secret);
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it('rejects keyword in title with secret value in notes across fields (L1)', async () => {
      const res = await call({
        label: 'Normal plan label',
        operations: [{ op: 'create', title: 'wifi password', notes: 'hunter2' }],
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/secret/i);
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
    });

    it('fails the entire plan before any write if one operation is invalid', async () => {
      const res = await call({
        label: 'Plan',
        operations: [
          { op: 'create', title: 'Valid task' },
          { op: 'create' }, // missing title
        ],
      });
      expect(res.isError).toBe(true);
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it('rejects operations targeting non-existent or foreign items before any write', async () => {
      const res = await call({
        label: 'Plan',
        operations: [{ op: 'update', id: '999', title: 'New title' }],
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toMatch(/not found/i);
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
    });

    describe('validation mirroring execution (M3)', () => {
      it('rejects write operations on shared items where user only has VIEWER role in dryRun and live', async () => {
        for (const dryRun of [true, false]) {
          for (const op of ['update', 'complete', 'delete'] as const) {
            const res = await call({
              label: `Test ${op} on viewer item`,
              dryRun,
              operations: [
                op === 'complete' ? { op, id: '80' } : { op, id: '80', title: 'Try to modify' },
              ],
            });
            expect(res.isError).toBe(true);
            expect(parse(res).error).toMatch(
              new RegExp(`Operation #0 \\(${op} #80\\):.*permission`, 'i'),
            );
            expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
          }
        }
      });

      it('rejects foreign projectId on create and update in dryRun and live', async () => {
        for (const dryRun of [true, false]) {
          const createRes = await call({
            label: 'Create with foreign project',
            dryRun,
            operations: [{ op: 'create', title: 'Task in foreign project', projectId: '999' }],
          });
          expect(createRes.isError).toBe(true);
          expect(parse(createRes).error).toMatch(/Operation #0 \(create\):.*Project not found/i);
          expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();

          const updateRes = await call({
            label: 'Update with foreign project',
            dryRun,
            operations: [{ op: 'update', id: '70', projectId: '999' }],
          });
          expect(updateRes.isError).toBe(true);
          expect(parse(updateRes).error).toMatch(
            /Operation #0 \(update #70\):.*Project not found/i,
          );
          expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
        }
      });

      it('rejects completing a recurring item without occursOn in dryRun and live', async () => {
        for (const dryRun of [true, false]) {
          const res = await call({
            label: 'Complete recurring without occursOn',
            dryRun,
            operations: [{ op: 'complete', id: '90' }],
          });
          expect(res.isError).toBe(true);
          expect(parse(res).error).toMatch(/Operation #0 \(complete #90\):.*occursOn is required/i);
          expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
        }
      });

      it('rejects duplicate target id appearing in multiple operations and names the id', async () => {
        const res = await call({
          label: 'Plan with duplicate target id',
          operations: [
            { op: 'update', id: '70', title: 'First update' },
            { op: 'delete', id: '70' },
          ],
        });
        expect(res.isError).toBe(true);
        expect(parse(res).error).toMatch(/Operation #1 \(delete #70\):.*duplicate target id '70'/i);
        expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
        expect(itemService.update).not.toHaveBeenCalled();
        expect(itemService.delete).not.toHaveBeenCalled();
      });
    });
  });

  describe('dryRun mode', () => {
    it('validates, checks overlaps, and returns outcome with changeSetId: null without writing', async () => {
      const res = await call({
        label: 'Test Dry Run',
        dryRun: true,
        operations: [
          { op: 'create', title: 'New Task', scheduledAt: '2026-10-14T08:00:00.000Z' },
          { op: 'update', id: '70', title: 'Updated Title' },
        ],
      });

      expect(res.isError).toBeUndefined();
      const parsed = parse(res);
      expect(parsed.changeSetId).toBeNull();
      expect(parsed.operations).toHaveLength(2);
      expect(parsed.operations[0]).toEqual(expect.objectContaining({ op: 'create', status: 'ok' }));
      expect(parsed.operations[1]).toEqual(
        expect.objectContaining({ op: 'update', id: '70', status: 'ok' }),
      );
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
      expect(itemService.create).not.toHaveBeenCalled();
    });
  });

  describe('overlap warnings', () => {
    it('flags overlap between planned item and existing scheduled item', async () => {
      // Existing item 200 is 11:00Z - 12:00Z (14:00 - 15:00 Istanbul)
      // Planned item overlaps at 11:30Z (14:30 Istanbul)
      const res = await call({
        label: 'Plan with Overlap',
        operations: [
          {
            op: 'create',
            title: 'Overlapping Task',
            scheduledAt: '2026-10-14T11:30:00.000Z',
            durationMin: 30,
          },
        ],
      });

      expect(res.isError).toBeUndefined();
      const parsed = parse(res);
      expect(parsed.warnings).toHaveLength(1);
      expect(parsed.warnings[0].type).toBe('overlap');
      expect(parsed.warnings[0].message).toContain('Overlapping Task');
      expect(parsed.warnings[0].message).toContain('Existing Dentist');
    });

    it('does not flag adjacent windows (end == start)', async () => {
      // Existing item 200 is 11:00Z - 12:00Z
      // Planned item adjacent at 12:00Z
      const res = await call({
        label: 'Plan Adjacent',
        operations: [
          {
            op: 'create',
            title: 'Adjacent Task',
            scheduledAt: '2026-10-14T12:00:00.000Z',
            durationMin: 30,
          },
        ],
      });

      const parsed = parse(res);
      expect(parsed.warnings).toEqual([]);
    });

    it('treats null duration as 30 minutes for overlap warning check only', async () => {
      // Existing item 200 is 11:00Z - 12:00Z
      // Planned item starts at 11:45Z with duration null -> treated as 30m (until 12:15Z) -> overlaps!
      const res = await call({
        label: 'Plan Null Duration Overlap',
        operations: [
          {
            op: 'create',
            title: 'Null Duration Task',
            scheduledAt: '2026-10-14T11:45:00.000Z',
            durationMin: null,
          },
        ],
      });

      const parsed = parse(res);
      expect(parsed.warnings).toHaveLength(1);
      // But created item keeps null duration
      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ durationMin: null }),
        fakeManager,
      );
    });

    it('flags overlap for a daily 07:00 recurring item against tomorrow 07:00-07:30 planned slot (M2)', async () => {
      // Template created in January at 07:00 Istanbul (04:00 UTC)
      // Expanded occurrence for tomorrow 2026-10-15 has occursOn: '2026-10-15'
      itemService.list.mockResolvedValueOnce([
        {
          id: '300',
          title: 'Daily Morning Routine',
          scheduledAt: '2026-01-01T04:00:00.000Z', // 07:00 Istanbul
          occursOn: '2026-10-15',
          durationMin: 30,
          status: 'open',
        },
      ]);

      const res = await call({
        label: 'Plan Tomorrow Morning',
        operations: [
          {
            op: 'create',
            title: 'Planned Morning Run',
            scheduledAt: '2026-10-15T04:00:00.000Z', // 07:00 Istanbul
            durationMin: 30,
          },
        ],
      });

      expect(res.isError).toBeUndefined();
      const parsed = parse(res);
      expect(parsed.warnings).toHaveLength(1);
      expect(parsed.warnings[0].type).toBe('overlap');
      expect(parsed.warnings[0].message).toContain('Planned Morning Run');
      expect(parsed.warnings[0].message).toContain('Daily Morning Routine');
      expect(itemService.list).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ status: 'open' }),
      );
    });

    it('does not flag overlap for done or cancelled items (M2)', async () => {
      itemService.list.mockResolvedValueOnce([
        {
          id: '301',
          title: 'Completed Task',
          scheduledAt: '2026-10-15T04:00:00.000Z',
          durationMin: 30,
          status: 'done',
        },
        {
          id: '302',
          title: 'Cancelled Task',
          scheduledAt: '2026-10-15T04:00:00.000Z',
          durationMin: 30,
          status: 'cancelled',
        },
      ]);

      const res = await call({
        label: 'Plan Tomorrow Morning Slot',
        operations: [
          {
            op: 'create',
            title: 'Morning Meeting',
            scheduledAt: '2026-10-15T04:00:00.000Z',
            durationMin: 30,
          },
        ],
      });

      expect(res.isError).toBeUndefined();
      const parsed = parse(res);
      expect(parsed.warnings).toEqual([]);
    });
  });

  describe('execution and atomicity', () => {
    it('executes all operations in ONE transaction and ONE change set', async () => {
      const res = await call({
        label: 'Daily Optimization Plan',
        operations: [
          { op: 'create', title: 'Task 1' },
          { op: 'update', id: '70', title: 'Updated Task 70' },
          { op: 'complete', id: '71' },
          { op: 'delete', id: '72' },
        ],
      });

      expect(res.isError).toBeUndefined();
      expect(changeSetService.runWithChangeSet).toHaveBeenCalledTimes(1);
      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        { source: 'mcp', label: 'Daily Optimization Plan' },
        expect.any(Function),
      );

      expect(itemService.create).toHaveBeenCalledTimes(1);
      expect(itemService.update).toHaveBeenCalledTimes(1);
      expect(itemService.completeWithDetails).toHaveBeenCalledTimes(1);
      expect(itemService.delete).toHaveBeenCalledTimes(1);

      // 4 change entries recorded
      expect(changeSetService.recordEntry).toHaveBeenCalledTimes(4);

      const parsed = parse(res);
      expect(parsed.changeSetId).toBe('cs-10');
      expect(parsed.operations).toHaveLength(4);
    });

    it('truncates label to 200 characters for change set', async () => {
      const longLabel = 'x'.repeat(250);
      await call({
        label: longLabel,
        operations: [{ op: 'create', title: 'Task' }],
      });

      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        { source: 'mcp', label: 'x'.repeat(200) },
        expect.any(Function),
      );
    });

    it('rolls back and persists no change set if any operation throws during execution', async () => {
      // Fake transaction manager with __postCommit queue
      const postCommitCallbacks: Array<() => Promise<void>> = [];
      const postCommitRan: string[] = [];
      const txManager: any = {
        __postCommit: postCommitCallbacks,
      };

      changeSetService.runWithChangeSet = jest.fn(async (_owner: string, _meta: any, fn: any) => {
        // Execute inside fake transaction
        const result = await fn('cs-10', txManager);
        // Only run postCommit if transaction succeeds
        for (const cb of postCommitCallbacks) {
          await cb();
        }
        return { result, changeSetId: 'cs-10' };
      });

      // Operation 1 (create) succeeds and enqueues a post-commit side effect
      itemService.create.mockImplementationOnce(async (_owner: string, _dto: any, mgr: any) => {
        if (mgr?.__postCommit) {
          mgr.__postCommit.push(async () => {
            postCommitRan.push('create-sync');
          });
        }
        return { id: '99', title: 'Task 1', status: 'open' };
      });

      // Operation 2 (update) throws during execution
      itemService.update.mockRejectedValueOnce(new ApiException('Database lock conflict', 409));

      const res = await call({
        label: 'Throwing Plan',
        operations: [
          { op: 'create', title: 'Task 1' },
          { op: 'update', id: '70', title: 'Boom' },
          { op: 'delete', id: '72' },
        ],
      });

      // 1. Error is surfaced as a tool error
      expect(res.isError).toBe(true);
      expect(parse(res).error).toBe('Database lock conflict');

      // 2. The remaining operation (delete) did not execute
      expect(itemService.delete).not.toHaveBeenCalled();

      // 3. No post-commit side effect ran
      expect(postCommitRan).toEqual([]);

      // 4. No change set is reported as created
      expect(parse(res).changeSetId).toBeUndefined();
    });

    it('accepts and passes numeric goalId on create and update operations, rejecting malformed goalId', async () => {
      const badRes = await call(
        {
          label: 'Bad goalId plan',
          operations: [{ op: 'create', title: 'Task with bad goalId', goalId: 'not-a-number' }],
        },
        ['items:write', 'goals:write'],
      );
      expect(badRes.isError).toBe(true);
      expect(parse(badRes).error).toMatch(/goalId must be a numeric ID/);

      const goodRes = await call(
        {
          label: 'Good goalId plan',
          operations: [
            { op: 'create', title: 'Task with goal', goalId: '123' },
            { op: 'update', id: '70', goalId: '456' },
          ],
        },
        ['items:write', 'goals:write'],
      );
      expect(goodRes.isError).toBeFalsy();
      expect(itemService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ goalId: '123' }),
        expect.anything(),
      );
      expect(itemService.update).toHaveBeenCalledWith(
        'u1',
        '70',
        expect.objectContaining({ goalId: '456' }),
        undefined,
        expect.anything(),
      );
    });

    it('requires goals:write scope when goalId is present in create, update or null-clear operation', async () => {
      await expect(
        call({ label: 'Plan', operations: [{ op: 'create', title: 'T1', goalId: '10' }] }, [
          'items:write',
        ]),
      ).rejects.toThrow("Forbidden: missing required scope 'goals:write'");

      await expect(
        call({ label: 'Plan', operations: [{ op: 'update', id: '70', goalId: '10' }] }, [
          'items:write',
        ]),
      ).rejects.toThrow("Forbidden: missing required scope 'goals:write'");

      await expect(
        call({ label: 'Plan', operations: [{ op: 'update', id: '70', goalId: null }] }, [
          'items:write',
        ]),
      ).rejects.toThrow("Forbidden: missing required scope 'goals:write'");
    });

    it('works with both items:write and goals:write when goalId is present', async () => {
      const res = await call(
        {
          label: 'Plan',
          operations: [{ op: 'create', title: 'T1', goalId: '10' }],
        },
        ['items:write', 'goals:write'],
      );
      expect(res.isError).toBeFalsy();
    });

    it('requires only items:write when no goalId is present in any operation', async () => {
      const res = await call(
        {
          label: 'Plan',
          operations: [{ op: 'create', title: 'T1' }],
        },
        ['items:write'],
      );
      expect(res.isError).toBeFalsy();
    });
  });
});
