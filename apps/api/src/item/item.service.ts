import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, Repository } from 'typeorm';
import { ParsedDraft, parseQuickAdd } from '@husrevity/parser';
import { Item, ItemStatus } from './item.entity';
import { ItemOccurrence, ItemOccurrenceStatus } from './item-occurrence.entity';
import { ItemRecurrenceService } from './item-recurrence.service';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { formatLeadTimeBody, leadTimeFireAt } from '../notification/notification-scheduling';
import { ProjectAccessService } from '../project/project-access.service';
import { ProjectRole } from '../project/project-member.entity';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { Goal } from '../goal/goal.entity';
import { GoalService } from '../goal/goal.service';
import { isValidNumericId } from '../common/numeric-id.pipe';
import { buildIcs, normalizeRruleForExport } from './ics-export';
import { findRruleProblem } from './rrule-validation';
import { isRealIsoDate } from '../goal/dto/goal-dtos';
import {
  CompleteItemRequestDto,
  ItemExportQueryDto,
  ItemListQueryDto,
  ItemRequestDto,
  ItemResponseDto,
} from './dto/item-dtos';

/**
 * Maps '' / whitespace-only / null / undefined to null so "no rule" has one
 * stored form. A non-empty rule must parse and use FREQ HOURLY or coarser
 * (SECONDLY/MINUTELY would explode into millions of occurrences); otherwise 400.
 */
function normalizeRrule(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const problem = findRruleProblem(value);
  if (problem) throw ApiException.badRequest(`Invalid rrule: ${problem}`);
  return value;
}

/** Hard cap on rows returned by GET /items?inbox=true. */
const INBOX_LIMIT = 200;

/** Hard cap on rows returned by GET /items?goalId=. */
const GOAL_LIST_LIMIT = 200;

/** Max components in one ICS export, and max days in its range. */
const ICS_MAX_COMPONENTS = 5000;
const ICS_MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Product timezone is fixed at UTC+03:00 (no DST). Assumption D-8: day edges
 * for dates before 2016 may differ from the real EET/EEST wall clock.
 */
const ISTANBUL_OFFSET = '+03:00';

/**
 * Visibility predicate shared by the goal-filtered list and the ICS export:
 * personal rows are owner-only; project rows need a LIVE project and a live
 * membership row of the caller. Requires the `:userId` parameter.
 */
const VISIBLE_ITEM_SQL =
  '((i.project_id IS NULL AND i.owner_id = :userId) OR i.project_id IN ' +
  '(SELECT p.id FROM project p JOIN project_member pm ON pm.project_id = p.id ' +
  'WHERE p.deleted_at IS NULL AND pm.deleted_at IS NULL AND pm.user_id = :userId))';

/** Columns the ICS serializer reads (see IcsItem); nothing else is hydrated. */
const ICS_SELECT_COLUMNS = [
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
];

type OccurrenceOverride = { status: ItemOccurrenceStatus; completedAt: Date | null };

const LEGACY_TABLE_NOTIFICATION_KINDS: Record<string, string> = {
  task: 'task',
  reminder: 'reminder',
  calendar_event: 'calendar_event',
  time_block: 'time_block',
  // No runtime mirror exists for learning items yet; this entry only matters
  // for rows created by the backfill/reconcile migrations. Do not remove it.
  learning_item: 'learning',
};

