import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ReminderList } from './reminder-list.entity';
import { Reminder } from './reminder.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import {
  formatLeadTimeBody,
  leadTimeFireAt,
} from '../notification/notification-scheduling';
import {
  ReminderListRequestDto,
  ReminderListResponseDto,
  ReminderRequestDto,
  ReminderResponseDto,
  ReorderItemDto,
} from './dto/reminder-dtos';

@Injectable()
export class ReminderService {
  constructor(
    @InjectRepository(ReminderList) private readonly lists: Repository<ReminderList>,
    @InjectRepository(Reminder) private readonly reminders: Repository<Reminder>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  // ─── Lists ──────────────────────────────────────────────────────────────────

  async listReminderLists(ownerId: string): Promise<ReminderListResponseDto[]> {
    const rows = await this.lists.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    const out: ReminderListResponseDto[] = [];
    for (const l of rows) {
      const count = await this.reminders.count({
        where: { listId: l.id, completedAt: IsNull() },
      });
      out.push(ReminderListResponseDto.from(l, count));
    }
    return out;
  }

  async createList(ownerId: string, req: ReminderListRequestDto): Promise<ReminderListResponseDto> {
    const l = this.lists.create({
      ownerId,
      name: req.name,
      color: req.color ?? '#007AFF',
      icon: req.icon ?? null,
      position: 0,
    });
    return ReminderListResponseDto.from(await this.lists.save(l), 0);
  }

  async updateList(
    ownerId: string,
    id: string,
    req: ReminderListRequestDto,
  ): Promise<ReminderListResponseDto> {
    const l = await this.requireList(ownerId, id);
    l.name = req.name;
    if (req.color !== undefined) l.color = req.color ?? '#007AFF';
    if (req.icon !== undefined) l.icon = req.icon ?? null;
    const saved = await this.lists.save(l);
    const count = await this.reminders.count({
      where: { listId: saved.id, completedAt: IsNull() },
    });
    return ReminderListResponseDto.from(saved, count);
  }

  async deleteList(ownerId: string, id: string): Promise<void> {
    const l = await this.requireList(ownerId, id);
    await this.lists.softRemove(l);
  }

  async restoreList(ownerId: string, id: string): Promise<ReminderListResponseDto> {
    const l = await this.lists.findOne({ where: { id, ownerId }, withDeleted: true });
    if (!l || !l.deletedAt) throw ApiException.notFound('Reminder list not found');
    await this.lists.restore({ id, ownerId });
    const restored = await this.requireList(ownerId, id);
    const count = await this.reminders.count({
      where: { listId: restored.id, completedAt: IsNull() },
    });
    return ReminderListResponseDto.from(restored, count);
  }

  async reorderLists(ownerId: string, items: ReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(ReminderList)
          .set({ position: it.position })
          .where('id = :id AND owner_id = :ownerId', { id: it.id, ownerId })
          .execute();
      }
    });
  }

  async listByList(ownerId: string, listId: string): Promise<ReminderResponseDto[]> {
    await this.requireList(ownerId, listId);
    const rows = await this.reminders.find({
      where: { listId },
      order: { position: 'ASC', id: 'ASC' },
    });
    return rows.map(ReminderResponseDto.from);
  }

  // ─── Reminders ──────────────────────────────────────────────────────────────

  async listReminders(
    ownerId: string,
    listId: string | undefined,
    completed: boolean | undefined,
  ): Promise<ReminderResponseDto[]> {
    const qb = this.reminders.createQueryBuilder('r').where('r.owner_id = :ownerId', { ownerId });
    if (listId) qb.andWhere('r.list_id = :listId', { listId });
    if (completed === true) qb.andWhere('r.completed_at IS NOT NULL');
    if (completed === false) qb.andWhere('r.completed_at IS NULL');
    qb.orderBy('r.position', 'ASC').addOrderBy('r.id', 'ASC');
    const rows = await qb.getMany();
    return rows.map(ReminderResponseDto.from);
  }

  async createReminder(ownerId: string, req: ReminderRequestDto): Promise<ReminderResponseDto> {
    if (req.listId) await this.requireList(ownerId, req.listId);
    const r = this.reminders.create({
      ownerId,
      listId: req.listId ?? null,
      title: req.title,
      notes: req.notes ?? null,
      dueAt: req.dueAt ? new Date(req.dueAt) : null,
      completedAt: null,
      priority: req.priority ?? 'NONE',
      flag: req.flag ?? false,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      position: 0,
    });
    const saved = await this.reminders.save(r);
    await this.syncNotification(saved);
    return ReminderResponseDto.from(saved);
  }

  async updateReminder(
    ownerId: string,
    id: string,
    req: ReminderRequestDto,
  ): Promise<ReminderResponseDto> {
    const r = await this.requireReminder(ownerId, id);
    if (req.listId !== undefined) {
      if (req.listId) await this.requireList(ownerId, req.listId);
      r.listId = req.listId || null;
    }
    r.title = req.title;
    if (req.notes !== undefined) r.notes = req.notes ?? null;
    if (req.dueAt !== undefined) r.dueAt = req.dueAt ? new Date(req.dueAt) : null;
    if (req.priority !== undefined) r.priority = req.priority;
    if (req.flag !== undefined) r.flag = req.flag;
    if (req.notifyMinutesBefore !== undefined) {
      r.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    }
    const saved = await this.reminders.save(r);
    await this.syncNotification(saved);
    return ReminderResponseDto.from(saved);
  }

  async toggleReminder(ownerId: string, id: string): Promise<ReminderResponseDto> {
    const r = await this.requireReminder(ownerId, id);
    r.completedAt = r.completedAt ? null : new Date();
    const saved = await this.reminders.save(r);
    await this.syncNotification(saved);
    return ReminderResponseDto.from(saved);
  }

  async deleteReminder(ownerId: string, id: string): Promise<void> {
    const r = await this.requireReminder(ownerId, id);
    await this.notifications.cancelForSource(ownerId, 'reminder', r.id);
    await this.reminders.softRemove(r);
  }

  async restoreReminder(ownerId: string, id: string): Promise<ReminderResponseDto> {
    const r = await this.reminders.findOne({ where: { id, ownerId }, withDeleted: true });
    if (!r || !r.deletedAt) throw ApiException.notFound('Reminder not found');
    await this.reminders.restore({ id, ownerId });
    const restored = await this.requireReminder(ownerId, id);
    await this.syncNotification(restored);
    return ReminderResponseDto.from(restored);
  }

  async reorderReminders(ownerId: string, items: ReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(Reminder)
          .set({ position: it.position })
          .where('id = :id AND owner_id = :ownerId', { id: it.id, ownerId })
          .execute();
      }
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Reconcile the reminder's row in the central notification queue with its
   * current state: completed or missing-dueAt or missing-lead-time = cancel;
   * otherwise enqueue at `dueAt - notifyMinutesBefore`. Called after every
   * create/update/toggle so the queue never drifts from the source of truth.
   */
  private async syncNotification(r: Reminder): Promise<void> {
    await this.notifications.cancelForSource(r.ownerId, 'reminder', r.id);
    if (r.completedAt) return;
    const fireAt = leadTimeFireAt(r.dueAt, r.notifyMinutesBefore);
    if (!fireAt || !r.dueAt) return;
    await this.notifications.enqueue({
      ownerId: r.ownerId,
      kind: 'reminder',
      sourceId: r.id,
      scheduledAt: fireAt,
      title: r.title,
      body: formatLeadTimeBody(r.dueAt, r.notifyMinutesBefore ?? 0, r.notes),
      deepLink: '/reminders',
    });
  }

  private async requireList(ownerId: string, id: string): Promise<ReminderList> {
    const l = await this.lists.findOne({ where: { id, ownerId } });
    if (!l) throw ApiException.notFound('Reminder list not found');
    return l;
  }

  private async requireReminder(ownerId: string, id: string): Promise<Reminder> {
    const r = await this.reminders.findOne({ where: { id, ownerId } });
    if (!r) throw ApiException.notFound('Reminder not found');
    return r;
  }
}
