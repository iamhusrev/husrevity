import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiException } from '../common/api.exception';
import { Task } from '../task/task.entity';
import { Project } from '../project/project.entity';
import { Reminder } from '../reminder/reminder.entity';
import { ReminderList } from '../reminder/reminder-list.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { Goal } from '../goal/goal.entity';
import { TrashService, decodeTrashCursor, encodeTrashCursor } from './trash.service';
import { TRASH_KINDS, TrashKind } from './dto/trash-dtos';

type QbMock = {
  withDeleted: jest.Mock;
  select: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
};
type RepoMock = { createQueryBuilder: jest.Mock; find: jest.Mock; qb: QbMock };

const makeQb = (): QbMock => ({
  withDeleted: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
});

const makeRepo = (): RepoMock => {
  const qb = makeQb();
  return {
    qb,
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    find: jest.fn().mockResolvedValue([]),
  };
};

/** Every WHERE fragment joined, plus the merged named parameters. */
const whereOf = (qb: QbMock) => {
  const calls = [...qb.where.mock.calls, ...qb.andWhere.mock.calls];
  return {
    sql: calls.map((c) => String(c[0])).join(' | '),
    params: Object.assign({}, ...calls.map((c) => c[1] ?? {})) as Record<string, unknown>,
  };
};

