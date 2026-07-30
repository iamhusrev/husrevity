import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TodoList } from './todo-list.entity';
import { ListItem } from './list-item.entity';
import { ListSection } from './list-section.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import {
  formatLeadTimeBody,
  leadTimeFireAt,
} from '../notification/notification-scheduling';
import {
  ItemRequestDto,
  ItemResponseDto,
  ListRequestDto,
  ListResponseDto,
  ReorderItemDto,
  SectionRequestDto,
  SectionResponseDto,
} from './dto/list-dtos';

@Injectable()
export class ListService {
  constructor(
    @InjectRepository(TodoList) private readonly lists: Repository<TodoList>,
    @InjectRepository(ListItem) private readonly items: Repository<ListItem>,
    @InjectRepository(ListSection) private readonly sections: Repository<ListSection>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async list(ownerId: string): Promise<ListResponseDto[]> {
    const rows = await this.lists.find({
      where: { ownerId },
      order: { position: 'ASC', updatedAt: 'DESC' },
    });
    return rows.map(ListResponseDto.from);
  }

  async get(ownerId: string, id: string): Promise<ListResponseDto> {
    return ListResponseDto.from(await this.requireList(ownerId, id));
  }

  async create(ownerId: string, req: ListRequestDto): Promise<ListResponseDto> {
    const l = this.lists.create({
      ownerId,
      name: req.name,
      color: req.color ?? null,
      icon: req.icon ?? null,
      archived: req.archived ?? false,
      position: 0,
    });
    return ListResponseDto.from(await this.lists.save(l));
  }

  async update(ownerId: string, id: string, req: ListRequestDto): Promise<ListResponseDto> {
    const l = await this.requireList(ownerId, id);
    l.name = req.name;
    if (req.color !== undefined) l.color = req.color ?? null;
    if (req.icon !== undefined) l.icon = req.icon ?? null;
    if (req.archived !== undefined) l.archived = req.archived;
    return ListResponseDto.from(await this.lists.save(l));
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const l = await this.requireList(ownerId, id);
    // Cancel any pending notifications for items in this list before nuking it.
    const items = await this.items.find({ where: { listId: l.id } });
    for (const i of items) {
      await this.notifications.cancelForSource(ownerId, 'list_item', i.id);
    }
    await this.lists.softRemove(l);
  }

  async restore(ownerId: string, id: string): Promise<ListResponseDto> {
    const l = await this.lists.findOne({ where: { id, ownerId }, withDeleted: true });
    if (!l || !l.deletedAt) throw ApiException.notFound('List not found');
    await this.lists.restore({ id, ownerId });
    const restored = await this.requireList(ownerId, id);
    // Mirror delete()'s cancellation: re-sync every (still-live) item's notification.
    const items = await this.items.find({ where: { listId: restored.id } });
    for (const i of items) {
      await this.syncNotification(ownerId, i);
    }
    return ListResponseDto.from(restored);
  }

  async reorderLists(ownerId: string, items: ReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(TodoList)
          .set({ position: it.position })
          .where('id = :id AND owner_id = :ownerId', { id: it.id, ownerId })
          .execute();
      }
    });
  }

  async listItems(ownerId: string, listId: string): Promise<ItemResponseDto[]> {
    await this.requireList(ownerId, listId);
    const rows = await this.items.find({
      where: { listId },
      order: { position: 'ASC', id: 'ASC' },
    });
    return rows.map(ItemResponseDto.from);
  }

  async createItem(ownerId: string, listId: string, req: ItemRequestDto): Promise<ItemResponseDto> {
    await this.requireList(ownerId, listId);
    if (req.sectionId != null) await this.requireSection(ownerId, req.sectionId, listId);
    const i = this.items.create({
      listId,
      sectionId: req.sectionId ?? null,
      text: req.text,
      done: req.done ?? false,
      dueAt: req.dueAt ? new Date(req.dueAt) : null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      position: req.position ?? 0,
    });
    const saved = await this.items.save(i);
    await this.syncNotification(ownerId, saved);
    return ItemResponseDto.from(saved);
  }

  async updateItem(ownerId: string, itemId: string, req: ItemRequestDto): Promise<ItemResponseDto> {
    const item = await this.requireItem(ownerId, itemId);
    item.text = req.text;
    if (req.sectionId !== undefined) {
      if (req.sectionId != null) await this.requireSection(ownerId, req.sectionId, item.listId);
      item.sectionId = req.sectionId ?? null;
    }
    if (req.done !== undefined) item.done = req.done;
    if (req.dueAt !== undefined) item.dueAt = req.dueAt ? new Date(req.dueAt) : null;
    if (req.position !== undefined) item.position = req.position;
    if (req.notifyMinutesBefore !== undefined) {
      item.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    }
    const saved = await this.items.save(item);
    await this.syncNotification(ownerId, saved);
    return ItemResponseDto.from(saved);
  }

  async toggleItem(ownerId: string, itemId: string): Promise<ItemResponseDto> {
    const item = await this.requireItem(ownerId, itemId);
    item.done = !item.done;
    const saved = await this.items.save(item);
    await this.syncNotification(ownerId, saved);
    return ItemResponseDto.from(saved);
  }

  async deleteItem(ownerId: string, itemId: string): Promise<void> {
    const item = await this.requireItem(ownerId, itemId);
    await this.notifications.cancelForSource(ownerId, 'list_item', item.id);
    await this.items.softRemove(item);
  }

  async restoreItem(ownerId: string, itemId: string): Promise<ItemResponseDto> {
    await this.requireDeletedItem(ownerId, itemId);
    await this.items.restore({ id: itemId });
    const restored = await this.requireItem(ownerId, itemId);
    await this.syncNotification(ownerId, restored);
    return ItemResponseDto.from(restored);
  }

  async reorderItems(ownerId: string, listId: string, items: ReorderItemDto[]): Promise<void> {
    await this.requireList(ownerId, listId);
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(ListItem)
          .set({ position: it.position })
          .where('id = :id AND list_id = :listId', { id: it.id, listId })
          .execute();
      }
    });
  }

  // ─── Sections ─────────────────────────────────────────────────────────────

  async listSections(ownerId: string, listId: string): Promise<SectionResponseDto[]> {
    await this.requireList(ownerId, listId);
    const rows = await this.sections.find({
      where: { listId },
      order: { position: 'ASC', id: 'ASC' },
    });
    return rows.map(SectionResponseDto.from);
  }

  async createSection(
    ownerId: string,
    listId: string,
    req: SectionRequestDto,
  ): Promise<SectionResponseDto> {
    await this.requireList(ownerId, listId);
    const max = await this.sections
      .createQueryBuilder('s')
      .select('COALESCE(MAX(s.position), -1)', 'max')
      .where('s.list_id = :listId', { listId })
      .getRawOne<{ max: number }>();
    const s = this.sections.create({
      listId,
      name: req.name,
      position: (max?.max ?? -1) + 1,
    });
    return SectionResponseDto.from(await this.sections.save(s));
  }

  async updateSection(
    ownerId: string,
    sectionId: string,
    req: SectionRequestDto,
  ): Promise<SectionResponseDto> {
    const s = await this.requireSection(ownerId, sectionId);
    s.name = req.name;
    return SectionResponseDto.from(await this.sections.save(s));
  }

  async deleteSection(ownerId: string, sectionId: string): Promise<void> {
    const s = await this.requireSection(ownerId, sectionId);
    // Ungroup the section's items rather than deleting them.
    await this.items
      .createQueryBuilder()
      .update(ListItem)
      .set({ sectionId: null })
      .where('section_id = :sectionId', { sectionId: s.id })
      .execute();
    await this.sections.softRemove(s);
  }

  async reorderSections(ownerId: string, listId: string, items: ReorderItemDto[]): Promise<void> {
    await this.requireList(ownerId, listId);
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(ListSection)
          .set({ position: it.position })
          .where('id = :id AND list_id = :listId', { id: it.id, listId })
          .execute();
      }
    });
  }

  private async requireSection(
    ownerId: string,
    sectionId: string,
    listId?: string,
  ): Promise<ListSection> {
    const qb = this.sections
      .createQueryBuilder('s')
      .innerJoin(TodoList, 'l', 'l.id = s.list_id AND l.owner_id = :ownerId', { ownerId })
      .where('s.id = :sectionId', { sectionId });
    if (listId) qb.andWhere('s.list_id = :listId', { listId });
    const s = await qb.getOne();
    if (!s) throw ApiException.notFound('List section not found');
    return s;
  }

  private async syncNotification(ownerId: string, item: ListItem): Promise<void> {
    await this.notifications.cancelForSource(ownerId, 'list_item', item.id);
    if (item.done) return;
    const fireAt = leadTimeFireAt(item.dueAt, item.notifyMinutesBefore);
    if (!fireAt || !item.dueAt) return;
    await this.notifications.enqueue({
      ownerId,
      kind: 'list_item',
      sourceId: item.id,
      scheduledAt: fireAt,
      title: item.text,
      body: formatLeadTimeBody(item.dueAt, item.notifyMinutesBefore ?? 0),
      deepLink: '/lists',
    });
  }

  private async requireList(ownerId: string, id: string): Promise<TodoList> {
    const l = await this.lists.findOne({ where: { id, ownerId } });
    if (!l) throw ApiException.notFound('List not found');
    return l;
  }

  private async requireItem(ownerId: string, itemId: string): Promise<ListItem> {
    const item = await this.items
      .createQueryBuilder('i')
      .innerJoin(TodoList, 'l', 'l.id = i.list_id AND l.owner_id = :ownerId', { ownerId })
      .where('i.id = :itemId', { itemId })
      .getOne();
    if (!item) throw ApiException.notFound('List item not found');
    return item;
  }

  private async requireDeletedItem(ownerId: string, itemId: string): Promise<ListItem> {
    const item = await this.items
      .createQueryBuilder('i')
      .innerJoin(TodoList, 'l', 'l.id = i.list_id AND l.owner_id = :ownerId', { ownerId })
      .where('i.id = :itemId', { itemId })
      .withDeleted()
      .getOne();
    if (!item || !item.deletedAt) throw ApiException.notFound('List item not found');
    return item;
  }
}
