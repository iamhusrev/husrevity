import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ChangeSet, ChangeSetSource, ChangeSetStatus } from './entities/change-set.entity';
import { ChangeEntry, ChangeEntryOp, ChangeEntryTargetType } from './entities/change-entry.entity';
import { Item, ItemStatus } from '../item/item.entity';
import { ItemOccurrence, ItemOccurrenceStatus } from '../item/item-occurrence.entity';
import { Goal } from '../goal/goal.entity';
import { ItemService } from '../item/item.service';
import { ApiException } from '../common/api.exception';

export interface UndoConflict {
  targetType: ChangeEntryTargetType;
  targetId: string;
  reason: string;
}

export interface UndoResult {
  id: string;
  status: ChangeSetStatus;
  undoneEntries: number;
  conflicts: UndoConflict[];
}

import { isValidNumericId, NUMERIC_ID_REGEX } from '../common/numeric-id.pipe';
export { isValidNumericId, NUMERIC_ID_REGEX };

export function extractItemSnapshot(item: any): Record<string, unknown> {
  if (!item) return {};
  return {
    title: item.title,
    notes: item.notes ?? null,
    context: item.context ?? null,
    projectId: item.projectId ?? null,
    goalId: item.goalId ?? null,
    blockId: item.blockId ?? null,
    scheduledAt:
      item.scheduledAt instanceof Date
        ? item.scheduledAt.toISOString()
        : (item.scheduledAt ?? null),
    durationMin: item.durationMin ?? null,
    dueAt: item.dueAt instanceof Date ? item.dueAt.toISOString() : (item.dueAt ?? null),
    notifyMinutesBefore: item.notifyMinutesBefore ?? null,
    rrule: item.rrule ?? null,
    status: item.status ?? 'open',
    completedAt:
      item.completedAt instanceof Date
        ? item.completedAt.toISOString()
        : (item.completedAt ?? null),
    payload: item.payload ?? {},
    updatedAt:
      item.updatedAt instanceof Date ? item.updatedAt.toISOString() : (item.updatedAt ?? null),
  };
}

@Injectable()
export class ChangeSetService {
  constructor(
    @InjectRepository(ChangeSet)
    private readonly changeSets: Repository<ChangeSet>,
    @InjectRepository(ChangeEntry)
    private readonly entries: Repository<ChangeEntry>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    @InjectRepository(ItemOccurrence)
    private readonly occurrences: Repository<ItemOccurrence>,
    private readonly itemService: ItemService,
    private readonly dataSource: DataSource,
  ) {}

  async begin(
    ownerId: string,
    meta: { source: ChangeSetSource; label: string },
    manager?: EntityManager,
  ): Promise<string> {
    const label = meta.label.length > 200 ? meta.label.slice(0, 197) + '...' : meta.label;
    const repo = manager ? manager.getRepository(ChangeSet) : this.changeSets;
    const cs = repo.create({
      ownerId,
      source: meta.source,
      label,
      status: 'applied',
    });
    const saved = await repo.save(cs);
    return saved.id;
  }

