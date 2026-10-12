import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ItemService } from './item.service';
import { Item } from './item.entity';
import { ItemOccurrence } from './item-occurrence.entity';
import { ItemRecurrenceService } from './item-recurrence.service';
import { ApiException } from '../common/api.exception';
import { ProjectAccessService } from '../project/project-access.service';
import { NotificationService } from '../notification/notification.service';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { GoalService } from '../goal/goal.service';

type MockItemRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
  createQueryBuilder: jest.Mock;
};

type MockOccurrenceRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  delete: jest.Mock;
};

function makeQueryBuilder(rows: Item[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.select = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.addOrderBy = jest.fn().mockReturnValue(qb);
  qb.limit = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('ItemService', () => {
  const ownerId = '1';
  const NOW = new Date('2026-01-01T00:00:00Z');

  let service: ItemService;
  let items: MockItemRepo;
  let occurrences: MockOccurrenceRepo;
  let access: { requireAccess: jest.Mock };
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };
  let recurrence: { expand: jest.Mock };
  let googleCalendarService: { syncItemToGoogleCalendar: jest.Mock };
  let goalService: { validateLiveGoal: jest.Mock; liveSubtreeIds: jest.Mock };

  beforeEach(async () => {
    items = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) =>
        Promise.resolve({
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          ...v,
        }),
      ),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn(() => makeQueryBuilder([])),
    };
    occurrences = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    access = { requireAccess: jest.fn() };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };
    recurrence = { expand: jest.fn().mockReturnValue([]) };
    googleCalendarService = { syncItemToGoogleCalendar: jest.fn().mockResolvedValue(null) };
    goalService = {
      validateLiveGoal: jest.fn().mockResolvedValue({ id: '5', ownerId: '1' }),
      liveSubtreeIds: jest.fn(async (_owner: string, id: string) => [id]),
    };

    const module = await Test.createTestingModule({
      providers: [
        ItemService,
        { provide: getRepositoryToken(Item), useValue: items },
        { provide: getRepositoryToken(ItemOccurrence), useValue: occurrences },
        { provide: ProjectAccessService, useValue: access },
        { provide: NotificationService, useValue: notifications },
        { provide: ItemRecurrenceService, useValue: recurrence },
        { provide: GoogleCalendarService, useValue: googleCalendarService },
        { provide: GoalService, useValue: goalService },
      ],
    }).compile();

    service = module.get(ItemService);
  });

  describe('requireItemAccess (via get)', () => {
    it('404s a personal item owned by someone else, without ever calling ProjectAccessService', async () => {
      items.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId: '999',
        projectId: null,
      } as Item);

      await expect(service.get(ownerId, '10')).rejects.toThrow(ApiException);
      expect(access.requireAccess).not.toHaveBeenCalled();
    });

    it('404s when the item does not exist at all', async () => {
      items.findOne.mockResolvedValueOnce(null);
      await expect(service.get(ownerId, '10')).rejects.toThrow(ApiException);
    });

    it('returns a personal item owned by the caller', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        payload: {},
        status: 'open',
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);
      const result = await service.get(ownerId, '10');
      expect(result.id).toBe('10');
    });

    it('delegates to ProjectAccessService for a project-attached item instead of checking ownerId', async () => {
      const row = {
        id: '10',
        ownerId: '999',
        projectId: '5',
        payload: {},
        status: 'open',
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);
      access.requireAccess.mockResolvedValueOnce({
        project: { id: '5', ownerId: '999' },
        role: 'VIEWER',
      });

      const result = await service.get(ownerId, '10');

      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, '5', 'VIEWER');
      expect(result.id).toBe('10');
    });
  });

  describe('parseQuickAddText', () => {
    it('runs the shared parser and returns its draft as-is, without writing anything', async () => {
      const draft = await service.parseQuickAddText('yarın toplantı');

      expect(draft.title).toBe('toplantı');
      expect(draft.scheduledAt).toBeDefined();
      expect(items.create).not.toHaveBeenCalled();
      expect(items.save).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a personal item owned by the caller when no projectId is given', async () => {
      const result = await service.create(ownerId, {
        kind: 'task',
        title: 'Yarın 9da HGS kontrol',
      });

      expect(access.requireAccess).not.toHaveBeenCalled();
      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId, projectId: null, kind: 'task' }),
      );
      expect(googleCalendarService.syncItemToGoogleCalendar).toHaveBeenCalled();
      expect(result.title).toBe('Yarın 9da HGS kontrol');
    });

    it('re-anchors ownerId to the project owner when projectId is given, mirroring TaskService.createForProject', async () => {
      access.requireAccess.mockResolvedValueOnce({
        project: { id: '5', ownerId: '2' },
        role: 'EDITOR',
      });

      await service.create(ownerId, { kind: 'task', title: 'Proje işi', projectId: '5' });

      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, '5', 'EDITOR');
      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: '2', projectId: '5' }),
      );
      expect(googleCalendarService.syncItemToGoogleCalendar).toHaveBeenCalled();
    });
  });

  describe('rrule normalisation', () => {
    it.each([
      ['empty string', ''],
      ['whitespace', '   '],
    ])('stores null on create when rrule is %s', async (_label, rrule) => {
      await service.create(ownerId, { kind: 'task', title: 'Loose', rrule });
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ rrule: null }));
    });

    it('keeps a real rrule untouched on create', async () => {
      await service.create(ownerId, { kind: 'task', title: 'Daily', rrule: 'FREQ=DAILY' });
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ rrule: 'FREQ=DAILY' }));
    });

    it.each([
      ['SECONDLY', 'FREQ=SECONDLY'],
      ['MINUTELY', 'FREQ=MINUTELY;INTERVAL=5'],
      ['garbage', 'not a rule'],
      ['unknown FREQ', 'FREQ=BROKEN'],
      ['non-numeric COUNT', 'FREQ=DAILY;COUNT=abc'],
      ['embedded line break', 'FREQ=DAILY\r\nATTENDEE:x'],
    ])('rejects a %s rrule on create with 400 and saves nothing', async (_label, rrule) => {
      await expect(
        service.create(ownerId, { kind: 'task', title: 'Bad', rrule }),
      ).rejects.toMatchObject({ status: 400 });
      expect(items.save).not.toHaveBeenCalled();
    });

    it.each([
      ['SECONDLY', 'FREQ=SECONDLY'],
      ['MINUTELY', 'FREQ=MINUTELY'],
      ['garbage', 'xyz'],
    ])('rejects a %s rrule on update with 400 and saves nothing', async (_label, rrule) => {
      items.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId,
        projectId: null,
        rrule: null,
        payload: {},
        updatedAt: NOW,
        createdAt: NOW,
      } as Item);

      await expect(service.update(ownerId, '10', { rrule })).rejects.toMatchObject({ status: 400 });
      expect(items.save).not.toHaveBeenCalled();
    });

    it.each([
      'FREQ=HOURLY;INTERVAL=2',
      'FREQ=DAILY',
      'FREQ=WEEKLY;BYDAY=MO',
      'RRULE:FREQ=MONTHLY;COUNT=3',
    ])('accepts the supported rrule %s', async (rrule) => {
      await service.create(ownerId, { kind: 'task', title: 'Ok', rrule });
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ rrule }));
    });

    it.each([
      ['empty string', ''],
      ['whitespace', '  \t '],
    ])('stores null on update when rrule is %s', async (_label, rrule) => {
      items.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId,
        projectId: null,
        rrule: 'FREQ=DAILY',
        payload: {},
        updatedAt: NOW,
        createdAt: NOW,
      } as Item);

      const result = await service.update(ownerId, '10', { rrule });

      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ rrule: null }));
      expect(result.rrule).toBeNull();
    });
  });

  describe('update: stored legacy rrule must not block unrelated updates', () => {
    const storedRow = (rrule: string) =>
      ({
        id: '10',
        ownerId,
        projectId: null,
        title: 'Eski',
        payload: {},
        rrule,
        scheduledAt: NOW,
        updatedAt: NOW,
        createdAt: NOW,
      }) as unknown as Item;

    it('updates the title of an item whose STORED rule is FREQ=SECONDLY (rrule not in the request)', async () => {
      items.findOne.mockResolvedValueOnce(storedRow('FREQ=SECONDLY'));
      const result = await service.update(ownerId, '10', { title: 'Yeni' });
      expect(result.title).toBe('Yeni');
    });

    it('accepts a request that replays the UNCHANGED stored rule (undo snapshot, client echoing the object)', async () => {
      items.findOne.mockResolvedValueOnce(storedRow('FREQ=SECONDLY'));
      const result = await service.update(ownerId, '10', {
        title: 'Yeni',
        rrule: 'FREQ=SECONDLY',
      });
      expect(result.title).toBe('Yeni');
      expect(items.save).toHaveBeenCalled();
    });

    it('still rejects CHANGING the rule to an invalid or too-frequent one', async () => {
      items.findOne.mockResolvedValueOnce(storedRow('FREQ=DAILY'));
      await expect(service.update(ownerId, '10', { rrule: 'FREQ=SECONDLY' })).rejects.toThrow(
        ApiException,
      );
    });
  });

  describe('update', () => {
    it('applies the update unconditionally when no ifMatchMs is given', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Eski',
        payload: {},
        updatedAt: NOW,
        createdAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      const result = await service.update(ownerId, '10', { title: 'Yeni' });

      expect(result.title).toBe('Yeni');
      expect(googleCalendarService.syncItemToGoogleCalendar).toHaveBeenCalled();
    });

    it("throws 409 when ifMatchMs does not match the item's current updatedAt", async () => {
      const staleMs = NOW.getTime() - 1000;
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Eski',
        payload: {},
        updatedAt: NOW,
        createdAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      await expect(service.update(ownerId, '10', { title: 'Yeni' }, staleMs)).rejects.toThrow(
        ApiException,
      );
      expect(items.save).not.toHaveBeenCalled();
    });

    it("succeeds when ifMatchMs exactly matches the item's current updatedAt", async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Eski',
        payload: {},
        updatedAt: NOW,
        createdAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      const result = await service.update(ownerId, '10', { title: 'Yeni' }, NOW.getTime());

      expect(result.title).toBe('Yeni');
    });
  });

  describe('complete', () => {
    it('completes a non-recurring item directly and cancels its pending notification', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        rrule: null,
        status: 'open',
        payload: {},
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      const result = await service.complete(ownerId, '10', {});

      expect(result.status).toBe('done');
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'item', '10');
      expect(occurrences.save).not.toHaveBeenCalled();
    });

    it('requires occursOn for a recurring item and throws 400 without it', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        rrule: 'FREQ=DAILY',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      await expect(service.complete(ownerId, '10', {})).rejects.toThrow(ApiException);
    });

    it('upserts an item_occurrences row for a recurring item and leaves the parent status untouched', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        rrule: 'FREQ=DAILY',
        status: 'open',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);
      occurrences.findOne.mockResolvedValueOnce(null);

      const result = await service.complete(ownerId, '10', { occursOn: '2026-01-05' });

      expect(occurrences.create).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: '10', ownerId, occursOn: '2026-01-05', status: 'done' }),
      );
      expect(items.save).not.toHaveBeenCalled(); // parent template is never saved as "done"
      expect(result.occursOn).toBe('2026-01-05');
      expect(result.status).toBe('done');
      expect((result as any).occurrenceId).toBeUndefined();
    });

    it('completeWithDetails returns both item and occurrenceId for recurring items', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        rrule: 'FREQ=DAILY',
        status: 'open',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);
      occurrences.findOne.mockResolvedValueOnce(null);
      occurrences.save.mockResolvedValueOnce({
        id: 'occ-99',
        itemId: '10',
        ownerId,
        occursOn: '2026-01-05',
        status: 'done',
        completedAt: NOW,
      });

      const res = await (service as any).completeWithDetails(ownerId, '10', {
        occursOn: '2026-01-05',
      });

      expect(res.item).toBeDefined();
      expect((res.item as any).occurrenceId).toBeUndefined();
      expect(res.occurrenceId).toBe('occ-99');
    });
  });

  describe('list', () => {
    it('always filters by ownerId regardless of other query params', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, {});

      expect(qb.where).toHaveBeenCalledWith('i.owner_id = :ownerId', { ownerId });
    });

    describe('inbox=true', () => {
      /**
       * Tiny in-memory interpreter for the known inbox predicates, so the
       * test proves which rows the query keeps instead of only echoing a mock.
       */
      function makeInterpretingQueryBuilder(rows: Item[]) {
        const predicates: Array<(row: Item) => boolean> = [];
        const orderings: Array<[string, 'ASC' | 'DESC']> = [];
        const known: Record<string, (row: Item) => boolean> = {
          "i.status = 'open'": (r) => r.status === 'open',
          "i.kind = 'task'": (r) => r.kind === 'task',
          'i.scheduled_at IS NULL': (r) => r.scheduledAt == null,
          'i.due_at IS NULL': (r) => r.dueAt == null,
          'i.goal_id IS NULL': (r) => r.goalId == null,
          'i.project_id IS NULL': (r) => r.projectId == null,
          'i.block_id IS NULL': (r) => r.blockId == null,
          "(i.rrule IS NULL OR i.rrule = '')": (r) => r.rrule == null || r.rrule === '',
          'i.rrule IS NULL': (r) => r.rrule == null,
        };
        const qb: Record<string, jest.Mock> = {};
        qb.where = jest.fn((_sql: string, params: { ownerId: string }) => {
          predicates.push((r) => r.ownerId === params.ownerId);
          return qb;
        });
        qb.andWhere = jest.fn((sql: string) => {
          const fn = known[sql];
          if (!fn) throw new Error(`Unknown inbox predicate: ${sql}`);
          predicates.push(fn);
          return qb;
        });
        qb.orderBy = jest.fn((col: string, dir: 'ASC' | 'DESC') => {
          orderings.push([col, dir]);
          return qb;
        });
        qb.addOrderBy = jest.fn((col: string, dir: 'ASC' | 'DESC') => {
          orderings.push([col, dir]);
          return qb;
        });
        qb.limit = jest.fn().mockReturnValue(qb);
        qb.getMany = jest.fn(async () => {
          const kept = rows.filter((r) => predicates.every((p) => p(r)));
          return kept.sort((a, b) => {
            const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
            if (byCreated !== 0) return byCreated;
            return Number(b.id) - Number(a.id);
          });
        });
        return { qb, orderings };
      }

      const baseRow = (overrides: Partial<Item>): Item =>
        ({
          id: '1',
          ownerId,
          kind: 'task',
          status: 'open',
          title: 'row',
          scheduledAt: null,
          dueAt: null,
          goalId: null,
          projectId: null,
          blockId: null,
          rrule: null,
          payload: {},
          createdAt: NOW,
          updatedAt: NOW,
          ...overrides,
        }) as Item;

      it("keeps an rrule '' row, drops recurring and shared-project rows, orders by created_at then id desc", async () => {
        const { qb, orderings } = makeInterpretingQueryBuilder([
          baseRow({ id: '1', title: 'plain' }),
          baseRow({ id: '2', title: 'empty rrule', rrule: '' }),
          baseRow({ id: '3', title: 'recurring', rrule: 'FREQ=DAILY' }),
          baseRow({ id: '4', title: 'shared project row', projectId: '9' }),
          baseRow({ id: '5', title: 'foreign', ownerId: '999' }),
        ]);
        items.createQueryBuilder.mockReturnValue(qb);

        const result = await service.list(ownerId, { inbox: true });

        expect(result.map((r) => r.title)).toEqual(['empty rrule', 'plain']);
        expect(orderings).toEqual([
          ['i.created_at', 'DESC'],
          ['i.id', 'DESC'],
        ]);
      });

      it('adds the unsorted-task predicates, newest first, capped at 200 rows', async () => {
        const qb = makeQueryBuilder([]);
        items.createQueryBuilder.mockReturnValue(qb);

        await service.list(ownerId, { inbox: true });

        expect(qb.where).toHaveBeenCalledWith('i.owner_id = :ownerId', { ownerId });
        const conditions = qb.andWhere.mock.calls.map((c) => c[0] as string);
        expect(conditions).toEqual(
          expect.arrayContaining([
            expect.stringContaining("i.status = 'open'"),
            expect.stringContaining("i.kind = 'task'"),
            expect.stringContaining('i.scheduled_at IS NULL'),
            expect.stringContaining('i.due_at IS NULL'),
            expect.stringContaining('i.goal_id IS NULL'),
            expect.stringContaining('i.project_id IS NULL'),
            expect.stringContaining('i.block_id IS NULL'),
            "(i.rrule IS NULL OR i.rrule = '')",
          ]),
        );
        expect(qb.orderBy).toHaveBeenCalledWith('i.created_at', 'DESC');
        expect(qb.addOrderBy).toHaveBeenCalledWith('i.id', 'DESC');
        expect(qb.limit).toHaveBeenCalledWith(200);
      });

      it('does not expand recurrences or apply a range even when from/to are given', async () => {
        const qb = makeQueryBuilder([
          {
            id: '1',
            ownerId,
            kind: 'task',
            rrule: null,
            blockId: null,
            status: 'open',
            payload: {},
            createdAt: NOW,
            updatedAt: NOW,
          } as Item,
        ]);
        items.createQueryBuilder.mockReturnValue(qb);

        const result = await service.list(ownerId, {
          inbox: true,
          from: '2026-01-01',
          to: '2026-01-10',
        });

        expect(result.map((r) => r.id)).toEqual(['1']);
        expect(recurrence.expand).not.toHaveBeenCalled();
        expect(occurrences.find).not.toHaveBeenCalled();
      });

      it('leaves the default behaviour untouched when inbox is absent or false', async () => {
        for (const query of [{}, { inbox: false }]) {
          const qb = makeQueryBuilder([]);
          items.createQueryBuilder.mockReturnValue(qb);
          await service.list(ownerId, query);
          expect(qb.limit).not.toHaveBeenCalled();
          expect(qb.orderBy).toHaveBeenCalledWith('i.scheduled_at', 'ASC');
        }
      });
    });

    it('expands a recurring item into one virtual row per occurrence when from/to are both given', async () => {
      const recurringItem = {
        id: '20',
        ownerId,
        blockId: null,
        rrule: 'FREQ=DAILY',
        status: 'open',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.createQueryBuilder.mockReturnValue(makeQueryBuilder([recurringItem]));
      recurrence.expand.mockReturnValueOnce([
        { occursOn: '2026-01-05', occursAt: new Date('2026-01-05T06:00:00Z') },
        { occursOn: '2026-01-06', occursAt: new Date('2026-01-06T06:00:00Z') },
      ]);

      const result = await service.list(ownerId, { from: '2026-01-01', to: '2026-01-10' });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.occursOn)).toEqual(['2026-01-05', '2026-01-06']);
      expect(result.every((r) => r.status === 'open')).toBe(true);
    });

    it('applies an item_occurrences override onto its matching virtual occurrence', async () => {
      const recurringItem = {
        id: '20',
        ownerId,
        blockId: null,
        rrule: 'FREQ=DAILY',
        status: 'open',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.createQueryBuilder.mockReturnValue(makeQueryBuilder([recurringItem]));
      occurrences.find.mockResolvedValueOnce([
        {
          itemId: '20',
          occursOn: '2026-01-05',
          status: 'done',
          completedAt: new Date('2026-01-05T07:00:00Z'),
        },
      ]);
      recurrence.expand.mockReturnValueOnce([
        { occursOn: '2026-01-05', occursAt: new Date('2026-01-05T06:00:00Z') },
      ]);

      const result = await service.list(ownerId, { from: '2026-01-01', to: '2026-01-10' });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('done');
    });
  });

  describe('list with goalId filter', () => {
    const goalRow = (overrides: Partial<Item>): Item =>
      ({
        id: '1',
        ownerId,
        kind: 'task',
        status: 'open',
        title: 'row',
        scheduledAt: null,
        dueAt: null,
        goalId: '5',
        projectId: null,
        blockId: null,
        rrule: null,
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
      }) as Item;

    it('returns rows from the query builder without recurrence expansion', async () => {
      const qb = makeQueryBuilder([
        goalRow({ id: '1' }),
        goalRow({ id: '2', rrule: 'FREQ=DAILY' }),
      ]);
      items.createQueryBuilder.mockReturnValue(qb);

      const result = await service.list(ownerId, {
        goalId: '5',
        from: '2026-01-01',
        to: '2026-01-10',
      });

      expect(result.map((r) => r.id)).toEqual(['1', '2']);
      expect(result[1].occursOn).toBeUndefined();
      expect(recurrence.expand).not.toHaveBeenCalled();
      expect(occurrences.find).not.toHaveBeenCalled();
    });

    it('validates the goal for the caller and filters by the goal subtree ids', async () => {
      goalService.liveSubtreeIds.mockResolvedValueOnce(['5', '6', '7']);
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, { goalId: '5' });

      expect(goalService.validateLiveGoal).toHaveBeenCalledWith(ownerId, '5', undefined);
      expect(goalService.liveSubtreeIds).toHaveBeenCalledWith(ownerId, '5');
      const calls = qb.andWhere.mock.calls.concat(qb.where.mock.calls);
      const direct = calls.find((c) =>
        String(c[0]).includes('i.goal_id = ANY(:goalIds::bigint[])'),
      );
      expect(direct).toBeDefined();
      expect(String(direct![0])).toContain('p.goal_id = ANY(:goalIds::bigint[])');
      expect(String(direct![0])).toContain('p.deleted_at IS NULL');
      expect(String(direct![0])).not.toContain(':...goalIds');
      expect(direct![1]).toEqual({ goalIds: ['5', '6', '7'] });
    });

    it('applies the live-project and live-member predicate to the direct goal link too', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, { goalId: '5' });

      const calls = qb.andWhere.mock.calls.concat(qb.where.mock.calls);
      const goalMatch = calls.find((c) => String(c[0]).includes('i.goal_id = ANY'))!;
      const visibility = calls.find((c) => String(c[0]).includes('project_member'))!;
      // A separate AND-ed clause, so it covers both the direct and the project-linked branch.
      expect(goalMatch).not.toBe(visibility);
      expect(String(goalMatch[0])).not.toContain('project_member');
      const sql = String(visibility[0]);
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain('pm.deleted_at IS NULL');
      expect(sql).toContain('pm.project_id = p.id');
      expect(sql).toContain('i.project_id IS NULL AND i.owner_id = :userId');
    });

    it('only exposes own personal rows and rows of projects where the caller is a live member', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, { goalId: '5' });

      const calls = qb.andWhere.mock.calls.concat(qb.where.mock.calls);
      const access = calls.find((c) => String(c[0]).includes('project_member'));
      expect(access).toBeDefined();
      const sql = String(access![0]);
      expect(sql).toContain('pm.deleted_at IS NULL');
      expect(sql).toContain('pm.user_id = :userId');
      expect(sql).toContain('i.project_id IS NULL AND i.owner_id = :userId');
      expect(access![1]).toMatchObject({ userId: ownerId });
    });

    it('excludes cancelled items when no status is given', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, { goalId: '5' });

      const conditions = qb.andWhere.mock.calls.map((c) => c[0] as string);
      expect(conditions).toContain("i.status != 'cancelled'");
    });

    it('lets an explicit status win over the cancelled exclusion', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, { goalId: '5', status: 'cancelled' });

      const conditions = qb.andWhere.mock.calls.map((c) => c[0] as string);
      expect(conditions).not.toContain("i.status != 'cancelled'");
      expect(qb.andWhere).toHaveBeenCalledWith('i.status = :status', { status: 'cancelled' });
    });

    it('orders deterministically with nulls last and caps at 200', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, { goalId: '5' });

      expect(qb.orderBy).toHaveBeenCalledWith('i.scheduled_at', 'ASC', 'NULLS LAST');
      expect(qb.addOrderBy).toHaveBeenCalledWith('i.due_at', 'ASC', 'NULLS LAST');
      expect(qb.addOrderBy).toHaveBeenCalledWith('i.id', 'DESC');
      expect(qb.limit).toHaveBeenCalledWith(200);
    });

    it('404s a foreign or missing goal without querying items', async () => {
      goalService.validateLiveGoal.mockRejectedValueOnce(ApiException.notFound('Goal not found'));

      await expect(service.list(ownerId, { goalId: '999' })).rejects.toMatchObject({ status: 404 });
      expect(items.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('400s a malformed goal id before touching the goal service', async () => {
      for (const goalId of ['abc', '1; DROP', '', '99999999999999999999']) {
        await expect(service.list(ownerId, { goalId })).rejects.toMatchObject({ status: 400 });
      }
      expect(goalService.validateLiveGoal).not.toHaveBeenCalled();
      expect(items.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('leaves the default list untouched when goalId is absent', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, {});

      expect(goalService.validateLiveGoal).not.toHaveBeenCalled();
      expect(qb.limit).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('i.scheduled_at', 'ASC');
    });
  });

  describe('exportIcs', () => {
    const icsRow = (overrides: Partial<Item>): Item =>
      ({
        id: '1',
        ownerId,
        kind: 'event',
        status: 'open',
        title: 'Row',
        notes: null,
        context: null,
        scheduledAt: new Date('2026-03-02T07:00:00Z'),
        dueAt: null,
        durationMin: null,
        goalId: null,
        projectId: null,
        blockId: null,
        rrule: null,
        completedAt: null,
        payload: { secret: 'x' },
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
      }) as Item;

    const range = { from: '2026-03-01', to: '2026-03-31' };

    it('scopes the query to the caller, excludes cancelled and bounds by Istanbul day edges', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.exportIcs(ownerId, range);

      expect(qb.where).not.toHaveBeenCalledWith('i.owner_id = :userId', expect.anything());
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('project_member'),
        expect.anything(),
      );
      expect(qb.andWhere).toHaveBeenCalledWith("i.status != 'cancelled'");
      const rangeCall = qb.andWhere.mock.calls.find((c) => String(c[0]).includes(':startUtc'));
      expect(rangeCall).toBeDefined();
      const params = rangeCall![1] as { startUtc: Date; endUtc: Date };
      expect(params.startUtc.toISOString()).toBe('2026-02-28T21:00:00.000Z');
      expect(params.endUtc.toISOString()).toBe('2026-03-31T21:00:00.000Z');
      expect(String(rangeCall![0])).toContain("i.kind = 'task'");
    });

    it('omits the dueAt-only branch when includeTasks is false', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.exportIcs(ownerId, { ...range, includeTasks: false });

      const rangeCall = qb.andWhere.mock.calls.find((c) => String(c[0]).includes(':startUtc'));
      expect(String(rangeCall![0])).not.toContain('i.due_at');
    });

    it('renders VEVENT and VTODO components and no payload', async () => {
      items.createQueryBuilder.mockReturnValue(
        makeQueryBuilder([
          icsRow({ id: '1' }),
          icsRow({
            id: '2',
            kind: 'task',
            scheduledAt: null,
            dueAt: new Date('2026-03-05T15:30:00Z'),
          }),
        ]),
      );

      const ics = await service.exportIcs(ownerId, range);

      expect(ics).toContain('UID:item-1@husrevity');
      expect(ics).toContain('BEGIN:VTODO');
      expect(ics).toContain('UID:item-2@husrevity');
      expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
      expect(ics).not.toContain('secret');
    });

    it('applies the live-project and live-member visibility predicate', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.exportIcs(ownerId, range);

      const vis = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('project_member'));
      expect(vis).toBeDefined();
      const sql = String(vis![0]);
      expect(sql).toContain('i.project_id IS NULL AND i.owner_id = :userId');
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain('pm.deleted_at IS NULL');
      expect(sql).toContain('pm.user_id = :userId');
      expect(vis![1]).toEqual({ userId: ownerId });
    });

    it('selects only the columns the serializer reads', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.exportIcs(ownerId, range);

      const cols = qb.select.mock.calls[0][0] as string[];
      expect([...cols].sort()).toEqual(
        [
          'i.id',
          'i.kind',
          'i.title',
          'i.notes',
          'i.context',
          'i.scheduledAt',
          'i.dueAt',
          'i.durationMin',
          'i.rrule',
          'i.status',
          'i.completedAt',
        ].sort(),
      );
      expect(cols).not.toContain('i.payload');
    });

    it('drops a stored series whose rule does not parse, and keeps valid ones', async () => {
      items.createQueryBuilder.mockReturnValue(
        makeQueryBuilder([
          icsRow({ id: '1', rrule: 'FREQ=BROKEN' }),
          icsRow({ id: '2', rrule: 'FREQ=SECONDLY' }),
          icsRow({ id: '3', rrule: 'FREQ=DAILY' }),
        ]),
      );
      recurrence.expand.mockReturnValue([{ occursOn: '2026-03-09', occursAt: new Date() }]);

      const ics = await service.exportIcs(ownerId, range);

      expect(ics).not.toContain('UID:item-1@husrevity');
      expect(ics).not.toContain('UID:item-2@husrevity');
      expect(ics).toContain('UID:item-3@husrevity');
    });

    it('emits EXDATE lines for skipped occurrences only', async () => {
      items.createQueryBuilder.mockReturnValue(
        makeQueryBuilder([icsRow({ id: '1', rrule: 'FREQ=DAILY' })]),
      );
      recurrence.expand.mockReturnValue([{ occursOn: '2026-03-09', occursAt: new Date() }]);
      occurrences.find.mockResolvedValue([
        { itemId: '1', occursOn: '2026-03-04', status: 'skipped', completedAt: null },
        { itemId: '1', occursOn: '2026-03-05', status: 'done', completedAt: NOW },
        { itemId: '99', occursOn: '2026-03-06', status: 'skipped', completedAt: null },
      ]);

      const ics = await service.exportIcs(ownerId, range);

      expect(ics).toContain('EXDATE;TZID=Europe/Istanbul:20260304T100000');
      expect(ics).not.toContain('20260305T100000');
      expect(ics).not.toContain('20260306T100000');
      expect(occurrences.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ownerId }) }),
      );
    });

    it('does not load overrides when no recurring series is exported', async () => {
      items.createQueryBuilder.mockReturnValue(makeQueryBuilder([icsRow({ id: '1' })]));
      await service.exportIcs(ownerId, range);
      expect(occurrences.find).not.toHaveBeenCalled();
    });

    it('queries the half-open Istanbul day edges so 00:00:00 and 23:59:59 stay inside', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.exportIcs(ownerId, { from: '2026-03-01', to: '2026-03-01' });

      const rangeCall = qb.andWhere.mock.calls.find((c) => String(c[0]).includes(':startUtc'))!;
      const { startUtc, endUtc } = rangeCall[1] as { startUtc: Date; endUtc: Date };
      const atFrom = new Date('2026-03-01T00:00:00+03:00').getTime();
      const atTo = new Date('2026-03-01T23:59:59+03:00').getTime();
      expect(atFrom).toBeGreaterThanOrEqual(startUtc.getTime());
      expect(atTo).toBeLessThan(endUtc.getTime());
      expect(atFrom - 1).toBeLessThan(startUtc.getTime());
      expect(String(rangeCall[0])).toContain(
        'i.scheduled_at >= :startUtc AND i.scheduled_at < :endUtc',
      );
    });

    it('exports a recurring series once only when it overlaps the range, and when undecidable', async () => {
      items.createQueryBuilder.mockReturnValue(
        makeQueryBuilder([
          icsRow({ id: '1', rrule: 'FREQ=WEEKLY' }),
          icsRow({ id: '2', rrule: 'FREQ=WEEKLY;COUNT=1' }),
          icsRow({ id: '3', rrule: 'FREQ=MONTHLY' }),
        ]),
      );
      recurrence.expand.mockImplementation((it: Item) => {
        if (it.id === '1') return [{ occursOn: '2026-03-09', occursAt: new Date() }];
        if (it.id === '2') return [];
        throw new Error('bad rule');
      });

      const ics = await service.exportIcs(ownerId, range);

      expect(ics).toContain('UID:item-1@husrevity');
      expect(ics).not.toContain('UID:item-2@husrevity');
      expect(ics).toContain('UID:item-3@husrevity');
      const [, fromArg, toArg] = recurrence.expand.mock.calls[0];
      expect(fromArg.toISOString()).toBe('2026-02-28T21:00:00.000Z');
      expect(toArg.toISOString()).toBe('2026-03-31T20:59:59.999Z');
    });

    it('400s a malformed, reversed or over-366-day range without querying', async () => {
      const bad = [
        { from: '2026-3-1', to: '2026-03-31' },
        { from: '2026-02-30', to: '2026-03-31' },
        { from: '2026-03-31', to: '2026-03-01' },
        { from: '2026-01-01', to: '2027-01-02' },
        { from: undefined as unknown as string, to: '2026-03-01' },
      ];
      for (const q of bad) {
        await expect(service.exportIcs(ownerId, q)).rejects.toMatchObject({ status: 400 });
      }
      expect(items.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('accepts exactly 366 days inclusive', async () => {
      items.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));
      await expect(
        service.exportIcs(ownerId, { from: '2026-01-01', to: '2027-01-01' }),
      ).resolves.toContain('BEGIN:VCALENDAR');
      await expect(
        service.exportIcs(ownerId, { from: '2026-01-01', to: '2026-12-31' }),
      ).resolves.toContain('BEGIN:VCALENDAR');
      await expect(
        service.exportIcs(ownerId, { from: '2028-01-01', to: '2028-12-31' }),
      ).resolves.toContain('BEGIN:VCALENDAR');
    });

    it('queries at most 5001 rows and 400s when more than 5000 match', async () => {
      const many = Array.from({ length: 5001 }, (_, i) => icsRow({ id: String(i + 1) }));
      const qb = makeQueryBuilder(many);
      items.createQueryBuilder.mockReturnValue(qb);

      await expect(service.exportIcs(ownerId, range)).rejects.toMatchObject({ status: 400 });
      expect(qb.limit).toHaveBeenCalledWith(5001);
    });

    it('allows exactly 5000 components', async () => {
      const many = Array.from({ length: 5000 }, (_, i) => icsRow({ id: String(i + 1) }));
      items.createQueryBuilder.mockReturnValue(makeQueryBuilder(many));
      const ics = await service.exportIcs(ownerId, range);
      expect(ics.split('BEGIN:VEVENT')).toHaveLength(5001);
    });
  });

  describe('reopen', () => {
    it('sets status back to open and completedAt to null, and resyncs notifications', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        status: 'done',
        completedAt: NOW,
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      const result = await service.reopen(ownerId, '10');

      expect(result.status).toBe('open');
      expect(result.completedAt).toBeNull();
      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'open', completedAt: null }),
      );
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'item', '10');
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted item by clearing deletedAt and resyncs notifications', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        status: 'open',
        deletedAt: NOW,
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      const result = await service.restore(ownerId, '10');

      expect(items.findOne).toHaveBeenCalledWith({
        where: { id: '10' },
        withDeleted: true,
      });
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: null }));
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'item', '10');
      expect(result.id).toBe('10');
    });
  });

  describe('removeOccurrence', () => {
    it('deletes the occurrence row for the owner', async () => {
      occurrences.findOne.mockResolvedValueOnce({
        id: 'occ-1',
        ownerId,
        itemId: '10',
        occursOn: '2026-01-05',
        status: 'done',
      });

      await service.removeOccurrence(ownerId, 'occ-1');

      expect(occurrences.delete).toHaveBeenCalledWith({ id: 'occ-1' });
    });

    it('throws 404 when occurrence belongs to another owner', async () => {
      occurrences.findOne.mockResolvedValueOnce({
        id: 'occ-1',
        ownerId: 'other-user',
        itemId: '10',
        occursOn: '2026-01-05',
      });

      await expect(service.removeOccurrence(ownerId, 'occ-1')).rejects.toThrow(ApiException);
      expect(occurrences.delete).not.toHaveBeenCalled();
    });
  });

  describe('reopen with custom options', () => {
    it('restores previous status and completedAt when provided', async () => {
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        status: 'done',
        completedAt: NOW,
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      const prevCompletedAt = new Date('2026-01-02T10:00:00Z');
      const result = await (service as any).reopen(ownerId, '10', {
        status: 'cancelled',
        completedAt: prevCompletedAt,
      });

      expect(result.status).toBe('cancelled');
      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled', completedAt: prevCompletedAt }),
      );
    });
  });

  describe('updateOccurrence', () => {
    it('updates status and completedAt on existing occurrence', async () => {
      const occRow = {
        id: 'occ-1',
        ownerId,
        itemId: '10',
        occursOn: '2026-01-05',
        status: 'done',
        completedAt: NOW,
      };
      occurrences.findOne.mockResolvedValueOnce(occRow);

      await (service as any).updateOccurrence(ownerId, 'occ-1', {
        status: 'open',
        completedAt: null,
      });

      expect(occurrences.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'occ-1',
          status: 'open',
          completedAt: null,
        }),
      );
    });
  });

  describe('EntityManager and transaction side-effects', () => {
    it('uses manager.getRepository when EntityManager is provided, and defers side effects', async () => {
      const mockManagerRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: '10',
          ownerId,
          projectId: null,
          title: 'Old',
          status: 'open',
          payload: {},
          createdAt: NOW,
          updatedAt: NOW,
        }),
        save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, updatedAt: NOW })),
      };
      const postCommitCallbacks: Array<() => Promise<void>> = [];
      const fakeManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
        __postCommit: postCommitCallbacks,
      };

      await service.update(ownerId, '10', { title: 'New Title' }, undefined, fakeManager as any);

      // Verified manager repo was used, not the default items repo
      expect(fakeManager.getRepository).toHaveBeenCalledWith(Item);
      expect(mockManagerRepo.save).toHaveBeenCalled();
      expect(items.save).not.toHaveBeenCalled();

      // Side-effect was deferred into postCommitCallbacks, not run immediately
      expect(postCommitCallbacks).toHaveLength(1);
      expect(notifications.cancelForSource).not.toHaveBeenCalled();

      // Running post-commit callback executes side effects
      await postCommitCallbacks[0]();
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'item', '10');
    });
  });

  describe('syncNotification with legacy tables (M1)', () => {
    it('cancels stale item notification and enqueues NO item notification for mirrored reminder', async () => {
      const futureDue = new Date(Date.now() + 3600_000);
      const row = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Mirrored reminder',
        legacyTable: 'reminder',
        legacyId: '100',
        dueAt: futureDue,
        notifyMinutesBefore: 15,
        status: 'open',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      await service.update(ownerId, '10', { title: 'Updated reminder' });

      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'item', '10');
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('enqueues item notification for native item (legacyTable null)', async () => {
      const futureDue = new Date(Date.now() + 3600_000);
      const row = {
        id: '20',
        ownerId,
        projectId: null,
        title: 'Native task',
        legacyTable: null,
        legacyId: null,
        dueAt: futureDue,
        notifyMinutesBefore: 15,
        status: 'open',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      await service.update(ownerId, '20', { title: 'Updated native task' });

      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'item', '20');
      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId,
          kind: 'item',
          sourceId: '20',
        }),
      );
    });

    it('enqueues item notification for table without a legacy notification kind (e.g. routine_segment)', async () => {
      const futureScheduled = new Date(Date.now() + 3600_000);
      const row = {
        id: '30',
        ownerId,
        projectId: null,
        title: 'Routine segment item',
        legacyTable: 'routine_segment',
        legacyId: '200',
        scheduledAt: futureScheduled,
        notifyMinutesBefore: 10,
        status: 'open',
        payload: {},
        createdAt: NOW,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(row);

      await service.update(ownerId, '30', { title: 'Updated routine item' });

      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'item', '30');
      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId,
          kind: 'item',
          sourceId: '30',
        }),
      );
    });
  });

  describe('goalId on items', () => {
    it('sets goalId on create when valid', async () => {
      const res = await service.create(ownerId, {
        kind: 'task',
        title: 'Task with goal',
        goalId: '5',
      });
      expect(goalService.validateLiveGoal).toHaveBeenCalledWith(ownerId, '5', undefined);
      expect(res.goalId).toBe('5');
    });

    it('rejects foreign or nonexistent goalId on create with 404', async () => {
      goalService.validateLiveGoal.mockRejectedValueOnce(ApiException.notFound('Goal not found'));
      await expect(
        service.create(ownerId, {
          kind: 'task',
          title: 'Task with invalid goal',
          goalId: '999',
        }),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('in a shared project, goalId must belong to the acting user (userId)', async () => {
      access.requireAccess.mockResolvedValueOnce({
        project: { id: 'proj-1', ownerId: 'other-user-99' },
      });

      const res = await service.create(ownerId, {
        kind: 'task',
        title: 'Project task with personal goal',
        projectId: 'proj-1',
        goalId: '5',
      });

      // Crucial: validateLiveGoal must be called with ownerId (acting user), not project.ownerId!
      expect(goalService.validateLiveGoal).toHaveBeenCalledWith(ownerId, '5', undefined);
      expect(res.goalId).toBe('5');
    });

    it('sets goalId on update when valid', async () => {
      const existing = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Task',
        goalId: null,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(existing);

      const res = await service.update(ownerId, '10', { goalId: '5' });
      expect(goalService.validateLiveGoal).toHaveBeenCalledWith(ownerId, '5', undefined);
      expect(res.goalId).toBe('5');
    });

    it('clears goalId on update when null is passed', async () => {
      const existing = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Task',
        goalId: '5',
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(existing);

      const res = await service.update(ownerId, '10', { goalId: null });
      expect(goalService.validateLiveGoal).not.toHaveBeenCalled();
      expect(res.goalId).toBeNull();
    });

    it('absence of goalId on update leaves existing value untouched', async () => {
      const existing = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Task',
        goalId: '5',
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(existing);

      const res = await service.update(ownerId, '10', { title: 'Renamed' });
      expect(goalService.validateLiveGoal).not.toHaveBeenCalled();
      expect(res.goalId).toBe('5');
    });

    it('rejects foreign or deleted goalId on update with 404', async () => {
      const existing = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Task',
        goalId: null,
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(existing);
      goalService.validateLiveGoal.mockRejectedValueOnce(ApiException.notFound('Goal not found'));

      await expect(service.update(ownerId, '10', { goalId: '999' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('does not re-validate goalId on update when goalId has not changed (echoed goal)', async () => {
      const existing = {
        id: '10',
        ownerId,
        projectId: null,
        title: 'Task',
        goalId: '5',
        updatedAt: NOW,
      } as Item;
      items.findOne.mockResolvedValueOnce(existing);
      // Even if validateLiveGoal would fail, it should not be called because goalId did not change
      goalService.validateLiveGoal.mockRejectedValueOnce(ApiException.notFound('Goal not found'));

      const res = await service.update(ownerId, '10', { goalId: '5', title: 'Renamed' });
      expect(goalService.validateLiveGoal).not.toHaveBeenCalled();
      expect(res.goalId).toBe('5');
    });

    it('rejects empty string goalId on item DTO with validation error', async () => {
      const { validate } = require('class-validator');
      const { plainToInstance } = require('class-transformer');
      const { ItemRequestDto } = require('./dto/item-dtos');

      const invalidDto = plainToInstance(ItemRequestDto, {
        kind: 'task',
        title: 'Task',
        goalId: '',
      });
      const errors = await validate(invalidDto);
      expect(errors.some((e: any) => e.property === 'goalId')).toBe(true);

      for (const goalId of [null, '123', undefined]) {
        const validDto = plainToInstance(ItemRequestDto, {
          kind: 'task',
          title: 'Task',
          goalId,
        });
        const valErrors = await validate(validDto);
        expect(valErrors.some((e: any) => e.property === 'goalId')).toBe(false);
      }
    });
  });
});
