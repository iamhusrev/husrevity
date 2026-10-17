import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Goal, GoalHorizon, GoalStatus } from './goal.entity';
import {
  GoalListQueryDto,
  GoalProgressDto,
  GoalRequestDto,
  GoalResponseDto,
  GoalUpdateRequestDto,
  isRealIsoDate,
} from './dto/goal-dtos';
import { ApiException } from '../common/api.exception';
import { assertIfMatch } from '../common/if-match';
import { isValidNumericId } from '../common/numeric-id.pipe';

const HORIZON_RANKS: Record<GoalHorizon, number> = {
  year: 3,
  quarter: 2,
  month: 1,
};

@Injectable()
export class GoalService {
  constructor(
    @InjectRepository(Goal) private readonly goals: Repository<Goal>,
    private readonly dataSource: DataSource,
  ) {}

  private getGoalRepo(manager?: EntityManager): Repository<Goal> {
    return manager ? manager.getRepository(Goal) : this.goals;
  }

  private validatePeriodAndHorizon(
    horizon: GoalHorizon,
    periodStart: string,
    periodEnd: string,
  ): void {
    if (!isRealIsoDate(periodStart) || !isRealIsoDate(periodEnd)) {
      throw ApiException.badRequest('Invalid period date format');
    }

    const startDate = new Date(`${periodStart}T00:00:00Z`);
    const endDate = new Date(`${periodEnd}T00:00:00Z`);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw ApiException.badRequest('Invalid period date format');
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    if (diffMs < 0) {
      throw ApiException.badRequest(
        'periodEnd must be greater than or equal to periodStart',
      );
    }

    const daySpan = Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1;
    if (horizon === 'year' && daySpan > 366) {
      throw ApiException.badRequest('A year goal can span at most 366 days');
    }
    if (horizon === 'quarter' && daySpan > 93) {
      throw ApiException.badRequest('A quarter goal can span at most 93 days');
    }
    if (horizon === 'month' && daySpan > 31) {
      throw ApiException.badRequest('A month goal can span at most 31 days');
    }
  }

  private async validateParent(
    ownerId: string,
    childHorizon: GoalHorizon,
    childStart: string,
    childEnd: string,
    parentGoalId: string,
    currentGoalId?: string,
    manager?: EntityManager,
  ): Promise<Goal> {
    if (!isValidNumericId(parentGoalId)) {
      throw ApiException.notFound('Parent goal not found');
    }
    if (currentGoalId && parentGoalId === currentGoalId) {
      throw ApiException.badRequest('Cycle detected in goal hierarchy');
    }

    const repo = this.getGoalRepo(manager);
    const parent = await repo.findOne({
      where: { id: parentGoalId, ownerId },
    });
    if (!parent) {
      throw ApiException.notFound('Parent goal not found');
    }

    if (HORIZON_RANKS[parent.horizon] <= HORIZON_RANKS[childHorizon]) {
      throw ApiException.badRequest(
        'Parent goal must have a strictly larger horizon',
      );
    }

    const parentStart =
      typeof parent.periodStart === 'string'
        ? parent.periodStart
        : new Date(parent.periodStart).toISOString().slice(0, 10);
    const parentEnd =
      typeof parent.periodEnd === 'string'
        ? parent.periodEnd
        : new Date(parent.periodEnd).toISOString().slice(0, 10);

    if (childStart < parentStart || childEnd > parentEnd) {
      throw ApiException.badRequest(
        'Parent goal period must contain the child goal period',
      );
    }

    // Walk up the parent chain with depth cap 5 and cycle detection
    let current = parent;
    let depth = 1;
    while (current.parentGoalId) {
      depth++;
      if (depth > 5) {
        throw ApiException.badRequest(
          'Goal hierarchy depth cap exceeded (maximum depth is 5)',
        );
      }
      if (currentGoalId && current.parentGoalId === currentGoalId) {
        throw ApiException.badRequest('Cycle detected in goal hierarchy');
      }

      const next = await repo.findOne({
        where: { id: current.parentGoalId, ownerId },
      });
      if (!next) break; // If parent not live, chain ends
      current = next;
    }

    return parent;
  }

  /** parentGoalId -> live child ids, for every live goal of the owner. */
  private async loadChildrenMap(ownerId: string): Promise<Map<string, string[]>> {
    const allLiveGoals = await this.goals.find({
      where: { ownerId },
      select: ['id', 'parentGoalId'],
    });
    const childrenMap = new Map<string, string[]>();
    for (const g of allLiveGoals) {
      if (g.parentGoalId) {
        const list = childrenMap.get(g.parentGoalId) ?? [];
        list.push(g.id);
        childrenMap.set(g.parentGoalId, list);
      }
    }
    return childrenMap;
  }

