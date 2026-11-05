import {
  LearningItemResponse,
  LearningSubtopicResponse,
  LearningTopicResponse,
} from "@/types/learning/learning";
import { topicYear } from "./learning-year";

/**
 * Pure cache transforms behind the optimistic drag and drop updates. Each mirrors what the API
 * does for the same request, so the list looks right immediately and the refetch after the
 * request only confirms it. None of them mutates its input.
 */

export type Edge = "top" | "bottom";

/** Moves `id` to the first or last place; an unknown id leaves the order unchanged. */
export function moveToEdge(ids: string[], id: string, edge: Edge): string[] {
  if (!ids.includes(id)) return ids;
  const rest = ids.filter((x) => x !== id);
  return edge === "top" ? [id, ...rest] : [...rest, id];
}

/** `list` in `orderedIds` order with position = 0..n-1; ids not mentioned keep their order at the end. */
function renumber<T extends { id: string; position: number }>(
  list: T[],
  orderedIds: string[],
): T[] {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const ordered = orderedIds.flatMap((id) => (byId.has(id) ? [byId.get(id) as T] : []));
  const mentioned = new Set(orderedIds);
  const rest = list.filter((entry) => !mentioned.has(entry.id));
  return [...ordered, ...rest].map((entry, position) => ({ ...entry, position }));
}

export interface TopicOrder {
  /** When set, `orderedIds` is that year's topics only and other years keep their slots. */
  year?: number;
  orderedIds: string[];
}

export function applyTopicOrder(
  topics: LearningTopicResponse[],
  order: TopicOrder,
): LearningTopicResponse[] {
  if (order.year === undefined) return renumber(topics, order.orderedIds);
  const inYear = new Set(topics.filter((t) => topicYear(t) === order.year).map((t) => t.id));
  let next = 0;
  const globalOrder = topics.map((t) => (inYear.has(t.id) ? order.orderedIds[next++] : t.id));
  return renumber(topics, globalOrder);
}

export function applySubtopicOrder(
  topics: LearningTopicResponse[],
  topicId: string,
  orderedIds: string[],
): LearningTopicResponse[] {
  return topics.map((t) =>
    t.id === topicId ? { ...t, subtopics: renumber(t.subtopics, orderedIds) } : t,
  );
}

export interface ItemOrder {
  topicId: string;
  /** Omit to order the topic's direct items. */
  subtopicId?: string;
  orderedIds: string[];
}

export function applyItemOrder(
  topics: LearningTopicResponse[],
  order: ItemOrder,
): LearningTopicResponse[] {
  return topics.map((t) => {
    if (t.id !== order.topicId) return t;
    if (!order.subtopicId) return { ...t, items: renumber(t.items, order.orderedIds) };
    return {
      ...t,
      subtopics: t.subtopics.map((s) =>
        s.id === order.subtopicId ? { ...s, items: renumber(s.items, order.orderedIds) } : s,
      ),
    };
  });
}

export interface ItemMove {
  /** Target subtopic, or null for the topic's direct list. */
  subtopicId: string | null;
  index: number;
}

const withCounts = (s: LearningSubtopicResponse): LearningSubtopicResponse => ({
  ...s,
  itemCount: s.items.length,
  completedCount: s.items.filter((i) => i.completedAt !== null).length,
});

export function applyItemMove(
  topics: LearningTopicResponse[],
  itemId: string,
  move: ItemMove,
): LearningTopicResponse[] {
  const owner = topics.find(
    (t) =>
      t.items.some((i) => i.id === itemId) ||
      t.subtopics.some((s) => s.items.some((i) => i.id === itemId)),
  );
  if (!owner) return topics;
  const moved =
    owner.items.find((i) => i.id === itemId) ??
    owner.subtopics.flatMap((s) => s.items).find((i) => i.id === itemId);
  if (!moved) return topics;

  const without = (items: LearningItemResponse[]) => items.filter((i) => i.id !== itemId);
  const place = (items: LearningItemResponse[]): LearningItemResponse[] => {
    const rest = without(items);
    const at = Math.max(0, Math.min(move.index, rest.length));
    const next = [
      ...rest.slice(0, at),
      { ...moved, subtopicId: move.subtopicId },
      ...rest.slice(at),
    ];
    return next.map((item, position) => ({ ...item, position }));
  };
  const closeGap = (items: LearningItemResponse[]) =>
    without(items).map((item, position) => ({ ...item, position }));

  const items = move.subtopicId === null ? place(owner.items) : closeGap(owner.items);
  const subtopics = owner.subtopics.map((s) => {
    if (s.id === move.subtopicId) return withCounts({ ...s, items: place(s.items) });
    if (s.items.some((i) => i.id === itemId)) return withCounts({ ...s, items: closeGap(s.items) });
    return s;
  });
  // The direct list only needs rewriting when the item came from or goes to it.
  const touchedDirect = move.subtopicId === null || owner.items.some((i) => i.id === itemId);
  return topics.map((t) =>
    t.id === owner.id ? { ...t, items: touchedDirect ? items : t.items, subtopics } : t,
  );
}