  async recordEntry(
    changeSetId: string,
    ownerId: string,
    entry: {
      targetType: ChangeEntryTargetType;
      targetId: string;
      op: ChangeEntryOp;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
    },
    manager?: EntityManager,
  ): Promise<ChangeEntry> {
    const repo = manager ? manager.getRepository(ChangeEntry) : this.entries;
    const existing = await repo.find({
      where: { changeSetId },
      order: { ordinal: 'DESC' },
      take: 1,
    });
    const nextOrdinal = existing.length > 0 ? existing[0].ordinal + 1 : 1;

    const row = repo.create({
      changeSetId,
      ownerId,
      ordinal: nextOrdinal,
      targetType: entry.targetType,
      targetId: entry.targetId,
      op: entry.op,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
    return repo.save(row);
  }

  async runWithChangeSet<T>(
    ownerId: string,
    meta: { source: ChangeSetSource; label: string },
    fn: (changeSetId: string, manager: EntityManager) => Promise<T>,
  ): Promise<{ result: T; changeSetId: string | null }> {
    const postCommitActions: Array<() => Promise<void>> = [];

    const { result, changeSetId } = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        (manager as any).__postCommit = postCommitActions;
        const changeSetId = await this.begin(ownerId, meta, manager);
        const res = await fn(changeSetId, manager);
        const count = await manager.getRepository(ChangeEntry).count({ where: { changeSetId } });
        if (count === 0) {
          await manager.getRepository(ChangeSet).delete({ id: changeSetId });
          return { result: res, changeSetId: null };
        }
        return { result: res, changeSetId };
      },
    );

    for (const action of postCommitActions) {
      try {
        await action();
      } catch {
        // ignore post-commit errors
      }
    }

    return { result, changeSetId };
  }

  async list(
    ownerId: string,
    query: { limit?: number; before?: string },
  ): Promise<{ items: Array<any> }> {
    if (query.before !== undefined && !isValidNumericId(query.before)) {
      throw ApiException.badRequest('Invalid before ID: must be a numeric ID (1-19 digits)');
    }

    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

    const qb = this.changeSets
      .createQueryBuilder('cs')
      .where('cs.owner_id = :ownerId', { ownerId })
      .andWhere('EXISTS (SELECT 1 FROM change_entry ce WHERE ce.change_set_id = cs.id)');

    if (query.before) {
      qb.andWhere('cs.id < :before', { before: query.before });
    }

    const rows = await qb
      .orderBy('cs.created_at', 'DESC')
      .addOrderBy('cs.id', 'DESC')
      .take(limit)
      .getMany();

    if (rows.length === 0) {
      return { items: [] };
    }

    const ids = rows.map((r) => r.id);
    const countQuery = await this.entries
      .createQueryBuilder('ce')
      .select('ce.change_set_id', 'changeSetId')
      .addSelect('COUNT(*)', 'count')
      .where('ce.change_set_id IN (:...ids)', { ids })
      .groupBy('ce.change_set_id')
      .getRawMany();

    const countMap = new Map<string, number>();
    for (const r of countQuery) {
      countMap.set(String(r.changeSetId), Number(r.count));
    }

    const results = rows.map((row) => ({
      id: row.id,
      source: row.source,
      label: row.label,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      entryCount: countMap.get(String(row.id)) ?? 0,
    }));

    return { items: results };
  }