@Injectable()
export class ItemService {
  private readonly logger = new Logger(ItemService.name);

  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemOccurrence) private readonly occurrences: Repository<ItemOccurrence>,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationService,
    private readonly recurrence: ItemRecurrenceService,
    @Optional() private readonly googleCalendarService?: GoogleCalendarService,
    @Optional() private readonly goalService?: GoalService,
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
    if (query.goalId !== undefined) return this.listByGoal(ownerId, query);
    if (query.inbox) return this.listInbox(ownerId);
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

  /**
   * ICS (RFC 5545) export of the caller's own schedule for [from, to]
   * (Istanbul days). Non-recurring items must fall inside the range; a
   * recurring series is exported once with its RRULE when it can overlap the
   * range (kept when that cannot be decided). Cancelled and soft-deleted rows
   * are never exported. Only items the caller can still see are exported
   * (personal rows, or rows of live projects the caller is a live member of).
   * Skipped occurrences of a series are emitted as EXDATE; completed
   * occurrences are not exported. A series whose rule does not parse is dropped.
   */
  async exportIcs(userId: string, query: ItemExportQueryDto): Promise<string> {
    const { from, to } = query;
    if (!isRealIsoDate(from) || !isRealIsoDate(to)) {
      throw ApiException.badRequest('from and to must be real calendar dates (YYYY-MM-DD)');
    }
    const startUtc = new Date(`${from}T00:00:00${ISTANBUL_OFFSET}`);
    const endUtc = new Date(new Date(`${to}T00:00:00${ISTANBUL_OFFSET}`).getTime() + DAY_MS);
    const days = Math.round((endUtc.getTime() - startUtc.getTime()) / DAY_MS);
    if (days < 1) {
      throw ApiException.badRequest('to must be greater than or equal to from');
    }
    if (days > ICS_MAX_DAYS) {
      throw ApiException.badRequest(`The export range can span at most ${ICS_MAX_DAYS} days`);
    }
    const includeTasks = query.includeTasks !== false;

    const branches = [
      "(i.rrule IS NOT NULL AND i.rrule != '' AND i.scheduled_at IS NOT NULL AND i.scheduled_at < :endUtc)",
      '(i.scheduled_at >= :startUtc AND i.scheduled_at < :endUtc)',
    ];
    if (includeTasks) {
      branches.push(
        "(i.kind = 'task' AND i.scheduled_at IS NULL AND i.due_at >= :startUtc AND i.due_at < :endUtc)",
      );
    }
    const rows = await this.items
      .createQueryBuilder('i')
      .select(ICS_SELECT_COLUMNS)
      // Same visibility rule as the goal list and progress: personal items are
      // owner-only, project items need a live project and a live membership.
      // Items of a shared project carry the PROJECT OWNER as owner_id, so an
      // extra owner_id = :userId here would hide them from every other member.
      .where('i.deleted_at IS NULL')
      .andWhere(VISIBLE_ITEM_SQL, { userId })
      .andWhere("i.status != 'cancelled'")
      .andWhere(`(${branches.join(' OR ')})`, { startUtc, endUtc })
      .orderBy('i.scheduled_at', 'ASC', 'NULLS LAST')
      .addOrderBy('i.due_at', 'ASC', 'NULLS LAST')
      .addOrderBy('i.id', 'ASC')
      .limit(ICS_MAX_COMPONENTS + 1)
      .getMany();
    if (rows.length > ICS_MAX_COMPONENTS) {
      throw ApiException.badRequest(
        `The export would contain more than ${ICS_MAX_COMPONENTS} entries; narrow the date range`,
      );
    }

    const lastInstant = new Date(endUtc.getTime() - 1);
    const included = rows.filter((row) => {
      if (!row.rrule || row.rrule.trim() === '' || !row.scheduledAt) return true;
      try {
        return this.recurrence.expand(row, startUtc, lastInstant).length > 0;
      } catch {
        return true; // cannot be decided cheaply: export it
      }
    });

    const series = included.filter(
      (row) => row.rrule && row.rrule.trim() !== '' && row.scheduledAt,
    );
    const dropped = series.filter((row) => normalizeRruleForExport(row.rrule as string) === null);
    if (dropped.length > 0) {
      this.logger.warn(
        `ICS export dropped ${dropped.length} series with an invalid rrule (items ${dropped
          .map((row) => row.id)
          .join(', ')})`,
      );
    }
    const excludedDates = new Map<string, string[]>();
    if (series.length > dropped.length) {
      const overrides = await this.loadOccurrenceOverrides(userId, startUtc, lastInstant);
      for (const [key, override] of overrides) {
        if (override.status !== 'skipped') continue;
        const sep = key.indexOf(':');
        const itemId = key.slice(0, sep);
        if (!series.some((row) => row.id === itemId)) continue;
        const dates = excludedDates.get(itemId) ?? [];
        dates.push(key.slice(sep + 1));
        excludedDates.set(itemId, dates);
      }
    }
    return buildIcs(included, new Date(), { excludedDates });
  }

  /**
   * Items that count toward a goal's progress: items linked to the goal or a
   * live descendant goal, plus items of projects linked to those goals. The
   * goal must be the caller's (404 otherwise). Visibility mirrors item access
   * and applies to BOTH link kinds: personal rows only when owned by the
   * caller, project rows only when the project is live and the caller is a
   * live member of it. Template rows are returned, never
   * expanded.
   */
  private async listByGoal(userId: string, query: ItemListQueryDto): Promise<ItemResponseDto[]> {
    const goalId = query.goalId;
    if (!isValidNumericId(goalId)) {
      throw ApiException.badRequest('Invalid goalId: must be numeric');
    }
    await this.validateGoal(userId, goalId);
    const goalIds = this.goalService
      ? await this.goalService.liveSubtreeIds(userId, goalId)
      : [goalId];

    const qb = this.items
      .createQueryBuilder('i')
      .where(
        '(i.goal_id = ANY(:goalIds::bigint[]) OR i.project_id IN ' +
          '(SELECT p.id FROM project p WHERE p.goal_id = ANY(:goalIds::bigint[]) AND p.deleted_at IS NULL))',
        { goalIds },
      )
      .andWhere(VISIBLE_ITEM_SQL, { userId });
    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    else qb.andWhere("i.status != 'cancelled'");
    if (query.kind) qb.andWhere('i.kind = :kind', { kind: query.kind });
    if (query.context) qb.andWhere('i.context = :context', { context: query.context });
    const rows = await qb
      .orderBy('i.scheduled_at', 'ASC', 'NULLS LAST')
      .addOrderBy('i.due_at', 'ASC', 'NULLS LAST')
      .addOrderBy('i.id', 'DESC')
      .limit(GOAL_LIST_LIMIT)
      .getMany();
    return rows.map((row) => ItemResponseDto.from(row));
  }

  /**
   * Inbox: open tasks the user has captured but not yet triaged. Owner-scoped
   * like list(); soft-deleted rows are excluded by the query builder. No
   * recurrence expansion: rrule rows are excluded outright.
   */
  private async listInbox(ownerId: string): Promise<ItemResponseDto[]> {
    const rows = await this.items
      .createQueryBuilder('i')
      .where('i.owner_id = :ownerId', { ownerId })
      .andWhere("i.status = 'open'")
      .andWhere("i.kind = 'task'")
      .andWhere('i.scheduled_at IS NULL')
      .andWhere('i.due_at IS NULL')
      .andWhere('i.goal_id IS NULL')
      .andWhere('i.project_id IS NULL')
      .andWhere('i.block_id IS NULL')
      // Tolerate legacy rows that stored '' instead of NULL.
      .andWhere("(i.rrule IS NULL OR i.rrule = '')")
      .orderBy('i.created_at', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .limit(INBOX_LIMIT)
      .getMany();
    return rows.map((row) => ItemResponseDto.from(row));
  }

  async get(userId: string, id: string, manager?: EntityManager): Promise<ItemResponseDto> {
    const item = await this.requireItemAccess(userId, id, 'VIEWER', manager);
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

  private getItemRepo(manager?: EntityManager): Repository<Item> {
    return manager ? manager.getRepository(Item) : this.items;
  }

  private getOccurrenceRepo(manager?: EntityManager): Repository<ItemOccurrence> {
    return manager ? manager.getRepository(ItemOccurrence) : this.occurrences;
  }

  private async triggerOrDeferSideEffects(
    manager: EntityManager | undefined,
    action: () => Promise<void>,
  ): Promise<void> {
    if (manager && Array.isArray((manager as any).__postCommit)) {
      (manager as any).__postCommit.push(action);
    } else {
      await action();
    }
  }

  async create(
    userId: string,
    req: ItemRequestDto,
    manager?: EntityManager,
  ): Promise<ItemResponseDto> {
    let ownerId = userId;
    let projectId: string | null = null;
    if (req.projectId) {
      const { project } = await this.access.requireAccess(userId, req.projectId, 'EDITOR');
      ownerId = project.ownerId;
      projectId = project.id;
    }
    if (req.goalId) {
      await this.validateGoal(userId, req.goalId, manager);
    }
    const itemRepo = this.getItemRepo(manager);
    const item = itemRepo.create({
      ownerId,
      projectId,
      goalId: req.goalId ?? null,
      kind: req.kind,
      title: req.title,
      notes: req.notes ?? null,
      context: req.context ?? null,
      blockId: req.blockId ?? null,
      scheduledAt: req.scheduledAt ? new Date(req.scheduledAt) : null,
      durationMin: req.durationMin ?? null,
      dueAt: req.dueAt ? new Date(req.dueAt) : null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      rrule: normalizeRrule(req.rrule),
      status: req.status ?? 'open',
      payload: req.payload ?? {},
      source: req.source ?? 'web',
    });
    const saved = await itemRepo.save(item);
    await this.triggerOrDeferSideEffects(manager, async () => {
      await this.syncNotification(saved);
      if (this.googleCalendarService) {
        await this.googleCalendarService.syncItemToGoogleCalendar(saved);
      }
    });
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
    manager?: EntityManager,
  ): Promise<ItemResponseDto> {
    const item = await this.requireItemAccess(userId, id, 'EDITOR', manager);
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
    if (req.rrule !== undefined) {
      // An UNCHANGED rule is never re-validated: an undo replaying a snapshot or
      // a client echoing the whole object would otherwise make every update of an
      // item fail when its stored rule predates write validation (mirrored
      // calendar rules, rules stored as SECONDLY). Only a CHANGED rule must parse.
      const incoming = typeof req.rrule === 'string' ? req.rrule.trim() : req.rrule;
      const stored = item.rrule == null || item.rrule.trim() === '' ? null : item.rrule.trim();
      const unchanged = incoming == null || incoming === '' ? stored === null : incoming === stored;
      if (!unchanged) item.rrule = normalizeRrule(req.rrule);
    }
    if (req.status !== undefined) item.status = req.status;
    if (req.payload !== undefined) item.payload = req.payload;
    if (req.source !== undefined) item.source = req.source;

    if (req.goalId !== undefined && req.goalId !== item.goalId) {
      if (req.goalId) {
        await this.validateGoal(userId, req.goalId, manager);
        item.goalId = req.goalId;
      } else {
        item.goalId = null;
      }
    }

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

    const itemRepo = this.getItemRepo(manager);
    const saved = await itemRepo.save(item);
    await this.triggerOrDeferSideEffects(manager, async () => {
      await this.syncNotification(saved);
      if (this.googleCalendarService) {
        await this.googleCalendarService.syncItemToGoogleCalendar(saved);
      }
    });
    return ItemResponseDto.from(saved);
  }

  async delete(userId: string, id: string, manager?: EntityManager): Promise<void> {
    const item = await this.requireItemAccess(userId, id, 'EDITOR', manager);
    const itemRepo = this.getItemRepo(manager);
    await itemRepo.softRemove(item);
    await this.triggerOrDeferSideEffects(manager, async () => {
      await this.notifications.cancelForSource(item.ownerId, 'item', item.id);
    });
  }

  /**
   * Internal details version returning occurrenceId without leaking it to public endpoint DTO.
   */
  async completeWithDetails(
    userId: string,
    id: string,
    req: CompleteItemRequestDto,
    manager?: EntityManager,
  ): Promise<{ item: ItemResponseDto; occurrenceId?: string }> {
    const item = await this.requireItemAccess(userId, id, 'EDITOR', manager);
    const itemRepo = this.getItemRepo(manager);
    const occRepo = this.getOccurrenceRepo(manager);

    if (!item.rrule) {
      item.status = 'done';
      item.completedAt = new Date();
      const saved = await itemRepo.save(item);
      await this.triggerOrDeferSideEffects(manager, async () => {
        await this.notifications.cancelForSource(item.ownerId, 'item', item.id);
      });
      return { item: ItemResponseDto.from(saved) };
    }

    if (!req.occursOn) {
      throw ApiException.badRequest('occursOn is required to complete a recurring item');
    }
    const now = new Date();
    const existing = await occRepo.findOne({
      where: { itemId: item.id, occursOn: req.occursOn },
    });
    let occurrenceId: string | undefined;
    if (existing) {
      existing.status = 'done';
      existing.completedAt = now;
      const savedOcc = await occRepo.save(existing);
      occurrenceId = savedOcc.id;
    } else {
      const savedOcc = await occRepo.save(
        occRepo.create({
          itemId: item.id,
          ownerId: item.ownerId,
          occursOn: req.occursOn,
          status: 'done',
          completedAt: now,
        }),
      );
      occurrenceId = savedOcc.id;
    }
    const resp = ItemResponseDto.from(item, {
      occursOn: req.occursOn,
      override: { status: 'done', completedAt: now },
    });
    return { item: resp, occurrenceId };
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
    manager?: EntityManager,
  ): Promise<ItemResponseDto> {
    const result = await this.completeWithDetails(userId, id, req, manager);
    return result.item;
  }

  async reopen(
    userId: string,
    id: string,
    options?: { status?: ItemStatus; completedAt?: Date | null },
    manager?: EntityManager,
  ): Promise<ItemResponseDto> {
    const item = await this.requireItemAccess(userId, id, 'EDITOR', manager);
    item.status = options?.status ?? 'open';
    item.completedAt = options?.completedAt !== undefined ? options.completedAt : null;
    const itemRepo = this.getItemRepo(manager);
    const saved = await itemRepo.save(item);
    await this.triggerOrDeferSideEffects(manager, async () => {
      await this.syncNotification(saved);
      if (this.googleCalendarService) {
        await this.googleCalendarService.syncItemToGoogleCalendar(saved);
      }
    });
    return ItemResponseDto.from(saved);
  }

  async restore(userId: string, id: string, manager?: EntityManager): Promise<ItemResponseDto> {
    const itemRepo = this.getItemRepo(manager);
    const item = await itemRepo.findOne({ where: { id }, withDeleted: true });
    if (!item) throw ApiException.notFound('Item not found');
    if (!item.projectId) {
      if (item.ownerId !== userId) throw ApiException.notFound('Item not found');
    } else {
      await this.access.requireAccess(userId, item.projectId, 'EDITOR');
    }
    item.deletedAt = null;
    const saved = await itemRepo.save(item);
    await this.triggerOrDeferSideEffects(manager, async () => {
      await this.syncNotification(saved);
      if (this.googleCalendarService) {
        await this.googleCalendarService.syncItemToGoogleCalendar(saved);
      }
    });
    return ItemResponseDto.from(saved);
  }

  async removeOccurrence(userId: string, id: string, manager?: EntityManager): Promise<void> {
    const occRepo = this.getOccurrenceRepo(manager);
    const occ = await occRepo.findOne({ where: { id } });
    if (!occ) return;
    if (occ.ownerId !== userId) throw ApiException.notFound('Occurrence not found');
    await occRepo.delete({ id });
  }

  async findOccurrence(
    userId: string,
    itemId: string,
    occursOn: string,
    manager?: EntityManager,
  ): Promise<ItemOccurrence | null> {
    const occRepo = this.getOccurrenceRepo(manager);
    return occRepo.findOne({
      where: { itemId, occursOn, ownerId: userId },
    });
  }

  async updateOccurrence(
    userId: string,
    id: string,
    fields: { status?: ItemOccurrenceStatus; completedAt?: Date | null },
    manager?: EntityManager,
  ): Promise<ItemOccurrence> {
    const occRepo = this.getOccurrenceRepo(manager);
    const occ = await occRepo.findOne({ where: { id } });
    if (!occ) throw ApiException.notFound('Occurrence not found');
    if (occ.ownerId !== userId) throw ApiException.notFound('Occurrence not found');
    if (fields.status !== undefined) occ.status = fields.status;
    if (fields.completedAt !== undefined) occ.completedAt = fields.completedAt;
    return occRepo.save(occ);
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
    if (item.legacyTable && LEGACY_TABLE_NOTIFICATION_KINDS[item.legacyTable]) {
      return;
    }
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
    manager?: EntityManager,
  ): Promise<Item> {
    const itemRepo = this.getItemRepo(manager);
    const item = await itemRepo.findOne({ where: { id } });
    if (!item) throw ApiException.notFound('Item not found');
    if (!item.projectId) {
      if (item.ownerId !== userId) throw ApiException.notFound('Item not found');
      return item;
    }
    await this.access.requireAccess(userId, item.projectId, minRole);
    return item;
  }

  private async validateGoal(
    userId: string,
    goalId: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (this.goalService) {
      await this.goalService.validateLiveGoal(userId, goalId, manager);
      return;
    }
    if (!isValidNumericId(goalId)) {
      throw ApiException.notFound('Goal not found');
    }
    const repo = manager
      ? manager.getRepository(Goal)
      : this.items.manager
        ? this.items.manager.getRepository(Goal)
        : undefined;
    if (!repo) {
      throw ApiException.notFound('Goal not found');
    }
    const goal = await repo.findOne({
      where: { id: goalId, ownerId: userId },
    });
    if (!goal) {
      throw ApiException.notFound('Goal not found');
    }
  }
}
