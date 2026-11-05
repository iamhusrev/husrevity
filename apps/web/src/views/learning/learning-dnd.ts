import { closestCenter, CollisionDetection, pointerWithin } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { LearningTopicResponse } from "@/types/learning/learning";

/**
 * Topic, subtopic and item ids come from separate sequences and can be numerically equal, while
 * dnd-kit needs unique ids inside one DndContext. Every draggable and droppable therefore uses a
 * prefixed id; these helpers are the only place that knows the format.
 */
export type DndKind = "topic" | "subtopic" | "item" | "direct" | "sub";

const make = (kind: DndKind) => (id: string) => `${kind}:${id}`;
export const topicDndId = make("topic");
export const subtopicDndId = make("subtopic");
export const itemDndId = make("item");
/** Drop zone of a topic's direct item list. */
export const directContainerId = make("direct");
/** Drop zone of a subtopic's item list. */
export const subtopicContainerId = make("sub");

export function parseDndId(dndId: string): { kind: DndKind; id: string } | null {
  const match = /^(topic|subtopic|item|direct|sub):(.+)$/.exec(dndId);
  return match ? { kind: match[1] as DndKind, id: match[2] } : null;
}

/** New topic order after `activeId` is dropped on `overId`, or null when nothing changes. */
export function resolveTopicDrop(
  orderedIds: string[],
  activeId: string,
  overId: string,
): string[] | null {
  const active = parseDndId(activeId);
  const over = parseDndId(overId);
  if (active?.kind !== "topic" || over?.kind !== "topic" || active.id === over.id) return null;
  const from = orderedIds.indexOf(active.id);
  const to = orderedIds.indexOf(over.id);
  return from < 0 || to < 0 ? null : arrayMove(orderedIds, from, to);
}

export type BodyDrop =
  | { type: "subtopics"; orderedIds: string[] }
  | { type: "items"; subtopicId: string | null; orderedIds: string[] }
  | { type: "move"; itemId: string; subtopicId: string | null; index: number };

/**
 * Maps a drop inside one topic card to the request it needs: subtopic reorder, item reorder
 * within one list, or an item move into another list. Null means nothing to do.
 */
export function resolveBodyDrop(
  topic: LearningTopicResponse,
  activeId: string,
  overId: string,
): BodyDrop | null {
  const active = parseDndId(activeId);
  const over = parseDndId(overId);
  if (!active || !over) return null;

  if (active.kind === "subtopic") {
    if (over.kind !== "subtopic" || over.id === active.id) return null;
    const ids = topic.subtopics.map((s) => s.id);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    return from < 0 || to < 0 ? null : { type: "subtopics", orderedIds: arrayMove(ids, from, to) };
  }
  if (active.kind !== "item") return null;

  // null = the topic's direct list.
  const listOf = (itemId: string): { subtopicId: string | null; ids: string[] } | null => {
    if (topic.items.some((i) => i.id === itemId))
      return { subtopicId: null, ids: topic.items.map((i) => i.id) };
    const owner = topic.subtopics.find((s) => s.items.some((i) => i.id === itemId));
    return owner ? { subtopicId: owner.id, ids: owner.items.map((i) => i.id) } : null;
  };
  const source = listOf(active.id);
  if (!source) return null;

  let target: { subtopicId: string | null; ids: string[]; index: number } | null = null;
  if (over.kind === "item") {
    const list = listOf(over.id);
    if (list) target = { ...list, index: list.ids.indexOf(over.id) };
  } else if (over.kind === "direct") {
    target = { subtopicId: null, ids: topic.items.map((i) => i.id), index: topic.items.length };
  } else if (over.kind === "sub" || over.kind === "subtopic") {
    const sub = topic.subtopics.find((s) => s.id === over.id);
    if (sub)
      target = { subtopicId: sub.id, ids: sub.items.map((i) => i.id), index: sub.items.length };
  }
  if (!target) return null;

  if (target.subtopicId === source.subtopicId) {
    const from = source.ids.indexOf(active.id);
    // Dropped on its own list (not on a sibling) or on itself: nothing moves.
    if (over.kind !== "item" || target.index === from) return null;
    return {
      type: "items",
      subtopicId: source.subtopicId,
      orderedIds: arrayMove(source.ids, from, target.index),
    };
  }
  return { type: "move", itemId: active.id, subtopicId: target.subtopicId, index: target.index };
}

/**
 * Collision detection for a topic card body. Subtopics only target subtopics; items only target
 * item rows and item lists. With a pointer, the row under it wins over the list or section that
 * merely contains it (a tall list's centre would otherwise beat the nearest row), and a list only
 * wins when the pointer is over no row, e.g. an empty list. Without a pointer (keyboard) it falls
 * back to the closest centre.
 */
export const bodyCollision: CollisionDetection = (args) => {
  const activeKind = parseDndId(String(args.active.id))?.kind;
  const wanted = (kind?: DndKind) =>
    activeKind === "subtopic"
      ? kind === "subtopic"
      : kind === "item" || kind === "direct" || kind === "sub";
  const scoped = {
    ...args,
    droppableContainers: args.droppableContainers.filter((c) =>
      wanted(parseDndId(String(c.id))?.kind),
    ),
  };
  const hits = pointerWithin(scoped);
  if (hits.length > 0) {
    const rows = hits.filter((hit) => parseDndId(String(hit.id))?.kind === "item");
    return rows.length > 0 ? rows : hits;
  }
  return closestCenter(scoped);
};