  async get(ownerId: string, id: string): Promise<any> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid change set ID: must be a numeric ID (1-19 digits)');
    }

    const cs = await this.changeSets.findOne({
      where: { id, ownerId },
    });
    if (!cs) {
      throw ApiException.notFound('Change set not found');
    }

    const entries = await this.entries.find({
      where: { changeSetId: id },
      order: { ordinal: 'ASC' },
    });

    return {
      id: cs.id,
      source: cs.source,
      label: cs.label,
      status: cs.status,
      undoneAt: cs.undoneAt ? cs.undoneAt.toISOString() : null,
      createdAt: cs.createdAt.toISOString(),
      entries: entries.map((e) => ({
        id: e.id,
        ordinal: e.ordinal,
        targetType: e.targetType,
        targetId: e.targetId,
        op: e.op,
        before: e.before,
        after: e.after,
      })),
    };
  }

  async undo(ownerId: string, changeSetId: string): Promise<UndoResult> {
    if (!isValidNumericId(changeSetId)) {
      throw ApiException.badRequest('Invalid change set ID: must be a numeric ID (1-19 digits)');
    }

    const postCommitActions: Array<() => Promise<void>> = [];

    const result = await this.dataSource.transaction(async (manager: EntityManager) => {
      (manager as any).__postCommit = postCommitActions;

      const changeSetRepo = manager.getRepository(ChangeSet);
      const entryRepo = manager.getRepository(ChangeEntry);
      const itemRepo = manager.getRepository(Item);
      const occRepo = manager.getRepository(ItemOccurrence);

      const cs = await changeSetRepo.findOne({
        where: { id: changeSetId, ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cs) {
        throw ApiException.notFound('Change set not found');
      }

      if (cs.status === 'undone') {
        const totalCount = await entryRepo.count({ where: { changeSetId } });
        return {
          id: cs.id,
          status: cs.status,
          undoneEntries: cs.entries?.length ?? totalCount,
          conflicts: [],
        };
      }

      const entries = await entryRepo.find({
        where: { changeSetId },
        order: { ordinal: 'DESC' },
      });

      // Compute latest after.updatedAt per target across ALL entries in this change set
      const latestAfterUpdatedAtMsMap = new Map<string, number>();
      for (const entry of entries) {
        if (entry.after?.updatedAt) {
          const key = `${entry.targetType}:${entry.targetId}`;
          const time = new Date(entry.after.updatedAt as string).getTime();
          const current = latestAfterUpdatedAtMsMap.get(key) ?? -Infinity;
          if (time > current) {
            latestAfterUpdatedAtMsMap.set(key, time);
          }
        }
      }

      // On-demand item cache to capture initial updatedAt before modifications and avoid double findOne
      const itemCache = new Map<string, { item: Item | null; initialUpdatedAtMs: number | null }>();

      const conflicts: UndoConflict[] = [];

      for (const entry of entries) {
        // Skip entries already undone in a previous run
        if (entry.undoneAt != null) {
          continue;
        }

        if (entry.targetType === 'item') {
          let cached = itemCache.get(entry.targetId);
          if (!cached) {
            const item = await itemRepo.findOne({
              where: { id: entry.targetId },
              withDeleted: true,
            });
            const initialUpdatedAtMs = item?.updatedAt ? new Date(item.updatedAt).getTime() : null;
            cached = { item, initialUpdatedAtMs };
            itemCache.set(entry.targetId, cached);
          }

          const item = cached.item;
          if (!item) {
            conflicts.push({
              targetType: 'item',
              targetId: entry.targetId,
              reason: 'Item not found',
            });
            continue;
          }

          if (item.ownerId !== ownerId) {
            conflicts.push({
              targetType: 'item',
              targetId: entry.targetId,
              reason: 'not_owner',
            });
            continue;
          }

          const initialUpdatedAt = cached.initialUpdatedAtMs;
          const latestTargetAfterUpdatedAt = latestAfterUpdatedAtMsMap.get(
            `item:${entry.targetId}`,
          );
          if (
            latestTargetAfterUpdatedAt !== undefined &&
            initialUpdatedAt !== null &&
            initialUpdatedAt > latestTargetAfterUpdatedAt
          ) {
            conflicts.push({
              targetType: 'item',
              targetId: entry.targetId,
              reason: 'Item was modified after this change set',
            });
            continue;
          }

          try {
            if (entry.op === 'create') {
              await this.itemService.delete(ownerId, entry.targetId, manager);
            } else if (entry.op === 'update') {
              const { ownerId: _ignoredOwner, ...beforeFields } = (entry.before ?? {}) as any;
              if (beforeFields.goalId) {
                const goalRepo = manager.getRepository(Goal);
                const liveGoal = isValidNumericId(beforeFields.goalId)
                  ? await goalRepo.findOne({ where: { id: beforeFields.goalId, ownerId } })
                  : null;
                if (!liveGoal) {
                  delete beforeFields.goalId;
                }
              }
              await this.itemService.update(
                ownerId,
                entry.targetId,
                beforeFields,
                undefined,
                manager,
              );
            } else if (entry.op === 'delete') {
              await this.itemService.restore(ownerId, entry.targetId, manager);
            } else if (entry.op === 'complete') {
              const prevStatus = (entry.before?.status as ItemStatus) ?? 'open';
              const prevCompletedAt = entry.before?.completedAt
                ? new Date(entry.before.completedAt as string)
                : null;
              await this.itemService.reopen(
                ownerId,
                entry.targetId,
                { status: prevStatus, completedAt: prevCompletedAt },
                manager,
              );
            }
          } catch (err: any) {
            const isAccessError =
              (err instanceof ApiException &&
                (err.getStatus() === 403 ||
                  (err.getStatus() === 404 && err.message?.toLowerCase().includes('project')))) ||
              err?.status === 403 ||
              err?.message?.toLowerCase().includes('permission') ||
              err?.message?.toLowerCase().includes('access');

            if (isAccessError) {
              conflicts.push({
                targetType: 'item',
                targetId: entry.targetId,
                reason: 'no_access',
              });
              continue;
            }
            throw err;
          }

          entry.undoneAt = new Date();
          await entryRepo.save(entry);
        } else if (entry.targetType === 'item_occurrence') {
          const occ = await occRepo.findOne({
            where: { id: entry.targetId },
          });

          if (!occ) {
            conflicts.push({
              targetType: 'item_occurrence',
              targetId: entry.targetId,
              reason: 'Occurrence not found',
            });
            continue;
          }

          if (occ.ownerId !== ownerId) {
            conflicts.push({
              targetType: 'item_occurrence',
              targetId: entry.targetId,
              reason: 'not_owner',
            });
            continue;
          }

          const occInitialUpdatedAtMs = occ.updatedAt ? new Date(occ.updatedAt).getTime() : null;
          const latestOccAfterUpdatedAt = latestAfterUpdatedAtMsMap.get(
            `item_occurrence:${entry.targetId}`,
          );
          if (
            latestOccAfterUpdatedAt !== undefined &&
            occInitialUpdatedAtMs !== null &&
            occInitialUpdatedAtMs > latestOccAfterUpdatedAt
          ) {
            conflicts.push({
              targetType: 'item_occurrence',
              targetId: entry.targetId,
              reason: 'Occurrence was modified after this change set',
            });
            continue;
          }

          try {
            if (entry.op === 'update') {
              const prevStatus = (entry.before?.status as ItemOccurrenceStatus) ?? 'open';
              const prevCompletedAt = entry.before?.completedAt
                ? new Date(entry.before.completedAt as string)
                : null;
              await this.itemService.updateOccurrence(
                ownerId,
                entry.targetId,
                { status: prevStatus, completedAt: prevCompletedAt },
                manager,
              );
            } else if (entry.op === 'create' || entry.op === 'complete') {
              await this.itemService.removeOccurrence(ownerId, entry.targetId, manager);
            }
          } catch (err: any) {
            const isAccessError =
              (err instanceof ApiException &&
                (err.getStatus() === 403 ||
                  (err.getStatus() === 404 && err.message?.toLowerCase().includes('project')))) ||
              err?.status === 403 ||
              err?.message?.toLowerCase().includes('permission') ||
              err?.message?.toLowerCase().includes('access');

            if (isAccessError) {
              conflicts.push({
                targetType: 'item_occurrence',
                targetId: entry.targetId,
                reason: 'no_access',
              });
              continue;
            }
            throw err;
          }

          entry.undoneAt = new Date();
          await entryRepo.save(entry);
        }
      }

      const allUndone = entries.length > 0 && entries.every((e) => e.undoneAt != null);

      if (allUndone) {
        cs.status = 'undone';
        cs.undoneAt = new Date();
      } else {
        cs.status = 'partially_undone';
      }
      await changeSetRepo.save(cs);

      const totalUndone = entries.filter((e) => e.undoneAt != null).length;

      return {
        id: cs.id,
        status: cs.status,
        undoneEntries: totalUndone,
        conflicts,
      };
    });

    for (const action of postCommitActions) {
      try {
        await action();
      } catch {
        // ignore post-commit errors
      }
    }

    return result;
  }
}
