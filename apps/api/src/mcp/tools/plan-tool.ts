import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { DateTime } from 'luxon';
import { ItemService } from '../../item/item.service';
import {
  ChangeSetService,
  extractItemSnapshot,
  isValidNumericId,
} from '../../change-set/change-set.service';
import { ApiException } from '../../common/api.exception';
import { PatScope } from '../../auth/personal-access-token.entity';
import { getOwnerAndCheckScope, McpExtra, textResult, toolError } from './mcp-tool-helpers';
import { findOverlaps, OverlapRef, rebuildScheduledInstant } from './plan-overlap';
import {
  ISTANBUL_ZONE,
  MAX_TITLE_LENGTH,
  SECRETS_REFUSED_MESSAGE,
  validateItemFields,
} from './plan-input';
import { looksLikeSecret, looksLikeSecretInFields } from './secret-guard';
import { ProjectAccessService } from '../../project/project-access.service';
import { ItemRequestDto } from '../../item/dto/item-dtos';

export interface PlanToolDeps {
  itemService: ItemService;
  changeSetService: ChangeSetService;
  projectAccessService?: ProjectAccessService;
}

export const MAX_PLAN_OPERATIONS = 50;
export const MAX_PLAN_LABEL_LENGTH = 200;

export interface PlanOperationResult {
  index: number;
  op: 'create' | 'update' | 'complete' | 'delete';
  id?: string;
  status: 'ok';
}

export function isValidCalendarDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const dt = DateTime.fromISO(val, { zone: 'utc' });
  return dt.isValid && dt.toISODate() === val;
}

