import type { ChangeEntryTargetType } from '../../change-set/entities/change-entry.entity';

/** Minimal shape of the topic tree the learning service returns (see TopicResponseDto). */
interface ItemNode {
  id: string;
  position: number;
  subtopicId: string | null;
  updatedAt?: string;
}
interface SubtopicNode {
  id: string;
  title: string;
  description: string | null;
  position: number;
  updatedAt: string;
  items: ItemNode[];
}
interface TopicNode {
  id: string;
  title: string;
  description: string | null;
  position: number;
  updatedAt: string;
  items: ItemNode[];
  subtopics: SubtopicNode[];
}

interface Snap {
  targetType: ChangeEntryTargetType;
  fields: Record<string, unknown>;
  updatedAt?: string;
}

export interface LearningChangeEntry {
  targetType: ChangeEntryTargetType;
  targetId: string;
  op: 'update';
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** Flattens a topic tree into `type:id` → undoable fields. Insertion order follows the tree. */
export function flattenLearning(topics: TopicNode[]): Map<string, Snap & { id: string }> {
  const out = new Map<string, Snap & { id: string }>();
  const put = (type: ChangeEntryTargetType, id: string, snap: Snap) =>
    out.set(`${type}:${id}`, { ...snap, id });
  const putItem = (item: ItemNode) =>
    put('learning_item', item.id, {
      targetType: 'learning_item',
      fields: { position: item.position, subtopicId: item.subtopicId ?? null },
      updatedAt: item.updatedAt,
    });

  for (const topic of topics) {
    put('learning_topic', topic.id, {
      targetType: 'learning_topic',
      fields: { title: topic.title, description: topic.description, position: topic.position },
      updatedAt: topic.updatedAt,
    });
    topic.items.forEach(putItem);
    for (const sub of topic.subtopics) {
      put('learning_subtopic', sub.id, {
        targetType: 'learning_subtopic',
        fields: { title: sub.title, description: sub.description, position: sub.position },
        updatedAt: sub.updatedAt,
      });
      sub.items.forEach(putItem);
    }
  }
  return out;
}

/**
 * One `update` entry per row whose undoable fields differ. `before` holds only the changed
 * fields (that is all an undo writes back); `after` carries the new updatedAt when the row
 * has one, which the undo uses to detect later edits.
 */
export function diffLearning(
  before: Map<string, Snap & { id: string }>,
  after: Map<string, Snap & { id: string }>,
): LearningChangeEntry[] {
  const entries: LearningChangeEntry[] = [];
  for (const [key, was] of before) {
    const now = after.get(key);
    if (!now) continue;
    const changed = Object.keys(now.fields).filter((f) => was.fields[f] !== now.fields[f]);
    if (!changed.length) continue;
    const entryBefore: Record<string, unknown> = {};
    const entryAfter: Record<string, unknown> = {};
    for (const field of changed) {
      entryBefore[field] = was.fields[field];
      entryAfter[field] = now.fields[field];
    }
    if (now.updatedAt) entryAfter.updatedAt = now.updatedAt;
    entries.push({
      targetType: now.targetType,
      targetId: now.id,
      op: 'update',
      before: entryBefore,
      after: entryAfter,
    });
  }
  return entries;
}
