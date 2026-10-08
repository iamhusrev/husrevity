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
};

function makeQueryBuilder(rows: Item[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.addOrderBy = jest.fn().mockReturnValue(qb);
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
    };
    access = { requireAccess: jest.fn() };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };
    recurrence = { expand: jest.fn().mockReturnValue([]) };
    googleCalendarService = { syncItemToGoogleCalendar: jest.fn().mockResolvedValue(null) };

    const module = await Test.createTestingModule({
      providers: [
        ItemService,
        { provide: getRepositoryToken(Item), useValue: items },
        { provide: getRepositoryToken(ItemOccurrence), useValue: occurrences },
        { provide: ProjectAccessService, useValue: access },
        { provide: NotificationService, useValue: notifications },
        { provide: ItemRecurrenceService, useValue: recurrence },
        { provide: GoogleCalendarService, useValue: googleCalendarService },
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
    });
  });

  describe('list', () => {
    it('always filters by ownerId regardless of other query params', async () => {
      const qb = makeQueryBuilder([]);
      items.createQueryBuilder.mockReturnValue(qb);

      await service.list(ownerId, {});

      expect(qb.where).toHaveBeenCalledWith('i.owner_id = :ownerId', { ownerId });
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
});
