import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChangeSetService, extractItemSnapshot } from './change-set.service';
import { ChangeSet } from './entities/change-set.entity';
import { ChangeEntry } from './entities/change-entry.entity';
import { Item } from '../item/item.entity';
import { ItemOccurrence } from '../item/item-occurrence.entity';
import { Goal } from '../goal/goal.entity';
import { ItemService } from '../item/item.service';
import { ApiException } from '../common/api.exception';

type MockRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  delete: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
};

describe('ChangeSetService', () => {
  const ownerId = '1';
  const otherOwnerId = '999';
  const NOW = new Date('2026-01-01T12:00:00Z');
  const LATER = new Date('2026-01-01T13:00:00Z');

  let service: ChangeSetService;
  let changeSetRepo: MockRepo;
  let entryRepo: MockRepo;
  let itemRepo: MockRepo;
  let occurrenceRepo: MockRepo;
  let goalRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let itemService: {
    create: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    restore: jest.Mock;
    reopen: jest.Mock;
    removeOccurrence: jest.Mock;
    updateOccurrence: jest.Mock;
    findOccurrence: jest.Mock;
    completeWithDetails: jest.Mock;
    get: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    changeSetRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((v) => ({ id: '1', status: 'applied', ...v })),
      save: jest.fn((v) => Promise.resolve({ id: '1', ...v })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    entryRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v) => ({ id: 'entry-1', ...v })),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    itemRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    occurrenceRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    goalRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    itemService = {
      create: jest.fn().mockResolvedValue({ id: '10' }),
      delete: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ id: '10' }),
      restore: jest.fn().mockResolvedValue({ id: '10' }),
      reopen: jest.fn().mockResolvedValue({ id: '10' }),
      removeOccurrence: jest.fn().mockResolvedValue(undefined),
      updateOccurrence: jest.fn().mockResolvedValue({ id: 'occ-1' }),
      findOccurrence: jest.fn().mockResolvedValue(null),
      completeWithDetails: jest.fn().mockResolvedValue({ item: { id: '10' } }),
      get: jest.fn().mockResolvedValue({ id: '10' }),
    };

    const defaultFakeManager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === ChangeSet) return changeSetRepo;
        if (entity === ChangeEntry) return entryRepo;
        if (entity === Item) return itemRepo;
        if (entity === ItemOccurrence) return occurrenceRepo;
        if (entity === Goal) return goalRepo;
        throw new Error('Unknown entity in fake manager: ' + entity);
      }),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (em: any) => Promise<any>) => cb(defaultFakeManager)),
    };

    const module = await Test.createTestingModule({
      providers: [
        ChangeSetService,
        { provide: getRepositoryToken(ChangeSet), useValue: changeSetRepo },
        { provide: getRepositoryToken(ChangeEntry), useValue: entryRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(ItemOccurrence), useValue: occurrenceRepo },
        { provide: ItemService, useValue: itemService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ChangeSetService);
  });

  describe('extractItemSnapshot', () => {
    it('captures only domain fields and never sensitive secrets', () => {
      const item: any = {
        id: '10',
        title: 'Work task',
        notes: 'my notes',
        context: 'work',
        projectId: '2',
        goalId: '5',
        blockId: null,
        scheduledAt: NOW,
        durationMin: 30,
        dueAt: LATER,
        notifyMinutesBefore: 15,
        rrule: null,
        status: 'open',
        completedAt: null,
        payload: { tag: 'urgent' },
        updatedAt: NOW,
        secretToken: 'sensitive-token',
        password: 'password-123',
      };

      const snapshot = extractItemSnapshot(item);

      expect(snapshot).toEqual({
        title: 'Work task',
        notes: 'my notes',
        context: 'work',
        projectId: '2',
        goalId: '5',
        blockId: null,
        scheduledAt: NOW.toISOString(),
        durationMin: 30,
        dueAt: LATER.toISOString(),
        notifyMinutesBefore: 15,
        rrule: null,
        status: 'open',
        completedAt: null,
        payload: { tag: 'urgent' },
        updatedAt: NOW.toISOString(),
      });
      expect((snapshot as any).secretToken).toBeUndefined();
      expect((snapshot as any).password).toBeUndefined();
    });
  });

  describe('begin and recordEntry', () => {
    it('truncates label to 200 characters with ellipsis when label exceeds 200 characters', async () => {
      const longTitle = 'A'.repeat(255);
      const longLabel = `create_item: ${longTitle}`;
      changeSetRepo.save.mockResolvedValueOnce({
        id: 'cs-long',
        ownerId,
        source: 'mcp',
        label: longLabel.slice(0, 197) + '...',
        status: 'applied',
      });

      await service.begin(ownerId, { source: 'mcp', label: longLabel });

      expect(changeSetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.stringMatching(/^create_item: A+\.\.\.$/),
        }),
      );
      const createdArg = changeSetRepo.create.mock.calls[0][0];
      expect(createdArg.label.length).toBe(200);
      expect(createdArg.label.endsWith('...')).toBe(true);
    });

    it('creates change_set and records entries with sequential ordinals', async () => {
      changeSetRepo.save.mockResolvedValueOnce({
        id: 'cs-1',
        ownerId,
        source: 'mcp',
        label: 'create_item: Test',
        status: 'applied',
      });
      entryRepo.find.mockResolvedValueOnce([]); // no existing entries yet

      const csId = await service.begin(ownerId, { source: 'mcp', label: 'create_item: Test' });
      expect(csId).toBe('cs-1');

      await service.recordEntry('cs-1', ownerId, {
        targetType: 'item',
        targetId: '10',
        op: 'create',
        after: { title: 'Test' },
      });

      expect(entryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          changeSetId: 'cs-1',
          ownerId,
          ordinal: 1,
          targetType: 'item',
          targetId: '10',
          op: 'create',
        }),
      );

      // Second entry gets ordinal 2
      entryRepo.find.mockResolvedValueOnce([{ ordinal: 1 }]);
      await service.recordEntry('cs-1', ownerId, {
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Test' },
        after: { title: 'Test 2' },
      });

      expect(entryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          changeSetId: 'cs-1',
          ownerId,
          ordinal: 2,
        }),
      );
    });
  });

  describe('runWithChangeSet', () => {
    it('removes change_set when zero entries were recorded', async () => {
      changeSetRepo.save.mockResolvedValueOnce({ id: 'cs-empty', ownerId });
      entryRepo.count.mockResolvedValueOnce(0);

      const { result, changeSetId } = await service.runWithChangeSet(
        ownerId,
        { source: 'mcp', label: 'noop' },
        async () => {
          return 'done';
        },
      );

      expect(result).toBe('done');
      expect(changeSetId).toBeNull();
      expect(changeSetRepo.delete).toHaveBeenCalledWith({ id: 'cs-empty' });
    });

    it('persists change_set when entries were recorded', async () => {
      changeSetRepo.save.mockResolvedValueOnce({ id: 'cs-has-entries', ownerId });
      entryRepo.count.mockResolvedValueOnce(2);

      const { result, changeSetId } = await service.runWithChangeSet(
        ownerId,
        { source: 'mcp', label: 'with-entries' },
        async (id: string) => {
          return { id };
        },
      );

      expect(changeSetId).toBe('cs-has-entries');
      expect(changeSetRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('list and get id validation', () => {
    it.each(['abc', '', '1'.repeat(40)])(
      'list throws 400 badRequest when before is "%s"',
      async (invalidBefore) => {
        await expect(service.list(ownerId, { before: invalidBefore })).rejects.toThrow(
          ApiException,
        );
        try {
          await service.list(ownerId, { before: invalidBefore });
        } catch (err: any) {
          expect(err.getStatus()).toBe(400);
        }
      },
    );

    it.each(['abc', '', '1'.repeat(40)])(
      'get throws 400 badRequest when id is "%s"',
      async (invalidId) => {
        await expect(service.get(ownerId, invalidId)).rejects.toThrow(ApiException);
        try {
          await service.get(ownerId, invalidId);
        } catch (err: any) {
          expect(err.getStatus()).toBe(400);
        }
      },
    );

    it('issues entry-count query once per list call using grouped count', async () => {
      const qbChangeSet: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: '1', source: 'mcp', label: 'cs1', status: 'applied', createdAt: NOW },
          { id: '2', source: 'mcp', label: 'cs2', status: 'applied', createdAt: NOW },
          { id: '3', source: 'mcp', label: 'cs3', status: 'applied', createdAt: NOW },
        ]),
      };
      changeSetRepo.createQueryBuilder.mockReturnValue(qbChangeSet);

      const qbEntry: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { changeSetId: '1', count: '3' },
          { changeSetId: '2', count: '1' },
          { changeSetId: '3', count: '0' },
        ]),
      };
      entryRepo.createQueryBuilder.mockReturnValue(qbEntry);

      const res = await service.list(ownerId, { limit: 20 });

      expect(entryRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(entryRepo.count).not.toHaveBeenCalled();
      expect(res.items).toHaveLength(3);
      expect(res.items[0].entryCount).toBe(3);
      expect(res.items[1].entryCount).toBe(1);
      expect(res.items[2].entryCount).toBe(0);
    });
  });

  describe('undo', () => {
    it.each(['abc', '', '1'.repeat(40)])(
      'throws 400 badRequest when changeSetId is "%s"',
      async (invalidId) => {
        await expect(service.undo(ownerId, invalidId)).rejects.toThrow(ApiException);
        try {
          await service.undo(ownerId, invalidId);
        } catch (err: any) {
          expect(err.getStatus()).toBe(400);
        }
      },
    );

    it('throws 404 when change_set belongs to another user', async () => {
      changeSetRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.undo(otherOwnerId, '123')).rejects.toThrow(ApiException);
    });

    it('loads change_set with pessimistic write lock and performs zero writes if already undone', async () => {
      const fakeManager = {
        getRepository: jest.fn((entity: any) => {
          if (entity === ChangeSet) return changeSetRepo;
          if (entity === ChangeEntry) return entryRepo;
          return {};
        }),
      };
      dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(fakeManager));

      changeSetRepo.findOne.mockResolvedValueOnce({
        id: '1',
        ownerId,
        status: 'undone',
        entries: [{ id: '1', ordinal: 1 }],
      });

      const res = await service.undo(ownerId, '1');

      expect(changeSetRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '1', ownerId },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(res.status).toBe('undone');
      expect(itemService.delete).not.toHaveBeenCalled();
      expect(itemService.update).not.toHaveBeenCalled();
      expect(changeSetRepo.save).not.toHaveBeenCalled();
    });

    it('guarantees atomicity via manager and leaves status applied when entry 2 fails', async () => {
      const fakeManager = {
        getRepository: jest.fn((entity: any) => {
          if (entity === ChangeSet) return changeSetRepo;
          if (entity === ChangeEntry) return entryRepo;
          if (entity === Item) return itemRepo;
          if (entity === ItemOccurrence) return occurrenceRepo;
          return {};
        }),
      };
      dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(fakeManager));

      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      entryRepo.find.mockResolvedValueOnce([
        {
          id: 'e2',
          ordinal: 2,
          targetType: 'item',
          targetId: '20',
          op: 'update',
          after: { updatedAt: NOW.toISOString() },
        },
        {
          id: 'e1',
          ordinal: 1,
          targetType: 'item',
          targetId: '10',
          op: 'update',
          after: { updatedAt: NOW.toISOString() },
        },
      ]);
      itemRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === '20') return { id: '20', ownerId, updatedAt: NOW };
        if (where.id === '10') return { id: '10', ownerId, updatedAt: NOW };
        return null;
      });

      // Entry 2 (first in reverse order) succeeds, entry 1 throws error
      itemService.update.mockResolvedValueOnce({ id: '20' });
      itemService.update.mockRejectedValueOnce(new Error('Failure at entry 1'));

      await expect(service.undo(ownerId, '1')).rejects.toThrow('Failure at entry 1');

      // Assert manager was passed to itemService
      expect(itemService.update).toHaveBeenCalledWith(
        ownerId,
        '20',
        expect.anything(),
        undefined,
        fakeManager,
      );
      // Status in repository was NOT changed to undone
      expect(changeSetRepo.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'undone' }),
      );
    });

    it('applies entries in reverse ordinal order through ItemService', async () => {
      const callOrder: string[] = [];
      itemService.delete.mockImplementation(async () => {
        callOrder.push('delete:2');
      });
      itemService.update.mockImplementation(async () => {
        callOrder.push('update:1');
      });

      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const e1 = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Old' },
        after: { title: 'New', updatedAt: NOW.toISOString() },
      };
      const e2 = {
        id: 'e2',
        ordinal: 2,
        targetType: 'item',
        targetId: '20',
        op: 'create',
        after: { title: 'Created', updatedAt: NOW.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([e2, e1]); // DESC
      entryRepo.find.mockResolvedValueOnce([
        { ...e2, undoneAt: NOW },
        { ...e1, undoneAt: NOW },
      ]); // For all undone check

      // Both items are at NOW (not modified since after)
      itemRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === '20') return { id: '20', ownerId, updatedAt: NOW };
        if (where.id === '10') return { id: '10', ownerId, updatedAt: NOW };
        return null;
      });

      const res = await service.undo(ownerId, '1');

      expect(callOrder).toEqual(['delete:2', 'update:1']);
      expect(res.status).toBe('undone');
      expect(res.undoneEntries).toBe(2);
      expect(res.conflicts).toHaveLength(0);
      expect(changeSetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'undone' }),
      );
    });

    it('tracks per-entry undoneAt and converges status to undone on re-undo', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'partially_undone',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);

      // Entry 1 was already undone (has undoneAt), Entry 2 had conflicted
      const entry1 = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Old 1' },
        after: { updatedAt: NOW.toISOString() },
        undoneAt: NOW,
      };
      const entry2 = {
        id: 'e2',
        ordinal: 2,
        targetType: 'item',
        targetId: '20',
        op: 'update',
        before: { title: 'Old 2' },
        after: { updatedAt: NOW.toISOString() },
        undoneAt: null,
      };
      entryRepo.find.mockResolvedValueOnce([entry2, entry1]); // DESC order
      entryRepo.find.mockResolvedValueOnce([{ ...entry2, undoneAt: NOW }, entry1]); // For checking all entries undone

      itemRepo.findOne.mockResolvedValueOnce({
        id: '20',
        ownerId,
        updatedAt: NOW,
      });

      const res = await service.undo(ownerId, '1');

      // Entry 1 was skipped (not re-run)
      expect(itemService.update).toHaveBeenCalledTimes(1);
      expect(itemService.update).toHaveBeenCalledWith(
        ownerId,
        '20',
        { title: 'Old 2' },
        undefined,
        expect.anything(),
      );
      // Entry 2 marked undone
      expect(entryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e2', undoneAt: expect.any(Date) }),
      );
      // Status converges to undone
      expect(res.status).toBe('undone');
      expect(changeSetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'undone' }),
      );
    });

    it('handles same-item two-entry undo (update + complete) without false conflict', async () => {
      const T1 = new Date('2026-01-01T12:00:00Z');
      const T2 = new Date('2026-01-01T12:05:00Z');

      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);

      const entry1 = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Original Title' },
        after: { title: 'Updated Title', updatedAt: T1.toISOString() },
      };
      const entry2 = {
        id: 'e2',
        ordinal: 2,
        targetType: 'item',
        targetId: '10',
        op: 'complete',
        before: { status: 'open', completedAt: null },
        after: { status: 'done', completedAt: T2.toISOString(), updatedAt: T2.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry2, entry1]);
      entryRepo.find.mockResolvedValueOnce([
        { ...entry2, undoneAt: T2 },
        { ...entry1, undoneAt: T2 },
      ]);

      // At start of transaction, item is at T2 (the latest state produced by this change set)
      itemRepo.findOne.mockResolvedValue({
        id: '10',
        ownerId,
        status: 'done',
        updatedAt: T2,
      });

      const res = await service.undo(ownerId, '1');

      expect(itemService.reopen).toHaveBeenCalledWith(
        ownerId,
        '10',
        expect.objectContaining({ status: 'open' }),
        expect.anything(),
      );
      expect(itemService.update).toHaveBeenCalledWith(
        ownerId,
        '10',
        expect.objectContaining({ title: 'Original Title' }),
        undefined,
        expect.anything(),
      );
      expect(res.conflicts).toHaveLength(0);
      expect(res.status).toBe('undone');
    });

    it('reports conflict when a third party edited the item after the change set (newer than every after.updatedAt)', async () => {
      const T1 = new Date('2026-01-01T12:00:00Z');
      const T2 = new Date('2026-01-01T12:05:00Z');
      const T3 = new Date('2026-01-01T12:10:00Z'); // Third party edit after the set

      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);

      const entry1 = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Original Title' },
        after: { title: 'Updated Title', updatedAt: T1.toISOString() },
      };
      const entry2 = {
        id: 'e2',
        ordinal: 2,
        targetType: 'item',
        targetId: '10',
        op: 'complete',
        before: { status: 'open', completedAt: null },
        after: { status: 'done', completedAt: T2.toISOString(), updatedAt: T2.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry2, entry1]);
      entryRepo.find.mockResolvedValueOnce([entry2, entry1]);

      // Item was modified at T3 by a third party
      itemRepo.findOne.mockResolvedValue({
        id: '10',
        ownerId,
        status: 'done',
        updatedAt: T3,
      });

      const res = await service.undo(ownerId, '1');

      expect(res.conflicts).toEqual([
        expect.objectContaining({
          targetType: 'item',
          targetId: '10',
          reason: 'Item was modified after this change set',
        }),
        expect.objectContaining({
          targetType: 'item',
          targetId: '10',
          reason: 'Item was modified after this change set',
        }),
      ]);
      expect(res.status).toBe('partially_undone');
      expect(itemService.reopen).not.toHaveBeenCalled();
      expect(itemService.update).not.toHaveBeenCalled();
    });

    it('restores pre-existing occurrence status and completedAt when undoing recurring completion', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item_occurrence',
        targetId: 'occ-1',
        op: 'update',
        before: { status: 'skipped', completedAt: null },
        after: { status: 'done', completedAt: NOW.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry]);
      entryRepo.find.mockResolvedValueOnce([{ ...entry, undoneAt: NOW }]);
      occurrenceRepo.findOne.mockResolvedValueOnce({
        id: 'occ-1',
        ownerId,
        status: 'done',
      });

      await service.undo(ownerId, '1');

      expect(itemService.updateOccurrence).toHaveBeenCalledWith(
        ownerId,
        'occ-1',
        { status: 'skipped', completedAt: null },
        expect.anything(),
      );
    });

    it('restores cancelled status when undoing completion of a cancelled item', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'complete',
        before: { status: 'cancelled', completedAt: null },
        after: { status: 'done', completedAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry]);
      entryRepo.find.mockResolvedValueOnce([{ ...entry, undoneAt: NOW }]);
      itemRepo.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId,
        status: 'done',
        updatedAt: NOW,
      });

      await service.undo(ownerId, '1');

      expect(itemService.reopen).toHaveBeenCalledWith(
        ownerId,
        '10',
        { status: 'cancelled', completedAt: null },
        expect.anything(),
      );
    });

    it('reports conflict with reason not_owner when item target belongs to another user and writes nothing', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Old' },
        after: { title: 'New', updatedAt: NOW.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry]);
      entryRepo.find.mockResolvedValueOnce([entry]);
      // Item belongs to otherOwnerId (999)
      itemRepo.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId: otherOwnerId,
        updatedAt: NOW,
      });

      const res = await service.undo(ownerId, '1');

      expect(res.conflicts).toEqual([{ targetType: 'item', targetId: '10', reason: 'not_owner' }]);
      expect(itemService.update).not.toHaveBeenCalled();
      expect(res.status).toBe('partially_undone');
    });

    it('ensures undo never modifies or writes ownerId on target item', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Old', projectId: '2', ownerId: 'other-owner' },
        after: { title: 'New', updatedAt: NOW.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry]);
      entryRepo.find.mockResolvedValueOnce([{ ...entry, undoneAt: NOW }]);
      itemRepo.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId,
        updatedAt: NOW,
      });

      await service.undo(ownerId, '1');

      expect(itemService.update).toHaveBeenCalledWith(
        ownerId,
        '10',
        expect.not.objectContaining({ ownerId: expect.anything() }),
        undefined,
        expect.anything(),
      );
      const updateCallArgs = itemService.update.mock.calls[0][2];
      expect(updateCallArgs.ownerId).toBeUndefined();
    });

    it('reports conflict with reason no_access and continues undo when update restoring old project fails with 403', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry2 = {
        id: 'e2',
        ordinal: 2,
        targetType: 'item',
        targetId: '20',
        op: 'update',
        before: { title: 'Project task', projectId: 'proj-old' },
        after: { title: 'Personal task', projectId: null, updatedAt: NOW.toISOString() },
      };
      const entry1 = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Task 1' },
        after: { title: 'Task 1 Updated', updatedAt: NOW.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry2, entry1]);
      entryRepo.find.mockResolvedValueOnce([entry2, { ...entry1, undoneAt: NOW }]);
      itemRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === '20') return { id: '20', ownerId, updatedAt: NOW };
        if (where.id === '10') return { id: '10', ownerId, updatedAt: NOW };
        return null;
      });

      // Entry 2 fails with 403 Forbidden because caller lost access to proj-old
      itemService.update.mockRejectedValueOnce(
        ApiException.forbidden('You do not have permission to do this in this project'),
      );
      // Entry 1 succeeds
      itemService.update.mockResolvedValueOnce({ id: '10' });

      const res = await service.undo(ownerId, '1');

      expect(res.conflicts).toEqual([{ targetType: 'item', targetId: '20', reason: 'no_access' }]);
      expect(res.status).toBe('partially_undone');
      expect(res.undoneEntries).toBe(1);
      // Entry 1 was still undone successfully
      expect(itemService.update).toHaveBeenCalledWith(
        ownerId,
        '10',
        { title: 'Task 1' },
        undefined,
        expect.anything(),
      );
    });

    it('handles op: delete by restoring the soft-deleted item', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'delete',
        before: { title: 'Was deleted' },
      };
      entryRepo.find.mockResolvedValueOnce([entry]);
      entryRepo.find.mockResolvedValueOnce([{ ...entry, undoneAt: NOW }]);
      itemRepo.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId,
        deletedAt: NOW,
      });

      const res = await service.undo(ownerId, '1');

      expect(itemService.restore).toHaveBeenCalledWith(ownerId, '10', expect.anything());
      expect(res.status).toBe('undone');
      expect(res.undoneEntries).toBe(1);
    });

    it('skips modified items and reports conflicts with partially_undone status', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Original' },
        after: { title: 'Modified in CS', updatedAt: NOW.toISOString() },
      };
      entryRepo.find.mockResolvedValueOnce([entry]);
      entryRepo.find.mockResolvedValueOnce([entry]);
      // Item was modified at LATER > NOW
      itemRepo.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId,
        updatedAt: LATER,
      });

      const res = await service.undo(ownerId, '1');

      expect(itemService.update).not.toHaveBeenCalled();
      expect(res.status).toBe('partially_undone');
      expect(res.undoneEntries).toBe(0);
      expect(res.conflicts).toEqual([
        expect.objectContaining({
          targetType: 'item',
          targetId: '10',
        }),
      ]);
      expect(changeSetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'partially_undone' }),
      );
    });

    it('rolls back: when second item write throws, transaction callback rejects, no status update to undone/partially_undone is issued, and post-commit side effects are not executed', async () => {
      const postCommitSideEffect = jest.fn().mockResolvedValue(undefined);

      let callbackRejected = false;
      const fakeManager = {
        getRepository: jest.fn((entity: any) => {
          if (entity === ChangeSet) return changeSetRepo;
          if (entity === ChangeEntry) return entryRepo;
          if (entity === Item) return itemRepo;
          if (entity === ItemOccurrence) return occurrenceRepo;
          return {};
        }),
      };

      dataSource.transaction.mockImplementationOnce(async (cb: any) => {
        try {
          return await cb(fakeManager);
        } catch (err) {
          callbackRejected = true;
          throw err;
        }
      });

      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);

      const entry2 = {
        id: 'e2',
        ordinal: 2,
        targetType: 'item',
        targetId: '20',
        op: 'update',
        before: { title: 'First Undone Item' },
        after: { title: 'Title 20', updatedAt: NOW.toISOString() },
      };
      const entry1 = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Second Undone Item' },
        after: { title: 'Title 10', updatedAt: NOW.toISOString() },
      };

      entryRepo.find.mockResolvedValueOnce([entry2, entry1]); // DESC order
      itemRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === '20') return { id: '20', ownerId, updatedAt: NOW };
        if (where.id === '10') return { id: '10', ownerId, updatedAt: NOW };
        return null;
      });

      // First item write (entry 2 in reverse order) succeeds and enqueues a post-commit side effect
      itemService.update.mockImplementationOnce(async (_owner, _id, _fields, _ifMatch, manager) => {
        if (manager && Array.isArray(manager.__postCommit)) {
          manager.__postCommit.push(postCommitSideEffect);
        }
        return { id: '20' };
      });

      // Second item write (entry 1 in reverse order) throws a database error
      itemService.update.mockRejectedValueOnce(
        new Error('Postgres connection severed on second item write'),
      );

      await expect(service.undo(ownerId, '1')).rejects.toThrow(
        'Postgres connection severed on second item write',
      );

      // 1. Transaction callback rejected (so a real database would roll back)
      expect(callbackRejected).toBe(true);

      // 2. NO status update to undone or partially_undone was issued through any repository
      expect(changeSetRepo.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'undone' }),
      );
      expect(changeSetRepo.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'partially_undone' }),
      );

      // 3. Post-commit side effects (notification / Google sync) were NOT executed
      expect(postCommitSideEffect).not.toHaveBeenCalled();
    });

    it('drops goalId from restored fields when the goal is no longer live, allowing undo to succeed', async () => {
      const cs = {
        id: '1',
        ownerId,
        status: 'applied',
      };
      changeSetRepo.findOne.mockResolvedValueOnce(cs);
      const entry = {
        id: 'e1',
        ordinal: 1,
        targetType: 'item',
        targetId: '10',
        op: 'update',
        before: { title: 'Old Title', goalId: '99' },
        after: { title: 'New Title', goalId: '99', updatedAt: NOW.toISOString() },
        undoneAt: null,
      };
      entryRepo.find.mockResolvedValueOnce([entry]);
      entryRepo.find.mockResolvedValueOnce([{ ...entry, undoneAt: NOW }]);

      itemRepo.findOne.mockResolvedValueOnce({
        id: '10',
        ownerId,
        title: 'New Title',
        goalId: '99',
        updatedAt: NOW,
      });

      // Goal 99 was deleted since
      goalRepo.findOne.mockResolvedValueOnce(null);

      const res = await service.undo(ownerId, '1');

      expect(res.status).toBe('undone');
      expect(itemService.update).toHaveBeenCalledWith(
        ownerId,
        '10',
        expect.not.objectContaining({ goalId: expect.anything() }),
        undefined,
        expect.anything(),
      );
    });
  });
});