export function registerPlanTool(server: McpServer, deps: PlanToolDeps) {
  server.registerTool(
    'apply_plan',
    {
      description:
        'Apply a batch of planning operations (create, update, complete, delete items) atomically in ONE transaction ' +
        'and ONE change set. Validates the whole plan before writing. Pass `dryRun: true` to validate and check ' +
        'overlap warnings without writing. Maximum 50 operations. ' +
        'Operations cannot reference items created in the same plan; give each create its own scheduledAt/dueAt and durationMin. ' +
        'Use one operation per item id per plan (to complete several occurrences of one recurring item, send separate plans). ' +
        'Credential-looking text is refused by design and may occasionally block innocent text.',
      inputSchema: {
        label: z
          .string()
          .max(MAX_PLAN_LABEL_LENGTH)
          .describe(`Short label describing the plan (1-${MAX_PLAN_LABEL_LENGTH} characters)`),
        dryRun: z
          .boolean()
          .optional()
          .describe('If true, validate and check warnings without persisting changes'),
        operations: z
          .array(
            z.object({
              op: z.enum(['create', 'update', 'complete', 'delete']),
              id: z
                .string()
                .optional()
                .describe('Target item ID (required for update, complete, delete)'),
              kind: z.enum(['task', 'event', 'log']).optional(),
              title: z.string().optional(),
              notes: z.string().nullable().optional(),
              dueAt: z.string().nullable().optional(),
              scheduledAt: z.string().nullable().optional(),
              durationMin: z.number().nullable().optional(),
              projectId: z.string().nullable().optional(),
              goalId: z.string().nullable().optional(),
              context: z.string().nullable().optional(),
              occursOn: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/, 'occursOn must be in YYYY-MM-DD format')
                .refine(
                  (val) => {
                    const dt = DateTime.fromISO(val, { zone: 'utc' });
                    return dt.isValid && dt.toISODate() === val;
                  },
                  { message: 'occursOn must be a valid calendar date' },
                )
                .optional(),
            }),
          )
          .min(1)
          .max(MAX_PLAN_OPERATIONS)
          .describe(`Array of 1-${MAX_PLAN_OPERATIONS} planning operations`),
      },
    },
    async (params, extra) => {
      const input = (params ?? {}) as Record<string, unknown>;
      const hasGoalId =
        Array.isArray(input.operations) &&
        input.operations.some((op: any) => op && typeof op === 'object' && op.goalId !== undefined);
      const requiredScopes: PatScope[] = ['items:write'];
      if (hasGoalId) {
        requiredScopes.push('goals:write');
      }
      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, requiredScopes);

      const rawLabel = input.label;
      if (typeof rawLabel === 'string' && looksLikeSecret(rawLabel)) {
        return toolError(SECRETS_REFUSED_MESSAGE);
      }
      if (typeof rawLabel !== 'string' || !rawLabel.trim()) {
        return toolError('label is required and must not be blank');
      }
      const label = rawLabel.trim().slice(0, MAX_PLAN_LABEL_LENGTH);

      const rawOps = input.operations;
      if (Array.isArray(rawOps)) {
        for (const opObj of rawOps) {
          if (opObj && typeof opObj === 'object') {
            const opRec = opObj as Record<string, unknown>;
            if (looksLikeSecretInFields(opRec.title, opRec.notes, opRec.context, opRec.text)) {
              return toolError(SECRETS_REFUSED_MESSAGE);
            }
          }
        }
      }

      if (!Array.isArray(rawOps) || rawOps.length < 1 || rawOps.length > MAX_PLAN_OPERATIONS) {
        return toolError(`operations must be an array of 1 to ${MAX_PLAN_OPERATIONS} operations`);
      }

      const dryRun = Boolean(input.dryRun);

      // 1. Validate every operation before writing anything
      const validatedOps: Array<{
        index: number;
        op: 'create' | 'update' | 'complete' | 'delete';
        id?: string;
        fields?: Partial<ItemRequestDto>;
        occursOn?: string;
        existingItem?: any;
      }> = [];

      const seenTargetIds = new Set<string>();

      for (let i = 0; i < rawOps.length; i++) {
        const opObj = rawOps[i];
        if (!opObj || typeof opObj !== 'object') {
          return toolError(`Operation #${i}: must be an object`);
        }

        const opType = (opObj as Record<string, unknown>).op;
        if (!['create', 'update', 'complete', 'delete'].includes(opType as string)) {
          return toolError(`Operation #${i}: unknown operation '${String(opType)}'`);
        }

        const rawOccursOn = (opObj as Record<string, unknown>).occursOn;
        if (rawOccursOn !== undefined) {
          const idVal = (opObj as Record<string, unknown>).id;
          const idSuffix = isValidNumericId(idVal) ? ` #${idVal}` : '';
          if (typeof rawOccursOn !== 'string' || !isValidCalendarDate(rawOccursOn.trim())) {
            return toolError(
              `Operation #${i} (${opType}${idSuffix}): occursOn must be a valid calendar date in YYYY-MM-DD format`,
            );
          }
        }

        if (opType === 'create') {
          const { errors, fields } = validateItemFields(opObj as any, {
            requireTitle: true,
            allowNull: true,
            allowKind: true,
          });
          if (errors.length) {
            return toolError(`Operation #${i} (create): ${errors.join('; ')}`);
          }
          if (fields.projectId && deps.projectAccessService) {
            try {
              await deps.projectAccessService.requireAccess(ownerId, fields.projectId, 'EDITOR');
            } catch (err: any) {
              if (err instanceof ApiException) {
                return toolError(`Operation #${i} (create): ${err.message}`);
              }
              throw err;
            }
          }
          validatedOps.push({
            index: i,
            op: 'create',
            fields: { ...fields, source: 'mcp' },
          });
        } else if (opType === 'update') {
          const id = (opObj as Record<string, unknown>).id;
          if (!isValidNumericId(id)) {
            return toolError(`Operation #${i} (update): id must be a numeric ID (1-19 digits)`);
          }
          const strId = String(id);
          if (seenTargetIds.has(strId)) {
            return toolError(
              `Operation #${i} (update #${strId}): duplicate target id '${strId}' appears in multiple operations`,
            );
          }
          seenTargetIds.add(strId);

          const { errors, fields } = validateItemFields(opObj as any, {
            requireTitle: false,
            allowNull: true,
            allowKind: false,
          });
          if (errors.length) {
            return toolError(`Operation #${i} (update): ${errors.join('; ')}`);
          }
          try {
            const existingItem = await deps.itemService.get(ownerId, id);
            if (existingItem.projectId && deps.projectAccessService) {
              await deps.projectAccessService.requireAccess(
                ownerId,
                existingItem.projectId,
                'EDITOR',
              );
            }
            if (fields.projectId && deps.projectAccessService) {
              await deps.projectAccessService.requireAccess(ownerId, fields.projectId, 'EDITOR');
            }
            validatedOps.push({
              index: i,
              op: 'update',
              id,
              fields,
              existingItem,
            });
          } catch (err: any) {
            if (err instanceof ApiException) {
              return toolError(`Operation #${i} (update #${id}): ${err.message}`);
            }
            throw err;
          }
        } else if (opType === 'complete') {
          const id = (opObj as Record<string, unknown>).id;
          if (!isValidNumericId(id)) {
            return toolError(`Operation #${i} (complete): id must be a numeric ID (1-19 digits)`);
          }
          const strId = String(id);
          if (seenTargetIds.has(strId)) {
            return toolError(
              `Operation #${i} (complete #${strId}): duplicate target id '${strId}' appears in multiple operations`,
            );
          }
          seenTargetIds.add(strId);

          const rawOccursOn = (opObj as Record<string, unknown>).occursOn;
          const occursOn = typeof rawOccursOn === 'string' ? rawOccursOn.trim() : undefined;
          try {
            const existingItem = await deps.itemService.get(ownerId, id);
            if (existingItem.projectId && deps.projectAccessService) {
              await deps.projectAccessService.requireAccess(
                ownerId,
                existingItem.projectId,
                'EDITOR',
              );
            }
            if (existingItem.rrule && !occursOn) {
              return toolError(
                `Operation #${i} (complete #${id}): occursOn is required to complete a recurring item`,
              );
            }
            validatedOps.push({
              index: i,
              op: 'complete',
              id,
              occursOn,
              existingItem,
            });
          } catch (err: any) {
            if (err instanceof ApiException) {
              return toolError(`Operation #${i} (complete #${id}): ${err.message}`);
            }
            throw err;
          }
        } else if (opType === 'delete') {
          const id = (opObj as Record<string, unknown>).id;
          if (!isValidNumericId(id)) {
            return toolError(`Operation #${i} (delete): id must be a numeric ID (1-19 digits)`);
          }
          const strId = String(id);
          if (seenTargetIds.has(strId)) {
            return toolError(
              `Operation #${i} (delete #${strId}): duplicate target id '${strId}' appears in multiple operations`,
            );
          }
          seenTargetIds.add(strId);

          try {
            const existingItem = await deps.itemService.get(ownerId, id);
            if (existingItem.projectId && deps.projectAccessService) {
              await deps.projectAccessService.requireAccess(
                ownerId,
                existingItem.projectId,
                'EDITOR',
              );
            }
            validatedOps.push({
              index: i,
              op: 'delete',
              id,
              existingItem,
            });
          } catch (err: any) {
            if (err instanceof ApiException) {
              return toolError(`Operation #${i} (delete #${id}): ${err.message}`);
            }
            throw err;
          }
        }
      }

      // 2. Overlap detection
      const plannedRefs: OverlapRef[] = [];
      const touchedDays = new Set<string>();

      for (const op of validatedOps) {
        let scheduledAt: string | null = null;
        let durationMin: number | null = null;
        let title: string = '';

        if (op.op === 'create') {
          scheduledAt = op.fields?.scheduledAt ?? null;
          durationMin = op.fields?.durationMin ?? null;
          title = op.fields?.title ?? 'Planned Task';
        } else if (op.op === 'update') {
          scheduledAt =
            op.fields?.scheduledAt !== undefined
              ? op.fields.scheduledAt
              : (op.existingItem?.scheduledAt ?? null);
          durationMin =
            op.fields?.durationMin !== undefined
              ? op.fields.durationMin
              : (op.existingItem?.durationMin ?? null);
          title = op.fields?.title ?? op.existingItem?.title ?? 'Updated Task';
        }

        if (scheduledAt) {
          plannedRefs.push({
            source: 'plan',
            operationIndex: op.index,
            title,
            scheduledAt,
            durationMin,
          });
          const day = DateTime.fromISO(scheduledAt, { setZone: true })
            .setZone(ISTANBUL_ZONE)
            .toISODate();
          if (day) touchedDays.add(day);
        }
      }

      // Query existing items for the touched days
      const existingRefs: OverlapRef[] = [];
      if (touchedDays.size > 0) {
        const sortedDays = Array.from(touchedDays).sort();
        const minDay = DateTime.fromISO(sortedDays[0], { zone: ISTANBUL_ZONE }).startOf('day');
        const maxDay = DateTime.fromISO(sortedDays[sortedDays.length - 1], {
          zone: ISTANBUL_ZONE,
        }).endOf('day');

        const existingItems = await deps.itemService.list(ownerId, {
          from: minDay.toUTC().toISO()!,
          to: maxDay.toUTC().toISO()!,
          status: 'open',
        });

        const modifiedIds = new Set(validatedOps.filter((o) => o.id).map((o) => String(o.id)));

        for (const item of existingItems) {
          if (modifiedIds.has(String(item.id))) continue;
          if (item.status && item.status !== 'open') continue;
          if (!item.scheduledAt) continue;
          const scheduledAt = rebuildScheduledInstant(item.scheduledAt, item.occursOn);
          existingRefs.push({
            source: 'existing',
            itemId: item.id,
            title: item.title,
            scheduledAt,
            durationMin: item.durationMin ?? null,
            occursOn: item.occursOn,
          });
        }
      }

      const warnings = findOverlaps(plannedRefs, existingRefs);

      // 3. Dry-run mode: return validated results without writing
      if (dryRun) {
        const results: PlanOperationResult[] = validatedOps.map((op) => ({
          index: op.index,
          op: op.op,
          id: op.id,
          status: 'ok',
        }));

        return textResult({
          operations: results,
          changeSetId: null,
          warnings,
        });
      }

      // 4. Execute all operations in ONE transaction and ONE change set
      try {
        const { result: results, changeSetId } = await deps.changeSetService.runWithChangeSet(
          ownerId,
          { source: 'mcp', label },
          async (csId, manager) => {
            const opResults: PlanOperationResult[] = [];

            for (const op of validatedOps) {
              if (op.op === 'create') {
                const item = await deps.itemService.create(
                  ownerId,
                  op.fields as ItemRequestDto,
                  manager,
                );
                await deps.changeSetService.recordEntry(
                  csId,
                  ownerId,
                  {
                    targetType: 'item',
                    targetId: item.id,
                    op: 'create',
                    before: null,
                    after: extractItemSnapshot(item),
                  },
                  manager,
                );
                opResults.push({
                  index: op.index,
                  op: 'create',
                  id: item.id,
                  status: 'ok',
                });
              } else if (op.op === 'update') {
                const before = await deps.itemService.get(ownerId, op.id!, manager);
                const item = await deps.itemService.update(
                  ownerId,
                  op.id!,
                  op.fields!,
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
                    before: extractItemSnapshot(before),
                    after: extractItemSnapshot(item),
                  },
                  manager,
                );
                opResults.push({
                  index: op.index,
                  op: 'update',
                  id: item.id,
                  status: 'ok',
                });
              } else if (op.op === 'complete') {
                const before = await deps.itemService.get(ownerId, op.id!, manager);
                const isRecurring = Boolean(before.rrule && before.rrule.trim());

                if (isRecurring && op.occursOn) {
                  const existingOcc = await deps.itemService.findOccurrence(
                    ownerId,
                    op.id!,
                    op.occursOn,
                    manager,
                  );
                  const { item, occurrenceId } = await deps.itemService.completeWithDetails(
                    ownerId,
                    op.id!,
                    { occursOn: op.occursOn },
                    manager,
                  );

                  if (existingOcc) {
                    await deps.changeSetService.recordEntry(
                      csId,
                      ownerId,
                      {
                        targetType: 'item_occurrence',
                        targetId: existingOcc.id,
                        op: 'update',
                        before: {
                          status: existingOcc.status,
                          completedAt: existingOcc.completedAt
                            ? existingOcc.completedAt.toISOString()
                            : null,
                        },
                        after: {
                          status: 'done',
                          completedAt: new Date().toISOString(),
                        },
                      },
                      manager,
                    );
                  } else if (occurrenceId) {
                    await deps.changeSetService.recordEntry(
                      csId,
                      ownerId,
                      {
                        targetType: 'item_occurrence',
                        targetId: occurrenceId,
                        op: 'create',
                        before: null,
                        after: {
                          status: 'done',
                          occursOn: op.occursOn,
                          itemId: op.id!,
                          occurrenceId,
                        },
                      },
                      manager,
                    );
                  }
                  opResults.push({
                    index: op.index,
                    op: 'complete',
                    id: item.id,
                    status: 'ok',
                  });
                } else {
                  const { item } = await deps.itemService.completeWithDetails(
                    ownerId,
                    op.id!,
                    op.occursOn ? { occursOn: op.occursOn } : {},
                    manager,
                  );
                  await deps.changeSetService.recordEntry(
                    csId,
                    ownerId,
                    {
                      targetType: 'item',
                      targetId: op.id!,
                      op: 'complete',
                      before: extractItemSnapshot(before),
                      after: extractItemSnapshot(item),
                    },
                    manager,
                  );
                  opResults.push({
                    index: op.index,
                    op: 'complete',
                    id: item.id,
                    status: 'ok',
                  });
                }
              } else if (op.op === 'delete') {
                const before = await deps.itemService.get(ownerId, op.id!, manager);
                await deps.itemService.delete(ownerId, op.id!, manager);
                await deps.changeSetService.recordEntry(
                  csId,
                  ownerId,
                  {
                    targetType: 'item',
                    targetId: op.id!,
                    op: 'delete',
                    before: extractItemSnapshot(before),
                    after: null,
                  },
                  manager,
                );
                opResults.push({
                  index: op.index,
                  op: 'delete',
                  id: op.id,
                  status: 'ok',
                });
              }
            }

            return opResults;
          },
        );

        return textResult({
          operations: results,
          changeSetId,
          warnings,
        });
      } catch (err: any) {
        if (err instanceof ApiException) {
          return toolError(err.message);
        }
        throw err;
      }
    },
  );
}
