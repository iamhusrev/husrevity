import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ParsedDraft, parseQuickAdd } from '@husrevity/parser';
import { Item } from './item.entity';
import { ItemOccurrence, ItemOccurrenceStatus } from './item-occurrence.entity';
import { ItemRecurrenceService } from './item-recurrence.service';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { formatLeadTimeBody, leadTimeFireAt } from '../notification/notification-scheduling';
import { ProjectAccessService } from '../project/project-access.service';
import { ProjectRole } from '../project/project-member.entity';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import {
  CompleteItemRequestDto,
  ItemListQueryDto,
  ItemRequestDto,
  ItemResponseDto,
} from './dto/item-dtos';

type OccurrenceOverride = { status: ItemOccurrenceStatus; completedAt: Date | null };

@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemOccurrence) private readonly occurrences: Repository<ItemOccurrence>,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationService,
    private readonly recurrence: ItemRecurrenceService,
    @Optional() private readonly googleCalendarService?: GoogleCalendarService,
  ) {}

  /**
   * Pure ownerId-filtered — does NOT also pull in items from projects the
   * caller merely collaborates on, matching Task's existing split (there is
   * no "every task across every project I'm a member of" endpoint either).
   * A recurring item (non-null `rrule`) is expanded into one virtual row
   * per occurrence date when `from`/`to` are both given; without a range,
   * recurring items are returned once as their own template row. A
   * `blockId`-linked item with no rrule of its own (e.g. a routine
   * activity) expands alongside its recurring parent's occurrence dates
   * instead of being listed as a flat row.
   */
  async list(ownerId: string, query: ItemListQueryDto): Promise<ItemResponseDto[]> {
    const qb = this.items.createQueryBuilder('i').where('i.owner_id = :ownerId', { ownerId });
    if (query.kind) qb.andWhere('i.kind = :kind', { kind: query.kind });
    if (query.context) qb.andWhere('i.context = :context', { context: query.context });
    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    const rows = await qb.orderBy('i.scheduled_at', 'ASC').addOrderBy('i.due_at', 'ASC').getMany();

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const recurringIds = new Set(rows.filter((i) => i.rrule).map((i) => i.id));

    const results: ItemResponseDto[] = [];
    for (const item of rows) {
      if (item.rrule) continue; // expanded below
      if (item.blockId && recurringIds.has(item.blockId)) continue; // expands with its recurring parent
      if (!this.matchesRange(item, from, to)) continue;
      results.push(ItemResponseDto.from(item));
    }

    if (from && to) {
      const overrides = await this.loadOccurrenceOverrides(ownerId, from, to);
      for (const parent of rows.filter((i) => i.rrule)) {
        const occurrences = this.recurrence.expand(parent, from, to);
        const children = rows.filter((r) => r.blockId === parent.id);
        for (const occ of occurrences) {
          results.push(
            ItemResponseDto.from(parent, {
              occursOn: occ.occursOn,
              override: overrides.get(`${parent.id}:${occ.occursOn}`),
            }),
          );
          for (const child of children) {
            results.push(
              ItemResponseDto.from(child, {
                occursOn: occ.occursOn,
                override: overrides.get(`${child.id}:${occ.occursOn}`),
              }),
            );
          }
        }
      }
    }

    return results;
  }

  async get(userId: string, id: string): Promise<ItemResponseDto> {
    const item = await this.requireItemAccess(userId, id, 'VIEWER');
    return ItemResponseDto.from(item);
  }

  /**
   * Preview-only: runs the shared @husrevity/parser rules and returns the
   * draft as-is, without writing anything. The client always shows this
   * to the user for confirmation/editing before a real create() call.
   */
  parseQuickAddText(text: string): Promise<ParsedDraft> {
    return parseQuickAdd(text);
  }

  async create(userId: string, req: ItemRequestDto): Promise<ItemResponseDto> {
    let ownerId = userId;
    let projectId: string | null = null;
    if (req.projectId) {
      const { project } = await this.access.requireAccess(userId, req.projectId, 'EDITOR');
      ownerId = project.ownerId;
      projectId = project.id;
    }
    const item = this.items.create({
      ownerId,
      projectId,
      kind: req.kind,
      title: req.title,
      notes: req.notes ?? null,
      context: req.context ?? null,
      blockId: req.blockId ?? null,
      scheduledAt: req.scheduledAt ? new Date(req.scheduledAt) : null,
      durationMin: req.durationMin ?? null,
      dueAt: req.dueAt ? new Date(req.dueAt) : null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      rrule: req.rrule ?? null,
      status: req.status ?? 'open',
      payload: req.payload ?? {},
      source: req.source ?? 'web',
    });
    const saved = await this.items.save(item);
    await this.syncNotification(saved);
    if (this.googleCalendarService) {
      await this.googleCalendarService.syncItemToGoogleCalendar(saved);
    }
    return ItemResponseDto.from(saved);
  }

  /**
   * `ifMatchMs` (from the `If-Match` header, parsed to epoch ms) is an
   * optimistic-concurrency check: if the item's actual `updatedAt` no
   * longer matches what the caller last fetched, the write is rejected
   * with a 409 instead of silently overwriting a change the caller never
   * saw. Omit it to update unconditionally (existing callers unaffected).
   */
  async update(
    userId: string,
    id: string,
    req: Partial<ItemRequestDto>,
    ifMatchMs?: number,
  ): Promise<ItemResponseDto> {
    const item = await this.requireItemAccess(userId, id, 'EDITOR');
    if (ifMatchMs !== undefined && item.updatedAt.getTime() !== ifMatchMs) {
      throw ApiException.conflict(
        `Item has been modified since you last fetched it (current updatedAt: ${item.updatedAt.toISOString()})`,
      );
    }
    if (req.kind !== undefined) item.kind = req.kind;
    if (req.title !== undefined) item.title = req.title;
    if (req.notes !== undefined) item.notes = req.notes ?? null;
    if (req.context !== undefined) item.context = req.context ?? null;
    if (req.blockId !== undefined) item.blockId = req.blockId ?? null;
    if (req.scheduledAt !== undefined) {
      item.scheduledAt = req.scheduledAt ? new Date(req.scheduledAt) : null;
    }
    if (req.durationMin !== undefined) item.durationMin = req.durationMin ?? null;
    if (req.dueAt !== undefined) item.dueAt = req.dueAt ? new Date(req.dueAt) : null;
    if (req.notifyMinutesBefore !== undefined) {
      item.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    }
    if (req.rrule !== undefined) item.rrule = req.rrule ?? null;
    if (req.status !== undefined) item.status = req.status;
    if (req.payload !== undefined) item.payload = req.payload;
    if (req.source !== undefined) item.source = req.source;

    if (req.projectId !== undefined && req.projectId !== item.projectId) {
      if (req.projectId) {
        const { project } = await this.access.requireAccess(userId, req.projectId, 'EDITOR');
        item.projectId = project.id;
        item.ownerId = project.ownerId;
      } else {
        item.projectId = null;
        // Moving to "no project" (personal item) — re-anchor ownership to the acting user.
        item.ownerId = userId;
      }
    }

    const saved = await this.items.save(item);
    await this.syncNotification(saved);
    if (this.googleCalendarService) {
      await this.googleCalendarService.syncItemToGoogleCalendar(saved);
    }
    return ItemResponseDto.from(saved);
  }

  async delete(userId: string, id: string): Promise<void> {
    const item = await this.requireItemAccess(userId, id, 'EDITOR');
    await this.notifications.cancelForSource(item.ownerId, 'item', item.id);
    await this.items.softRemove(item);
  }

  /**
   * A non-recurring item completes itself directly. A recurring item (has
   * an rrule) requires `occursOn` and upserts an `item_occurrences` row for
   * that date instead — the parent item's own `status` stays `'open'`
   * forever, since it's a template, not a single completable thing.
   */
  async complete(
    userId: string,
    id: string,
    req: CompleteItemRequestDto,
  ): Promise<ItemResponseDto> {
    const item = await this.requireItemAccess(userId, id, 'EDITOR');

    if (!item.rrule) {
      item.status = 'done';
      item.completedAt = new Date();
      const saved = await this.items.save(item);
      await this.notifications.cancelForSource(item.ownerId, 'item', item.id);
      return ItemResponseDto.from(saved);
    }

    if (!req.occursOn) {
      throw ApiException.badRequest('occursOn is required to complete a recurring item');
    }
    const now = new Date();
    const existing = await this.occurrences.findOne({
      where: { itemId: item.id, occursOn: req.occursOn },
    });
    if (existing) {
      existing.status = 'done';
      existing.completedAt = now;
      await this.occurrences.save(existing);
    } else {
      await this.occurrences.save(
        this.occurrences.create({
          itemId: item.id,
          ownerId: item.ownerId,
          occursOn: req.occursOn,
          status: 'done',
          completedAt: now,
        }),
      );
    }
    return ItemResponseDto.from(item, {
      occursOn: req.occursOn,
      override: { status: 'done', completedAt: now },
    });
  }

  private matchesRange(
    item: Pick<Item, 'scheduledAt' | 'dueAt'>,
    from: Date | null,
    to: Date | null,
  ): boolean {
    if (!from && !to) return true;
    const candidates = [item.scheduledAt, item.dueAt].filter((d): d is Date => !!d);
    return candidates.some((d) => (!from || d >= from) && (!to || d <= to));
  }

  private async loadOccurrenceOverrides(
    ownerId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, OccurrenceOverride>> {
    const rows = await this.occurrences.find({
      where: {
        ownerId,
        occursOn: Between(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)),
      },
    });
    const map = new Map<string, OccurrenceOverride>();
    for (const r of rows) {
      map.set(`${r.itemId}:${r.occursOn}`, { status: r.status, completedAt: r.completedAt });
    }
    return map;
  }

  /**
   * Reminders anchor on dueAt when set (task-like), else scheduledAt
   * (event-like) — mirrors how Task/Reminder use dueAt and
   * CalendarEvent/TimeBlock use their start instant. Only for non-recurring
   * items: per-occurrence reminders for recurring items need a rolling
   * scheduler (pg-boss, Faz 3) and are deliberately not built here.
   */
  private async syncNotification(item: Item): Promise<void> {
    await this.notifications.cancelForSource(item.ownerId, 'item', item.id);
    if (item.rrule || item.status !== 'open') return;
    const anchor = item.dueAt ?? item.scheduledAt;
    const fireAt = leadTimeFireAt(anchor, item.notifyMinutesBefore);
    if (!fireAt || !anchor) return;
    await this.notifications.enqueue({
      ownerId: item.ownerId,
      kind: 'item',
      sourceId: item.id,
      scheduledAt: fireAt,
      title: item.title,
      body: formatLeadTimeBody(anchor, item.notifyMinutesBefore ?? 0, item.notes),
      deepLink: item.projectId ? `/projects/${item.projectId}` : null,
    });
  }

  /**
   * Item-level access gate, mirroring TaskService.requireTaskAccess exactly:
   * an item with projectId === null is personal and stays strictly
   * owner-scoped (404, never 403, to avoid leaking existence); a
   * project-attached item defers to project membership.
   */
  private async requireItemAccess(
    userId: string,
    id: string,
    minRole: ProjectRole,
  ): Promise<Item> {
    const item = await this.items.findOne({ where: { id } });
    if (!item) throw ApiException.notFound('Item not found');
    if (!item.projectId) {
      if (item.ownerId !== userId) throw ApiException.notFound('Item not found');
      return item;
    }
    await this.access.requireAccess(userId, item.projectId, minRole);
    return item;
  }
}