  private collectSubtree(childrenMap: Map<string, string[]>, rootId: string): Set<string> {
    const subtree = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const childId of childrenMap.get(curr) ?? []) {
        if (!subtree.has(childId)) {
          subtree.add(childId);
          queue.push(childId);
        }
      }
    }
    return subtree;
  }

  /**
   * The goal id plus the ids of all its live descendants: the same rollup set
   * that progress uses. The caller must have validated that the goal belongs
   * to `ownerId`.
   */
  async liveSubtreeIds(ownerId: string, goalId: string): Promise<string[]> {
    const childrenMap = await this.loadChildrenMap(ownerId);
    return Array.from(this.collectSubtree(childrenMap, goalId));
  }

  /**
   * Computes progress for a list of goals using a bounded number of grouped queries.
   * Total includes directly-linked items + project-linked items, rolled up over live descendants.
   * Cancelled items are excluded; percent is an integer 0-100 (0 when total is 0).
   */
  async computeProgressForGoals(
    ownerId: string,
    goalIds: string[],
  ): Promise<Map<string, GoalProgressDto>> {
    const progressMap = new Map<string, GoalProgressDto>();
    if (goalIds.length === 0) return progressMap;

    // Step 1: Fetch all live goals of owner to build hierarchy.
    // Note: allLiveGoals excludes soft-deleted goals. If a middle goal in the hierarchy
    // is soft-deleted, its descendants are excluded from an ancestor's progress rollup (accepted behaviour).
    const childrenMap = await this.loadChildrenMap(ownerId);

    const subtrees = new Map<string, Set<string>>();
    const allRelevantGoalIds = new Set<string>();

    for (const gid of goalIds) {
      const subtree = this.collectSubtree(childrenMap, gid);
      subtrees.set(gid, subtree);
      for (const id of subtree) {
        allRelevantGoalIds.add(id);
      }
    }

    // Step 2: Query items for all relevant goal IDs in a single grouped query
    const itemsByGoalId = new Map<string, Map<string, string>>();
    if (allRelevantGoalIds.size > 0) {
      const relevantArray = Array.from(allRelevantGoalIds);
      const rows: Array<{ g_id: string; item_id: string; status: string }> =
        await this.dataSource.query(
          `SELECT i.goal_id AS g_id, i.id AS item_id, i.status AS status
           FROM items i
           WHERE i.goal_id = ANY($1::bigint[])
             AND i.deleted_at IS NULL
             AND i.status != 'cancelled'
             AND ((i.project_id IS NULL AND i.owner_id = $2)
               OR i.project_id IN (
                 SELECT lp.id FROM project lp
                 JOIN project_member pm ON pm.project_id = lp.id
                 WHERE lp.deleted_at IS NULL AND pm.deleted_at IS NULL AND pm.user_id = $2))
           UNION ALL
           SELECT p.goal_id AS g_id, i.id AS item_id, i.status AS status
           FROM items i
           JOIN project p ON p.id = i.project_id
           WHERE p.goal_id = ANY($1::bigint[])
             AND p.deleted_at IS NULL
             AND i.deleted_at IS NULL
             AND i.status != 'cancelled'
             AND EXISTS (
               SELECT 1 FROM project_member pm
               WHERE pm.project_id = p.id AND pm.deleted_at IS NULL AND pm.user_id = $2)`,
          [relevantArray, ownerId],
        );

      for (const row of rows) {
        const gid = String(row.g_id);
        let goalItemMap = itemsByGoalId.get(gid);
        if (!goalItemMap) {
          goalItemMap = new Map<string, string>();
          itemsByGoalId.set(gid, goalItemMap);
        }
        goalItemMap.set(String(row.item_id), row.status);
      }
    }

    // Step 3: Roll up deduplicated items for each requested goal
    for (const gid of goalIds) {
      const subtree = subtrees.get(gid) ?? new Set([gid]);
      const deduplicatedItems = new Map<string, string>();

      for (const descId of subtree) {
        const items = itemsByGoalId.get(descId);
        if (items) {
          for (const [itemId, status] of items.entries()) {
            deduplicatedItems.set(itemId, status);
          }
        }
      }

      let total = 0;
      let done = 0;
      let open = 0;
      for (const status of deduplicatedItems.values()) {
        if (status === 'done') {
          done++;
          total++;
        } else if (status === 'open') {
          open++;
          total++;
        }
      }

      const percent = total === 0 ? 0 : Math.round((done / total) * 100);
      progressMap.set(gid, { total, done, open, percent });
    }

    return progressMap;
  }

  async list(ownerId: string, query: GoalListQueryDto): Promise<GoalResponseDto[]> {
    if (query.from && !isRealIsoDate(query.from)) {
      throw ApiException.badRequest('Invalid from date format: must be YYYY-MM-DD');
    }
    if (query.to && !isRealIsoDate(query.to)) {
      throw ApiException.badRequest('Invalid to date format: must be YYYY-MM-DD');
    }

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

    const qb = this.goals
      .createQueryBuilder('g')
      .where('g.owner_id = :ownerId', { ownerId });

    if (query.horizon) {
      qb.andWhere('g.horizon = :horizon', { horizon: query.horizon });
    }
    if (query.status) {
      qb.andWhere('g.status = :status', { status: query.status });
    }
    if (query.from) {
      qb.andWhere('g.period_end >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('g.period_start <= :to', { to: query.to });
    }

    const rows = await qb
      .orderBy('g.period_start', 'DESC')
      .addOrderBy('g.id', 'DESC')
      .take(limit)
      .getMany();

    if (rows.length === 0) return [];

    const goalIds = rows.map((r) => r.id);
    const progressMap = await this.computeProgressForGoals(ownerId, goalIds);

    return rows.map((g) =>
      GoalResponseDto.from(
        g,
        progressMap.get(g.id) ?? { total: 0, done: 0, open: 0, percent: 0 },
      ),
    );
  }

  async get(ownerId: string, id: string): Promise<GoalResponseDto> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be numeric');
    }

    const goal = await this.goals.findOne({
      where: { id, ownerId },
    });
    if (!goal) {
      throw ApiException.notFound('Goal not found');
    }

    const progressMap = await this.computeProgressForGoals(ownerId, [id]);
    const progress =
      progressMap.get(id) ?? { total: 0, done: 0, open: 0, percent: 0 };
    return GoalResponseDto.from(goal, progress);
  }

  async create(
    ownerId: string,
    req: GoalRequestDto,
    manager?: EntityManager,
  ): Promise<GoalResponseDto> {
    this.validatePeriodAndHorizon(req.horizon, req.periodStart, req.periodEnd);

    if (req.parentGoalId) {
      await this.validateParent(
        ownerId,
        req.horizon,
        req.periodStart,
        req.periodEnd,
        req.parentGoalId,
        undefined,
        manager,
      );
    }

    const repo = this.getGoalRepo(manager);
    const entity = repo.create({
      ownerId,
      title: req.title,
      notes: req.notes ?? null,
      horizon: req.horizon,
      periodStart: req.periodStart,
      periodEnd: req.periodEnd,
      parentGoalId: req.parentGoalId ?? null,
      status: req.status ?? 'active',
    });

    const saved = await repo.save(entity);
    return GoalResponseDto.from(saved, { total: 0, done: 0, open: 0, percent: 0 });
  }

  async update(
    ownerId: string,
    id: string,
    req: GoalUpdateRequestDto,
    manager?: EntityManager,
    ifMatchMs?: number,
  ): Promise<GoalResponseDto> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be numeric');
    }

    const repo = this.getGoalRepo(manager);
    const goal = await repo.findOne({
      where: { id, ownerId },
    });
    if (!goal) {
      throw ApiException.notFound('Goal not found');
    }
    assertIfMatch(goal.updatedAt, ifMatchMs, 'Goal');

    const nextHorizon = req.horizon ?? goal.horizon;
    const nextStart =
      req.periodStart ??
      (typeof goal.periodStart === 'string'
        ? goal.periodStart
        : new Date(goal.periodStart).toISOString().slice(0, 10));
    const nextEnd =
      req.periodEnd ??
      (typeof goal.periodEnd === 'string'
        ? goal.periodEnd
        : new Date(goal.periodEnd).toISOString().slice(0, 10));

    const horizonOrPeriodChanged =
      req.horizon !== undefined ||
      req.periodStart !== undefined ||
      req.periodEnd !== undefined;

    if (horizonOrPeriodChanged) {
      this.validatePeriodAndHorizon(nextHorizon, nextStart, nextEnd);
    }

    // A PATCH that echoes the unchanged parentGoalId (typical for a client that
    // sends back what a GET returned) is not a re-parenting: it falls through to
    // the live-parent check below, so a since-deleted parent never blocks edits.
    if (req.parentGoalId !== undefined && req.parentGoalId !== goal.parentGoalId) {
      if (req.parentGoalId) {
        await this.validateParent(
          ownerId,
          nextHorizon,
          nextStart,
          nextEnd,
          req.parentGoalId,
          goal.id,
          manager,
        );
      }
    } else if (horizonOrPeriodChanged && goal.parentGoalId) {
      // Validate existing parent if live; a goal with a deleted parent is treated as a root
      const parent = await repo.findOne({
        where: { id: goal.parentGoalId, ownerId },
      });
      if (parent) {
        await this.validateParent(
          ownerId,
          nextHorizon,
          nextStart,
          nextEnd,
          goal.parentGoalId,
          goal.id,
          manager,
        );
      }
    }

    // Ensure updating this goal still contains all its live children
    const liveChildren = await repo.find({
      where: { parentGoalId: goal.id, ownerId },
    });
    for (const child of liveChildren) {
      if (HORIZON_RANKS[nextHorizon] <= HORIZON_RANKS[child.horizon]) {
        throw ApiException.badRequest(
          'Goal horizon must remain strictly larger than children horizons',
        );
      }
      const childStart =
        typeof child.periodStart === 'string'
          ? child.periodStart
          : new Date(child.periodStart).toISOString().slice(0, 10);
      const childEnd =
        typeof child.periodEnd === 'string'
          ? child.periodEnd
          : new Date(child.periodEnd).toISOString().slice(0, 10);
      if (nextStart > childStart || nextEnd < childEnd) {
        throw ApiException.badRequest(
          'Goal period must continue to contain all child goal periods',
        );
      }
    }

    if (req.title !== undefined) goal.title = req.title;
    if (req.notes !== undefined) goal.notes = req.notes ?? null;
    if (req.horizon !== undefined) goal.horizon = req.horizon;
    if (req.periodStart !== undefined) goal.periodStart = req.periodStart;
    if (req.periodEnd !== undefined) goal.periodEnd = req.periodEnd;
    if (req.parentGoalId !== undefined) goal.parentGoalId = req.parentGoalId;
    if (req.status !== undefined) goal.status = req.status;

    const saved = await repo.save(goal);
    const progressMap = await this.computeProgressForGoals(ownerId, [id]);
    return GoalResponseDto.from(
      saved,
      progressMap.get(id) ?? { total: 0, done: 0, open: 0, percent: 0 },
    );
  }

  async delete(
    ownerId: string,
    id: string,
    manager?: EntityManager,
    ifMatchMs?: number,
  ): Promise<void> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be numeric');
    }

    const repo = this.getGoalRepo(manager);
    const goal = await repo.findOne({
      where: { id, ownerId },
    });
    if (!goal) {
      throw ApiException.notFound('Goal not found');
    }
    assertIfMatch(goal.updatedAt, ifMatchMs, 'Goal');

    // Soft delete leaves children in place. Children whose parent is soft-deleted
    // simply have no live parent and the list treats them as roots.
    await repo.softRemove(goal);
  }

  async restore(
    ownerId: string,
    id: string,
    manager?: EntityManager,
  ): Promise<GoalResponseDto> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be numeric');
    }

    const repo = this.getGoalRepo(manager);
    const goal = await repo.findOne({
      where: { id, ownerId },
      withDeleted: true,
    });
    if (!goal || !goal.deletedAt) {
      throw ApiException.notFound('Goal not found');
    }

    await repo.restore({ id, ownerId });
    const restored = await repo.findOne({
      where: { id, ownerId },
    });
    if (!restored) {
      throw ApiException.notFound('Goal not found');
    }

    if (restored.parentGoalId) {
      const parent = await repo.findOne({
        where: { id: restored.parentGoalId, ownerId },
      });
      if (!parent) {
        restored.parentGoalId = null;
        await repo.save(restored);
      }
    }

    const progressMap = await this.computeProgressForGoals(ownerId, [id]);
    return GoalResponseDto.from(
      restored,
      progressMap.get(id) ?? { total: 0, done: 0, open: 0, percent: 0 },
    );
  }

  /**
   * Validates that goalId belongs to a live goal of the same owner.
   * Throws 404 if not found, deleted, or wrong owner.
   */
  async validateLiveGoal(
    ownerId: string,
    goalId: string,
    manager?: EntityManager,
  ): Promise<Goal> {
    if (!isValidNumericId(goalId)) {
      throw ApiException.notFound('Goal not found');
    }

    const repo = this.getGoalRepo(manager);
    const goal = await repo.findOne({
      where: { id: goalId, ownerId },
    });
    if (!goal) {
      throw ApiException.notFound('Goal not found');
    }

    return goal;
  }
}
