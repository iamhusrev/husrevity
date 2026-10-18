import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { GoalService } from '../../goal/goal.service';
import { ItemService } from '../../item/item.service';
import { ProjectService } from '../../project/project.service';
import { NoteLinkService } from '../../note-link/note-link.service';
import { ChangeSetService, extractItemSnapshot } from '../../change-set/change-set.service';
import { ApiException } from '../../common/api.exception';
import { isValidNumericId } from '../../common/numeric-id.pipe';
import { isRealIsoDate } from '../../goal/dto/goal-dtos';
import { NoteLinkTargetType } from '../../note-link/dto/note-link-dtos';
import { PatScope } from '../../auth/personal-access-token.entity';
import { getOwnerAndCheckScope, McpExtra, textResult, toolError } from './mcp-tool-helpers';
import { looksLikeSecretInFields } from './secret-guard';
import { SECRETS_REFUSED_MESSAGE } from './plan-input';

export interface GoalToolsDeps {
  goalService: GoalService;
  itemService: ItemService;
  projectService: ProjectService;
  changeSetService: ChangeSetService;
  noteLinkService: NoteLinkService;
}

const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const MAX_LINK_ITEMS = 50;
const MAX_LINK_PROJECTS = 20;

export function registerGoalTools(server: McpServer, deps: GoalToolsDeps) {
  // get_goal
  server.registerTool(
    'get_goal',
    {
      description: 'Get a single goal by numeric ID, including its progress',
      inputSchema: {
        id: z.string().describe('Numeric goal ID'),
      },
    },
    async (params, extra) => {
      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, 'goals:read');
      const id = String((params as Record<string, unknown> | undefined)?.id ?? '');
      if (!isValidNumericId(id)) {
        return toolError('Invalid id: must be a numeric ID (1-19 digits)');
      }
      try {
        return textResult(await deps.goalService.get(ownerId, id));
      } catch (err: any) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );

  // 1. list_goals
  server.registerTool(
    'list_goals',
    {
      description:
        'List goals for the owner with computed progress. Filter by horizon, status or date range. ' +
        'Dates must be valid calendar dates (YYYY-MM-DD). Limit is 1-100 (default 50).',
      inputSchema: {
        horizon: z.enum(['year', 'quarter', 'month']).optional().describe('Filter by horizon'),
        status: z.enum(['active', 'done', 'dropped']).optional().describe('Filter by status'),
        from: z
          .string()
          .optional()
          .describe('Filter goals ending on or after this date (YYYY-MM-DD)'),
        to: z
          .string()
          .optional()
          .describe('Filter goals starting on or before this date (YYYY-MM-DD)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of goals (1-100, default 50)'),
      },
    },
    async (params, extra) => {
      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, 'goals:read');
      const input = (params ?? {}) as Record<string, unknown>;

      if (input.from !== undefined) {
        if (!isRealIsoDate(input.from)) {
          return toolError(
            'Invalid from date: must be YYYY-MM-DD representing a valid calendar date',
          );
        }
      }
      if (input.to !== undefined) {
        if (!isRealIsoDate(input.to)) {
          return toolError(
            'Invalid to date: must be YYYY-MM-DD representing a valid calendar date',
          );
        }
      }

      let limit = 50;
      if (input.limit !== undefined) {
        if (
          typeof input.limit !== 'number' ||
          !Number.isInteger(input.limit) ||
          input.limit < 1 ||
          input.limit > 100
        ) {
          return toolError('limit must be an integer between 1 and 100');
        }
        limit = input.limit;
      }

      try {
        const goals = await deps.goalService.list(ownerId, {
          horizon: input.horizon as any,
          status: input.status as any,
          from: input.from as string,
          to: input.to as string,
          limit,
        });

        return textResult({ goals });
      } catch (err: any) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );

  // 2. create_goal
  server.registerTool(
    'create_goal',
    {
      description:
        'Create a new goal for the owner. Horizon can be year, quarter or month. ' +
        'Dates must represent a valid calendar period within horizon bounds. ' +
        'Secrets and credentials are never stored and are refused by secret guard.',
      inputSchema: {
        title: z.string().min(1).max(MAX_TITLE_LENGTH).describe('Goal title (1-200 characters)'),
        horizon: z
          .enum(['year', 'quarter', 'month'])
          .describe('Goal horizon (year, quarter, month)'),
        periodStart: z.string().describe('Period start date (YYYY-MM-DD)'),
        periodEnd: z.string().describe('Period end date (YYYY-MM-DD)'),
        parentGoalId: z.string().optional().describe('Optional parent goal ID in the hierarchy'),
        notes: z
          .string()
          .max(MAX_NOTES_LENGTH)
          .optional()
          .describe('Optional notes (up to 2000 chars)'),
      },
    },
    async (params, extra) => {
      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, 'goals:write');
      const input = (params ?? {}) as Record<string, unknown>;

      if (looksLikeSecretInFields(input.title, input.notes)) {
        return toolError(SECRETS_REFUSED_MESSAGE);
      }

      const rawTitle = input.title;
      if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
        return toolError('title is required and must not be blank');
      }
      const title = rawTitle.trim();
      if (title.length > MAX_TITLE_LENGTH) {
        return toolError(`title must be at most ${MAX_TITLE_LENGTH} characters`);
      }

      const horizon = input.horizon as 'year' | 'quarter' | 'month';
      if (!['year', 'quarter', 'month'].includes(horizon)) {
        return toolError('horizon must be one of year, quarter, month');
      }

      const periodStart = input.periodStart as string;
      const periodEnd = input.periodEnd as string;
      if (!isRealIsoDate(periodStart)) {
        return toolError('periodStart must be YYYY-MM-DD representing a valid calendar date');
      }
      if (!isRealIsoDate(periodEnd)) {
        return toolError('periodEnd must be YYYY-MM-DD representing a valid calendar date');
      }

      let parentGoalId: string | undefined = undefined;
      if (input.parentGoalId !== undefined && input.parentGoalId !== null) {
        const rawParent = String(input.parentGoalId);
        if (!isValidNumericId(rawParent)) {
          return toolError('parentGoalId must be a numeric ID (1-19 digits)');
        }
        parentGoalId = rawParent;
      }

      let notes: string | undefined = undefined;
      if (input.notes !== undefined && input.notes !== null) {
        if (typeof input.notes !== 'string') {
          return toolError('notes must be a string');
        }
        if (input.notes.length > MAX_NOTES_LENGTH) {
          return toolError(`notes must be at most ${MAX_NOTES_LENGTH} characters`);
        }
        notes = input.notes;
      }

      try {
        const goal = await deps.goalService.create(ownerId, {
          title,
          horizon,
          periodStart,
          periodEnd,
          parentGoalId,
          notes,
        });

        const interpretation = `Created ${goal.horizon} goal "${goal.title}" (${goal.periodStart} to ${goal.periodEnd})`;

        return textResult({
          goal,
          interpretation,
        });
      } catch (err: any) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );

  // 3. update_goal
  server.registerTool(
    'update_goal',
    {
      description:
        'Update an existing goal for the owner. Can modify title, notes, status, period dates or parentGoalId. ' +
        'Secrets and credentials are never stored and are refused by secret guard.',
      inputSchema: {
        id: z.string().describe('Numeric goal ID to update'),
        title: z
          .string()
          .min(1)
          .max(MAX_TITLE_LENGTH)
          .optional()
          .describe('New title (1-200 characters)'),
        notes: z
          .string()
          .max(MAX_NOTES_LENGTH)
          .nullable()
          .optional()
          .describe('New notes or null to clear'),
        status: z.enum(['active', 'done', 'dropped']).optional().describe('New status'),
        periodStart: z.string().optional().describe('New period start date (YYYY-MM-DD)'),
        periodEnd: z.string().optional().describe('New period end date (YYYY-MM-DD)'),
        parentGoalId: z
          .string()
          .nullable()
          .optional()
          .describe('New parent goal ID or null to remove'),
      },
    },
    async (params, extra) => {
      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, 'goals:write');
      const input = (params ?? {}) as Record<string, unknown>;

      const id = String(input.id ?? '');
      if (!isValidNumericId(id)) {
        return toolError('Invalid id: must be a numeric ID (1-19 digits)');
      }

      if (looksLikeSecretInFields(input.title, input.notes)) {
        return toolError(SECRETS_REFUSED_MESSAGE);
      }

      const updateReq: Record<string, any> = {};

      if (input.title !== undefined) {
        if (typeof input.title !== 'string' || !input.title.trim()) {
          return toolError('title must be a non-blank string');
        }
        if (input.title.trim().length > MAX_TITLE_LENGTH) {
          return toolError(`title must be at most ${MAX_TITLE_LENGTH} characters`);
        }
        updateReq.title = input.title.trim();
      }

      if (input.notes !== undefined) {
        if (input.notes === null) {
          updateReq.notes = null;
        } else if (typeof input.notes !== 'string') {
          return toolError('notes must be a string or null');
        } else if (input.notes.length > MAX_NOTES_LENGTH) {
          return toolError(`notes must be at most ${MAX_NOTES_LENGTH} characters`);
        } else {
          updateReq.notes = input.notes;
        }
      }

      if (input.status !== undefined) {
        if (!['active', 'done', 'dropped'].includes(input.status as string)) {
          return toolError('status must be one of active, done, dropped');
        }
        updateReq.status = input.status;
      }

      if (input.periodStart !== undefined) {
        if (!isRealIsoDate(input.periodStart)) {
          return toolError('periodStart must be YYYY-MM-DD representing a valid calendar date');
        }
        updateReq.periodStart = input.periodStart;
      }

      if (input.periodEnd !== undefined) {
        if (!isRealIsoDate(input.periodEnd)) {
          return toolError('periodEnd must be YYYY-MM-DD representing a valid calendar date');
        }
        updateReq.periodEnd = input.periodEnd;
      }

      if (input.parentGoalId !== undefined) {
        if (input.parentGoalId === null) {
          updateReq.parentGoalId = null;
        } else {
          const rawPid = String(input.parentGoalId);
          if (!isValidNumericId(rawPid)) {
            return toolError('parentGoalId must be null or a numeric ID (1-19 digits)');
          }
          updateReq.parentGoalId = rawPid;
        }
      }

      try {
        const goal = await deps.goalService.update(ownerId, id, updateReq);
        return textResult({ goal });
      } catch (err: any) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );

  // 4. link_to_goal
  server.registerTool(
    'link_to_goal',
    {
      description:
        'Links items and/or projects to a goal (or clears links if clear: true). ' +
        'Items are updated inside ONE change set and can be undone with undo_change_set. ' +
        'Projects are updated through ProjectService outside the change set and are not undoable. Project links are not part of the change set. ' +
        'All-or-nothing validation for items before any write; project errors are reported individually without rolling back items.',
      inputSchema: {
        goalId: z.string().describe('Target goal ID'),
        itemIds: z
          .array(z.string())
          .max(MAX_LINK_ITEMS)
          .optional()
          .describe('Item IDs to link (up to 50)'),
        projectIds: z
          .array(z.string())
          .max(MAX_LINK_PROJECTS)
          .optional()
          .describe('Project IDs to link (up to 20)'),
        clear: z
          .boolean()
          .optional()
          .describe('If true, removes the goal link from given items and projects'),
      },
    },
    async (params, extra) => {
      const input = (params ?? {}) as Record<string, unknown>;

      const rawItemIds = Array.isArray(input.itemIds) ? (input.itemIds as string[]) : [];
      const rawProjectIds = Array.isArray(input.projectIds) ? (input.projectIds as string[]) : [];

      const requiredScopes: PatScope[] = ['goals:write'];
      if (rawItemIds.length > 0) {
        requiredScopes.push('items:write');
      }
      if (rawProjectIds.length > 0) {
        requiredScopes.push('projects:write');
      }

      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, requiredScopes);

      const goalId = String(input.goalId ?? '');
      if (!isValidNumericId(goalId)) {
        return toolError('goalId must be a numeric ID (1-19 digits)');
      }

      if (rawItemIds.length > MAX_LINK_ITEMS) {
        return toolError(`itemIds cannot exceed ${MAX_LINK_ITEMS} items`);
      }
      for (const id of rawItemIds) {
        if (!isValidNumericId(id)) {
          return toolError(`Invalid itemId '${id}': must be a numeric ID (1-19 digits)`);
        }
      }

      if (rawProjectIds.length > MAX_LINK_PROJECTS) {
        return toolError(`projectIds cannot exceed ${MAX_LINK_PROJECTS} projects`);
      }
      for (const id of rawProjectIds) {
        if (!isValidNumericId(id)) {
          return toolError(`Invalid projectId '${id}': must be a numeric ID (1-19 digits)`);
        }
      }

      const clear = Boolean(input.clear);
      const targetGoalId = clear ? null : goalId;

      // 1. Verify goal exists and belongs to caller (only when NOT clearing)
      if (!clear) {
        try {
          await deps.goalService.get(ownerId, goalId);
        } catch (err: any) {
          if (err instanceof ApiException) return toolError(err.message);
          throw err;
        }
      }

      const uniqueItemIds = [...new Set(rawItemIds)];
      const uniqueProjectIds = [...new Set(rawProjectIds)];

      // 2. Fetch and validate items before writing anything (all-or-nothing for items to be written)
      const itemsToWrite: any[] = [];
      const itemsSkipped: Array<{ id: string; reason: string }> = [];

      for (const itemId of uniqueItemIds) {
        let item: any;
        try {
          item = await deps.itemService.get(ownerId, itemId);
        } catch (err: any) {
          if (err instanceof ApiException) return toolError(err.message);
          throw err;
        }

        // Restrict link_to_goal to items where item.ownerId === caller
        if (item.ownerId !== ownerId) {
          itemsSkipped.push({ id: itemId, reason: 'not_owner' });
          continue;
        }

        // Already-linked items (same goalId) must not create a no-op change entry or count as linked
        if (item.goalId === targetGoalId) {
          continue;
        }

        itemsToWrite.push(item);
      }

      // 3. Update items in ONE change set if any items need updating
      let changeSetId: string | null = null;
      let linkedItemIds: string[] = [];

      if (itemsToWrite.length > 0) {
        try {
          const runRes = await deps.changeSetService.runWithChangeSet(
            ownerId,
            { source: 'mcp', label: 'link_to_goal' },
            async (csId, manager) => {
              const updatedIds: string[] = [];
              for (const item of itemsToWrite) {
                const existing = await deps.itemService.get(ownerId, item.id, manager);
                const before = extractItemSnapshot(existing);
                const updated = await deps.itemService.update(
                  ownerId,
                  item.id,
                  { goalId: targetGoalId },
                  undefined,
                  manager,
                );
                await deps.changeSetService.recordEntry(
                  csId,
                  ownerId,
                  {
                    targetType: 'item',
                    targetId: item.id,
                    op: 'update',
                    before,
                    after: extractItemSnapshot(updated),
                  },
                  manager,
                );
                updatedIds.push(item.id);
              }
              return updatedIds;
            },
          );
          linkedItemIds = runRes.result;
          changeSetId = runRes.changeSetId ?? null;
        } catch (err: any) {
          if (err instanceof ApiException) return toolError(err.message);
          throw err;
        }
      }

      // 4. Update projects (not part of change set; failures reported per project)
      const projectsResult: Array<{ id: string; ok: boolean; error?: string }> = [];

      for (const projectId of uniqueProjectIds) {
        try {
          await deps.projectService.update(ownerId, projectId, {
            goalId: targetGoalId,
          });
          projectsResult.push({ id: projectId, ok: true });
        } catch (err: any) {
          const errorMessage =
            err instanceof ApiException ? err.message : 'Failed to update project';
          projectsResult.push({ id: projectId, ok: false, error: errorMessage });
        }
      }

      // If every requested project failed and no item was linked, return a tool error result instead of a success
      if (
        uniqueProjectIds.length > 0 &&
        projectsResult.every((p) => !p.ok) &&
        linkedItemIds.length === 0
      ) {
        const errorMsg =
          projectsResult.length === 1
            ? projectsResult[0].error!
            : 'All requested projects failed to update';
        return toolError(errorMsg, {
          projects: projectsResult,
          itemsLinked: 0,
          itemsSkipped,
          skipped: itemsSkipped,
          changeSetId: null,
          undoable: false,
        });
      }

      return textResult({
        changeSetId,
        itemsLinked: linkedItemIds.length,
        itemsSkipped,
        skipped: itemsSkipped,
        linkedItems: linkedItemIds,
        projects: projectsResult,
        undoable: changeSetId !== null,
      });
    },
  );

  // 5. restore_goal
  server.registerTool(
    'restore_goal',
    {
      description:
        'Restore a deleted goal by numeric ID (owner only). Use list_deleted to find the ID.',
      inputSchema: {
        id: z.string().describe('Numeric goal ID to restore'),
      },
    },
    async (params, extra) => {
      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, 'goals:write');
      const id = String((params as Record<string, unknown> | undefined)?.id ?? '');
      if (!isValidNumericId(id)) {
        return toolError('Invalid id: must be a numeric ID (1-19 digits)');
      }
      try {
        const goal = await deps.goalService.restore(ownerId, id);
        return textResult({ goal });
      } catch (err: any) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );

  // 6. link_note
  server.registerTool(
    'link_note',
    {
      description:
        'Link a note to an item, project or goal. Requires notes:write scope and the read scope for the target type ' +
        '(items:read, projects:read, or goals:read). Idempotent.',
      inputSchema: {
        noteId: z.string().describe('Numeric note ID'),
        targetType: z
          .enum(['item', 'project', 'goal'])
          .describe('Target type (item, project, goal)'),
        targetId: z.string().describe('Numeric target ID'),
      },
    },
    async (params, extra) => {
      // Require owner auth and notes:write upfront before body validation
      getOwnerAndCheckScope(extra as unknown as McpExtra, 'notes:write');

      const input = (params ?? {}) as Record<string, unknown>;

      const targetType = input.targetType as 'item' | 'project' | 'goal';
      if (!['item', 'project', 'goal'].includes(targetType)) {
        return toolError('Invalid targetType: must be one of item, project, goal');
      }

      const targetReadScope: PatScope =
        targetType === 'item'
          ? 'items:read'
          : targetType === 'project'
            ? 'projects:read'
            : 'goals:read';

      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, [
        'notes:write',
        targetReadScope,
      ]);

      const noteId = String(input.noteId ?? '');
      if (!isValidNumericId(noteId)) {
        return toolError('Invalid noteId: must be a numeric ID (1-19 digits)');
      }

      const targetId = String(input.targetId ?? '');
      if (!isValidNumericId(targetId)) {
        return toolError('Invalid targetId: must be a numeric ID (1-19 digits)');
      }

      try {
        const link = await deps.noteLinkService.createLink(ownerId, noteId, {
          targetType: targetType as NoteLinkTargetType,
          targetId,
        });

        return textResult({ link });
      } catch (err: any) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );
}
