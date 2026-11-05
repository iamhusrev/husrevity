import { EntityManager } from 'typeorm';
import { LearningItem } from '../learning/learning-item.entity';
import { LearningSubtopic } from '../learning/learning-subtopic.entity';
import { LearningTopic } from '../learning/learning-topic.entity';
import { ChangeEntry, ChangeEntryTargetType } from './entities/change-entry.entity';

export const LEARNING_TARGET_TYPES: readonly ChangeEntryTargetType[] = [
  'learning_topic',
  'learning_subtopic',
  'learning_item',
];

export function isLearningTarget(type: ChangeEntryTargetType): boolean {
  return LEARNING_TARGET_TYPES.includes(type);
}

export interface UndoContext {
  manager: EntityManager;
  ownerId: string;
  /** Latest `after.updatedAt` (ms) recorded per `targetType:targetId` in the change set. */
  latestAfterMs: Map<string, number>;
  /** updatedAt (ms) of each target before this undo touched it, to ignore our own writes. */
  initialUpdatedMs: Map<string, number | null>;
  /** Filled with the topic of every row an undo brought back, to re-queue review notifications. */
  restoredTopicIds?: Set<string>;
}

/** Columns an undo may write back, per target type. Anything else in `before` is ignored. */
const RESTORABLE_FIELDS: Record<string, readonly string[]> = {
  learning_topic: ['title', 'description', 'year', 'position'],
  learning_subtopic: ['title', 'description', 'position'],
  learning_item: ['text', 'position', 'subtopicId'],
};

interface Row {
  id: string;
  topicId?: string;
  subtopicId?: string | null;
  ownerId?: string;
  deletedAt?: Date | null;
  updatedAt?: Date;
}

/**
 * Undoes one learning change entry. Returns null on success, or the conflict reason
 * (the caller records it and leaves the entry un-undone).
 */
export async function applyLearningUndo(
  ctx: UndoContext,
  entry: ChangeEntry,
): Promise<string | null> {
  const { manager, ownerId } = ctx;
  const entity =
    entry.targetType === 'learning_topic'
      ? LearningTopic
      : entry.targetType === 'learning_subtopic'
        ? LearningSubtopic
        : LearningItem;
  const repo = manager.getRepository<any>(entity);
  const row: Row | null = await repo.findOne({ where: { id: entry.targetId }, withDeleted: true });
  if (!row) return 'Learning target not found';

  // Subtopics and items have no owner column: ownership comes from their topic.
  let parentTopic: Row | null = null;
  if (entry.targetType === 'learning_topic') {
    if (row.ownerId !== ownerId) return 'not_owner';
  } else {
    parentTopic = await manager
      .getRepository(LearningTopic)
      .findOne({ where: { id: row.topicId, ownerId }, withDeleted: true });
    if (!parentTopic) return 'not_owner';
  }

  if (entry.op === 'delete') return restoreDeleted(ctx, entry.targetType, row, parentTopic);
  if (entry.op !== 'update') return 'unsupported op for learning undo';

  const key = `${entry.targetType}:${entry.targetId}`;
  if (!ctx.initialUpdatedMs.has(key))
    ctx.initialUpdatedMs.set(key, row.updatedAt ? new Date(row.updatedAt).getTime() : null);
  const initial = ctx.initialUpdatedMs.get(key);
  const latestAfter = ctx.latestAfterMs.get(key);
  if (latestAfter !== undefined && initial != null && initial > latestAfter)
    return 'Learning target was modified after this change set';

  const before = (entry.before ?? {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  for (const field of RESTORABLE_FIELDS[entry.targetType])
    if (field in before) fields[field] = before[field];
  if (Object.keys(fields).length) await repo.update({ id: entry.targetId }, fields);
  return null;
}

/**
 * Clears deleted_at on the target and on the children that were deleted with it. Like the
 * service restore, it refuses to bring a row back under a parent that is still deleted (it would
 * be live but unreachable). Returns the conflict reason, or null on success.
 */
async function restoreDeleted(
  ctx: UndoContext,
  type: ChangeEntryTargetType,
  row: Row,
  parentTopic: Row | null,
): Promise<string | null> {
  const { manager } = ctx;
  const at = row.deletedAt;
  if (!at) return null; // already restored
  if (parentTopic?.deletedAt) return 'Restore the parent topic first';
  if (type === 'learning_item' && row.subtopicId) {
    const parent: Row | null = await manager
      .getRepository(LearningSubtopic)
      .findOne({ where: { id: row.subtopicId }, withDeleted: true });
    if (parent?.deletedAt) return 'Restore the parent subtopic first';
  }

  if (type === 'learning_topic') {
    await manager
      .getRepository(LearningItem)
      .update({ topicId: row.id, deletedAt: at }, { deletedAt: null });
    await manager
      .getRepository(LearningSubtopic)
      .update({ topicId: row.id, deletedAt: at }, { deletedAt: null });
    await manager.getRepository(LearningTopic).update({ id: row.id }, { deletedAt: null });
  } else if (type === 'learning_subtopic') {
    await manager
      .getRepository(LearningItem)
      .update({ subtopicId: row.id, deletedAt: at }, { deletedAt: null });
    await manager.getRepository(LearningSubtopic).update({ id: row.id }, { deletedAt: null });
  } else {
    await manager.getRepository(LearningItem).update({ id: row.id }, { deletedAt: null });
  }
  ctx.restoredTopicIds?.add(type === 'learning_topic' ? row.id : (row.topicId as string));
  return null;
}

export type { ChangeEntry };