describe('TrashService', () => {
  const userId = '1';
  const t1 = new Date('2026-03-01T10:00:00.000Z');
  const t2 = new Date('2026-03-01T11:00:00.000Z');
  const t3 = new Date('2026-03-01T09:00:00.000Z');
  let service: TrashService;
  let repos: Record<TrashKind, RepoMock>;

  beforeEach(async () => {
    repos = {
      task: makeRepo(),
      project: makeRepo(),
      reminder: makeRepo(),
      reminder_list: makeRepo(),
      calendar_event: makeRepo(),
      goal: makeRepo(),
    };
    const module = await Test.createTestingModule({
      providers: [
        TrashService,
        { provide: getRepositoryToken(Task), useValue: repos.task },
        { provide: getRepositoryToken(Project), useValue: repos.project },
        { provide: getRepositoryToken(Reminder), useValue: repos.reminder },
        { provide: getRepositoryToken(ReminderList), useValue: repos.reminder_list },
        { provide: getRepositoryToken(CalendarEvent), useValue: repos.calendar_event },
        { provide: getRepositoryToken(Goal), useValue: repos.goal },
      ],
    }).compile();
    service = module.get(TrashService);
  });

  describe('per-kind queries', () => {
    it.each(TRASH_KINDS)(
      '%s: reads soft-deleted rows only (withDeleted + deletedAt IS NOT NULL)',
      async (kind) => {
        await service.list(userId, { kinds: [kind] });

        const qb = repos[kind].qb;
        expect(qb.withDeleted).toHaveBeenCalled();
        expect(whereOf(qb).sql).toContain('t.deletedAt IS NOT NULL');
        // Only the requested kind is queried.
        for (const other of TRASH_KINDS.filter((k) => k !== kind)) {
          expect(repos[other].createQueryBuilder).not.toHaveBeenCalled();
        }
      },
    );

    it.each(['project', 'reminder', 'reminder_list', 'calendar_event', 'goal'] as TrashKind[])(
      '%s: is scoped to the caller as owner and never via project membership',
      async (kind) => {
        await service.list(userId, { kinds: [kind] });

        const { sql, params } = whereOf(repos[kind].qb);
        expect(sql).toContain('t.ownerId = :userId');
        expect(params.userId).toBe(userId);
        expect(sql).not.toContain('project_member');
      },
    );

    it('task: personal tasks are owner-only, exactly like TaskService.restore', async () => {
      await service.list(userId, { kinds: ['task'] });

      const { sql, params } = whereOf(repos.task.qb);
      expect(sql).toContain('(t.projectId IS NULL AND t.ownerId = :userId)');
      expect(params.userId).toBe(userId);
    });

    it('task: project tasks need a LIVE project and a LIVE OWNER/EDITOR membership of the caller (VIEWER, removed members and deleted projects are excluded)', async () => {
      await service.list(userId, { kinds: ['task'] });

      const { sql } = whereOf(repos.task.qb);
      expect(sql).toContain(
        't.projectId IN (SELECT p.id FROM project p JOIN project_member pm ON pm.project_id = p.id',
      );
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain('pm.deleted_at IS NULL');
      expect(sql).toContain('pm.user_id = :userId');
      expect(sql).toContain("pm.role IN ('OWNER', 'EDITOR')");
      expect(sql).not.toContain('VIEWER');
    });

    it('task: resolves projectName from LIVE projects only, selecting id and name', async () => {
      repos.task.qb.getMany.mockResolvedValueOnce([
        { id: '5', title: 'Shared task', deletedAt: t1, projectId: '77' },
        { id: '6', title: 'Personal task', deletedAt: t3, projectId: null },
      ]);
      repos.project.find.mockResolvedValueOnce([{ id: '77', name: 'Apollo' }]);

      const page = await service.list(userId, { kinds: ['task'] });

      expect(repos.project.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        select: ['id', 'name'],
      });
      expect(page.items).toEqual([
        expect.objectContaining({ id: '5', projectId: '77', projectName: 'Apollo' }),
        expect.objectContaining({ id: '6', projectId: null, projectName: null }),
      ]);
    });

    it('selects only id, title and deletedAt (plus projectId for tasks): no notes, bodies or descriptions', async () => {
      await service.list(userId, { kinds: [...TRASH_KINDS] });

      for (const kind of TRASH_KINDS) {
        const selected = repos[kind].qb.select.mock.calls[0][0] as string[];
        expect(selected).toEqual(expect.arrayContaining(['t.id', 't.deletedAt']));
        for (const col of selected) {
          expect(col).not.toMatch(/description|notes|body/i);
        }
        if (kind === 'task') expect(selected).toContain('t.projectId');
        else expect(selected).not.toContain('t.projectId');
      }
    });
  });

  describe('response shape and restore hints', () => {
    it('maps every kind to its title column, REST restore path and MCP restore tool', async () => {
      repos.task.qb.getMany.mockResolvedValueOnce([
        { id: '1', title: 'T', deletedAt: t1, projectId: null },
      ]);
      repos.project.qb.getMany.mockResolvedValueOnce([{ id: '2', name: 'P', deletedAt: t1 }]);
      repos.reminder.qb.getMany.mockResolvedValueOnce([{ id: '3', title: 'R', deletedAt: t1 }]);
      repos.reminder_list.qb.getMany.mockResolvedValueOnce([{ id: '4', name: 'L', deletedAt: t1 }]);
      repos.calendar_event.qb.getMany.mockResolvedValueOnce([
        { id: '5', title: 'E', deletedAt: t1 },
      ]);
      repos.goal.qb.getMany.mockResolvedValueOnce([{ id: '6', title: 'G', deletedAt: t1 }]);

      const page = await service.list(userId, { kinds: [...TRASH_KINDS] });

      const byKind = Object.fromEntries(page.items.map((i) => [i.kind, i]));
      expect(byKind.task).toMatchObject({
        id: '1',
        title: 'T',
        restorePath: '/tasks/1/restore',
        restoreTool: 'restore_task',
      });
      expect(byKind.project).toMatchObject({
        id: '2',
        title: 'P',
        restorePath: '/projects/2/restore',
        restoreTool: 'restore_project',
      });
      expect(byKind.reminder).toMatchObject({
        id: '3',
        title: 'R',
        restorePath: '/reminders/3/restore',
        restoreTool: 'restore_reminder',
      });
      expect(byKind.reminder_list).toMatchObject({
        id: '4',
        title: 'L',
        restorePath: '/reminder-lists/4/restore',
        restoreTool: 'restore_reminder_list',
      });
      expect(byKind.calendar_event).toMatchObject({
        id: '5',
        title: 'E',
        restorePath: '/calendar/events/5/restore',
        restoreTool: 'restore_calendar_event',
      });
      expect(byKind.goal).toMatchObject({
        id: '6',
        title: 'G',
        restorePath: '/goals/6/restore',
        restoreTool: 'restore_goal',
      });
    });

    it('exposes exactly the contract fields and serializes deletedAt as ISO', async () => {
      repos.goal.qb.getMany.mockResolvedValueOnce([
        { id: '6', title: 'G', notes: 'secret body', deletedAt: t1 },
      ]);

      const page = await service.list(userId, { kinds: ['goal'] });

      expect(Object.keys(page.items[0]).sort()).toEqual(
        [
          'deletedAt',
          'id',
          'kind',
          'projectId',
          'projectName',
          'restorePath',
          'restoreTool',
          'title',
        ].sort(),
      );
      expect(page.items[0].deletedAt).toBe(t1.toISOString());
      expect(JSON.stringify(page)).not.toContain('secret body');
    });

    it('defaults to all kinds, and an explicit empty kind list queries nothing', async () => {
      await service.list(userId, {});
      for (const kind of TRASH_KINDS) expect(repos[kind].createQueryBuilder).toHaveBeenCalled();

      jest.clearAllMocks();
      const page = await service.list(userId, { kinds: [] });
      expect(page).toEqual({ items: [], nextCursor: null });
      for (const kind of TRASH_KINDS) expect(repos[kind].createQueryBuilder).not.toHaveBeenCalled();
    });

    it('rejects an unknown kind with 400', async () => {
      await expect(service.list(userId, { kinds: ['note' as TrashKind] })).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('since, limit, ordering and cursor paging', () => {
    it('applies since as deletedAt >= :since and rejects an invalid since with 400', async () => {
      await service.list(userId, { kinds: ['goal'], since: '2026-03-01T00:00:00.000Z' });

      const { sql, params } = whereOf(repos.goal.qb);
      expect(sql).toContain('t.deletedAt >= :since');
      expect(params.since).toEqual(new Date('2026-03-01T00:00:00.000Z'));

      await expect(
        service.list(userId, { kinds: ['goal'], since: 'yesterday' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('fetches limit + 1 rows per kind (default 20) and clamps limit to 1..100', async () => {
      await service.list(userId, { kinds: ['goal'] });
      expect(repos.goal.qb.take).toHaveBeenLastCalledWith(21);

      await service.list(userId, { kinds: ['goal'], limit: 500 });
      expect(repos.goal.qb.take).toHaveBeenLastCalledWith(101);

      await service.list(userId, { kinds: ['goal'], limit: 0 });
      expect(repos.goal.qb.take).toHaveBeenLastCalledWith(2);
    });

    it('orders each kind by deletedAt DESC, id DESC in SQL (millisecond-truncated to match the cursor)', async () => {
      await service.list(userId, { kinds: ['goal'] });

      const qb = repos.goal.qb;
      expect(qb.orderBy).toHaveBeenCalledWith("date_trunc('milliseconds', t.deletedAt)", 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('t.id', 'DESC');
    });

    it('merge-sorts across kinds by deletedAt DESC, id DESC, slices to limit and emits a cursor for the last entry', async () => {
      repos.task.qb.getMany.mockResolvedValueOnce([
        { id: '5', title: 'T5', deletedAt: t1, projectId: null },
        { id: '3', title: 'T3', deletedAt: t1, projectId: null },
      ]);
      repos.goal.qb.getMany.mockResolvedValueOnce([
        { id: '2', title: 'G2', deletedAt: t2 },
        { id: '9', title: 'G9', deletedAt: t1 },
        { id: '1', title: 'G1', deletedAt: t3 },
      ]);

      const page = await service.list(userId, { kinds: ['task', 'goal'], limit: 3 });

      expect(page.items.map((i) => `${i.kind}:${i.id}`)).toEqual(['goal:2', 'goal:9', 'task:5']);
      expect(page.nextCursor).toEqual(expect.any(String));
      expect(decodeTrashCursor(page.nextCursor!)).toEqual({
        deletedAt: t1.toISOString(),
        kind: 'task',
        id: '5',
      });
    });

    it('returns nextCursor null when the merged result fits in the page', async () => {
      repos.goal.qb.getMany.mockResolvedValueOnce([{ id: '2', title: 'G2', deletedAt: t2 }]);

      const page = await service.list(userId, { kinds: ['goal'], limit: 3 });

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('applies the cursor as (deletedAt, id) < cursor, with <= for kinds that sort after the cursor kind on a full tie', async () => {
      const cursor = encodeTrashCursor({ deletedAt: t1.toISOString(), kind: 'reminder', id: '5' });

      await service.list(userId, { kinds: ['task', 'reminder', 'goal'], cursor });

      const strict = whereOf(repos.task.qb);
      expect(strict.sql).toContain(
        "(date_trunc('milliseconds', t.deletedAt) < :cursorDeletedAt OR (date_trunc('milliseconds', t.deletedAt) = :cursorDeletedAt AND t.id < :cursorId))",
      );
      expect(strict.params.cursorDeletedAt).toEqual(t1);
      expect(strict.params.cursorId).toBe('5');
      expect(whereOf(repos.reminder.qb).sql).toContain('t.id < :cursorId');
      expect(whereOf(repos.goal.qb).sql).toContain('t.id <= :cursorId');
    });

    it.each([
      ['not base64url', 'a b c!'],
      ['non-JSON payload', Buffer.from('nonsense').toString('base64url')],
      [
        'missing fields',
        Buffer.from(JSON.stringify({ d: t1.toISOString() })).toString('base64url'),
      ],
      [
        'unknown kind',
        Buffer.from(JSON.stringify({ d: t1.toISOString(), k: 'note', i: '1' })).toString(
          'base64url',
        ),
      ],
      [
        'invalid date',
        Buffer.from(JSON.stringify({ d: 'yesterday', k: 'task', i: '1' })).toString('base64url'),
      ],
      [
        'non-numeric id',
        Buffer.from(JSON.stringify({ d: t1.toISOString(), k: 'task', i: 'abc' })).toString(
          'base64url',
        ),
      ],
    ])('rejects a malformed cursor (%s) with 400 before querying', async (_label, cursor) => {
      await expect(service.list(userId, { kinds: ['task'], cursor })).rejects.toBeInstanceOf(
        ApiException,
      );
      await expect(service.list(userId, { kinds: ['task'], cursor })).rejects.toMatchObject({
        status: 400,
      });
      expect(repos.task.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('round-trips a cursor through encode/decode', () => {
      const c = { deletedAt: t1.toISOString(), kind: 'goal' as TrashKind, id: '42' };
      expect(decodeTrashCursor(encodeTrashCursor(c))).toEqual(c);
    });
  });
});
