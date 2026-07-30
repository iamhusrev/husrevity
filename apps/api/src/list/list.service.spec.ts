import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ListService } from './list.service';
import { TodoList } from './todo-list.entity';
import { ListItem } from './list-item.entity';
import { ListSection } from './list-section.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';

type MockListRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
};

type MockQueryBuilder = {
  innerJoin: jest.Mock;
  where: jest.Mock;
  withDeleted: jest.Mock;
  getOne: jest.Mock;
};

function makeQueryBuilder(getOneResults: unknown[]): MockQueryBuilder {
  const qb: Partial<MockQueryBuilder> = {};
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.withDeleted = jest.fn().mockReturnValue(qb);
  qb.getOne = jest.fn(() => Promise.resolve(getOneResults.shift()));
  return qb as MockQueryBuilder;
}

describe('ListService', () => {
  const ownerId = '1';

  let service: ListService;
  let lists: MockListRepo;
  let items: { restore: jest.Mock; createQueryBuilder: jest.Mock; find: jest.Mock };
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };

  beforeEach(async () => {
    lists = { findOne: jest.fn(), restore: jest.fn() };
    items = { restore: jest.fn(), createQueryBuilder: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ListService,
        { provide: getRepositoryToken(TodoList), useValue: lists },
        { provide: getRepositoryToken(ListItem), useValue: items },
        { provide: getRepositoryToken(ListSection), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ListService);
  });

  describe('restore', () => {
    const id = '60';
    const deletedRow = {
      id,
      ownerId,
      name: 'Packing list',
      color: null,
      icon: null,
      archived: false,
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as unknown as TodoList;
    const liveRow = { ...deletedRow, deletedAt: null } as unknown as TodoList;

    it('restores a soft-deleted list and returns the live DTO', async () => {
      lists.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      const result = await service.restore(ownerId, id);

      expect(lists.findOne).toHaveBeenNthCalledWith(1, {
        where: { id, ownerId },
        withDeleted: true,
      });
      expect(lists.restore).toHaveBeenCalledWith({ id, ownerId });
      expect(result.id).toBe(id);
    });

    it("re-syncs every live item's notification, mirroring what delete() cancelled", async () => {
      const item1 = {
        id: '61',
        listId: id,
        text: 'Buy socks',
        done: false,
        dueAt: new Date(Date.now() + 3600_000),
        notifyMinutesBefore: 10,
      } as unknown as ListItem;
      const item2 = { ...item1, id: '62', done: true } as unknown as ListItem;
      lists.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);
      items.find.mockResolvedValueOnce([item1, item2]);

      await service.restore(ownerId, id);

      expect(items.find).toHaveBeenCalledWith({ where: { listId: id } });
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'list_item', item1.id);
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'list_item', item2.id);
      expect(notifications.enqueue).toHaveBeenCalledTimes(1); // only item1: item2 is done, no re-enqueue
    });

    it('throws 404 when the list does not exist at all', async () => {
      lists.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(lists.restore).not.toHaveBeenCalled();
    });

    it('throws 404 when the list exists but is not soft-deleted', async () => {
      lists.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(lists.restore).not.toHaveBeenCalled();
    });

    it('404s instead of restoring another owner\'s list (owner mismatch not found by the query)', async () => {
      const otherOwnerId = '999';
      lists.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(otherOwnerId, id)).rejects.toThrow(ApiException);
      expect(lists.findOne).toHaveBeenCalledWith({
        where: { id, ownerId: otherOwnerId },
        withDeleted: true,
      });
      expect(lists.restore).not.toHaveBeenCalled();
    });
  });

  describe('restoreItem', () => {
    const itemId = '61';
    const deletedItem = {
      id: itemId,
      listId: '60',
      sectionId: null,
      text: 'Buy socks',
      done: false,
      dueAt: null,
      position: 0,
      notifyMinutesBefore: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as unknown as ListItem;
    const liveItem = { ...deletedItem, deletedAt: null } as unknown as ListItem;

    it('restores a soft-deleted list item, re-syncs its notification and returns the live DTO', async () => {
      const qb = makeQueryBuilder([deletedItem, liveItem]);
      items.createQueryBuilder.mockReturnValue(qb);

      const result = await service.restoreItem(ownerId, itemId);

      expect(qb.innerJoin).toHaveBeenCalledWith(
        TodoList,
        'l',
        'l.id = i.list_id AND l.owner_id = :ownerId',
        { ownerId },
      );
      expect(qb.withDeleted).toHaveBeenCalled();
      expect(items.restore).toHaveBeenCalledWith({ id: itemId });
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'list_item', itemId);
      expect(result.id).toBe(itemId);
    });

    it('throws 404 when the list item does not exist at all', async () => {
      const qb = makeQueryBuilder([null]);
      items.createQueryBuilder.mockReturnValue(qb);

      await expect(service.restoreItem(ownerId, itemId)).rejects.toThrow(ApiException);
      expect(items.restore).not.toHaveBeenCalled();
      expect(notifications.cancelForSource).not.toHaveBeenCalled();
    });

    it('throws 404 when the list item exists but is not soft-deleted', async () => {
      const qb = makeQueryBuilder([{ ...deletedItem, deletedAt: null }]);
      items.createQueryBuilder.mockReturnValue(qb);

      await expect(service.restoreItem(ownerId, itemId)).rejects.toThrow(ApiException);
      expect(items.restore).not.toHaveBeenCalled();
    });

    it('404s instead of restoring another owner\'s list item (owner join excludes it)', async () => {
      const otherOwnerId = '999';
      const qb = makeQueryBuilder([null]); // innerJoin owner filter would exclude a foreign row
      items.createQueryBuilder.mockReturnValue(qb);

      await expect(service.restoreItem(otherOwnerId, itemId)).rejects.toThrow(ApiException);
      expect(qb.innerJoin).toHaveBeenCalledWith(
        TodoList,
        'l',
        'l.id = i.list_id AND l.owner_id = :ownerId',
        { ownerId: otherOwnerId },
      );
      expect(items.restore).not.toHaveBeenCalled();
    });
  });
});
