import { describe, expect, it } from "vitest";
import {
  LearningItemResponse,
  LearningSubtopicResponse,
  LearningTopicResponse,
} from "@/types/learning/learning";
import { CollisionDescriptor } from "@dnd-kit/core";
import {
  bodyCollision,
  directContainerId,
  itemDndId,
  parseDndId,
  resolveBodyDrop,
  resolveTopicDrop,
  subtopicContainerId,
  subtopicDndId,
  topicDndId,
} from "./learning-dnd";

const item = (id: string, subtopicId: string | null = null): LearningItemResponse => ({
  id,
  topicId: "t1",
  subtopicId,
  text: id,
  url: null,
  notes: null,
  estimatedMinutes: null,
  reviewAt: null,
  notifyMinutesBefore: null,
  completedAt: null,
  position: 0,
});
const subtopic = (id: string, items: LearningItemResponse[]): LearningSubtopicResponse => ({
  id,
  topicId: "t1",
  title: id,
  description: null,
  position: 0,
  items,
  itemCount: items.length,
  completedCount: 0,
  createdAt: "",
  updatedAt: "",
});
const topic: LearningTopicResponse = {
  id: "t1",
  title: "t1",
  description: null,
  position: 0,
  year: 2026,
  items: [item("d1"), item("d2")],
  subtopics: [
    subtopic("s1", [item("i1", "s1"), item("i2", "s1")]),
    subtopic("s2", [item("i3", "s2")]),
    subtopic("s3", []),
  ],
  itemCount: 5,
  completedCount: 0,
  createdAt: "",
  updatedAt: "",
};

describe("dnd ids", () => {
  it("prefixes ids so a topic, subtopic and item with the same number never collide", () => {
    const ids = [topicDndId("3"), subtopicDndId("3"), itemDndId("3")];

    expect(new Set(ids).size).toBe(3);
  });

  it("round-trips through parseDndId", () => {
    expect(parseDndId(topicDndId("7"))).toEqual({ kind: "topic", id: "7" });
    expect(parseDndId(subtopicDndId("7"))).toEqual({ kind: "subtopic", id: "7" });
    expect(parseDndId(itemDndId("7"))).toEqual({ kind: "item", id: "7" });
    expect(parseDndId(directContainerId("7"))).toEqual({ kind: "direct", id: "7" });
    expect(parseDndId(subtopicContainerId("7"))).toEqual({ kind: "sub", id: "7" });
  });

  it("returns null for something that is not one of ours", () => {
    expect(parseDndId("whatever")).toBeNull();
  });
});

describe("resolveTopicDrop", () => {
  const ids = ["a", "b", "c"];

  it("moves the dragged topic to the place of the one it was dropped on", () => {
    expect(resolveTopicDrop(ids, topicDndId("a"), topicDndId("c"))).toEqual(["b", "c", "a"]);
    expect(resolveTopicDrop(ids, topicDndId("c"), topicDndId("a"))).toEqual(["c", "a", "b"]);
  });

  it("does nothing when dropped on itself or on something unknown", () => {
    expect(resolveTopicDrop(ids, topicDndId("a"), topicDndId("a"))).toBeNull();
    expect(resolveTopicDrop(ids, topicDndId("a"), topicDndId("zzz"))).toBeNull();
    expect(resolveTopicDrop(ids, topicDndId("a"), itemDndId("b"))).toBeNull();
  });
});

describe("resolveBodyDrop", () => {
  it("reorders subtopics when a subtopic is dropped on another subtopic", () => {
    expect(resolveBodyDrop(topic, subtopicDndId("s1"), subtopicDndId("s3"))).toEqual({
      type: "subtopics",
      orderedIds: ["s2", "s3", "s1"],
    });
  });

  it("ignores a subtopic dropped on an item", () => {
    expect(resolveBodyDrop(topic, subtopicDndId("s1"), itemDndId("i3"))).toBeNull();
  });

  it("reorders inside a subtopic when an item is dropped on a sibling", () => {
    expect(resolveBodyDrop(topic, itemDndId("i1"), itemDndId("i2"))).toEqual({
      type: "items",
      subtopicId: "s1",
      orderedIds: ["i2", "i1"],
    });
  });

  it("reorders the direct items with a null subtopicId", () => {
    expect(resolveBodyDrop(topic, itemDndId("d1"), itemDndId("d2"))).toEqual({
      type: "items",
      subtopicId: null,
      orderedIds: ["d2", "d1"],
    });
  });

  it("moves an item to the index of the item it is dropped on in another subtopic", () => {
    expect(resolveBodyDrop(topic, itemDndId("i1"), itemDndId("i3"))).toEqual({
      type: "move",
      itemId: "i1",
      subtopicId: "s2",
      index: 0,
    });
  });

  it("appends to an empty subtopic when dropped on its list", () => {
    expect(resolveBodyDrop(topic, itemDndId("i1"), subtopicContainerId("s3"))).toEqual({
      type: "move",
      itemId: "i1",
      subtopicId: "s3",
      index: 0,
    });
  });

  it("appends when dropped on a subtopic section or its list", () => {
    expect(resolveBodyDrop(topic, itemDndId("d1"), subtopicContainerId("s1"))).toEqual({
      type: "move",
      itemId: "d1",
      subtopicId: "s1",
      index: 2,
    });
    expect(resolveBodyDrop(topic, itemDndId("d1"), subtopicDndId("s2"))).toEqual({
      type: "move",
      itemId: "d1",
      subtopicId: "s2",
      index: 1,
    });
  });

  it("moves a subtopic item to the direct list of the topic", () => {
    expect(resolveBodyDrop(topic, itemDndId("i1"), directContainerId("t1"))).toEqual({
      type: "move",
      itemId: "i1",
      subtopicId: null,
      index: 2,
    });
  });

  it("does nothing when dropped on itself, on its own list, or on an unknown target", () => {
    expect(resolveBodyDrop(topic, itemDndId("i1"), itemDndId("i1"))).toBeNull();
    expect(resolveBodyDrop(topic, itemDndId("i1"), subtopicContainerId("s1"))).toBeNull();
    expect(resolveBodyDrop(topic, itemDndId("i1"), itemDndId("nope"))).toBeNull();
    expect(resolveBodyDrop(topic, itemDndId("ghost"), itemDndId("i1"))).toBeNull();
  });
});

describe("bodyCollision", () => {
  const rect = (top: number, bottom: number) => ({
    top,
    bottom,
    left: 0,
    right: 200,
    width: 200,
    height: bottom - top,
  });
  // A subtopic list (0-300) holding two rows (0-100, 100-200); an empty list (400-460) below it.
  const rects = new Map([
    [itemDndId("a"), rect(0, 100)],
    [itemDndId("b"), rect(100, 200)],
    [subtopicContainerId("s1"), rect(0, 300)],
    [subtopicContainerId("empty"), rect(400, 460)],
    [subtopicDndId("s1"), rect(0, 300)],
    [subtopicDndId("s2"), rect(400, 460)],
  ]);
  const run = (activeId: string, pointer: { x: number; y: number } | null) =>
    bodyCollision({
      active: { id: activeId } as never,
      collisionRect: rect(0, 50) as never,
      droppableRects: rects as never,
      droppableContainers: [...rects.keys()].map((id) => ({
        id,
        rect: { current: rects.get(id) },
        disabled: false,
      })) as never,
      pointerCoordinates: pointer,
    }) as CollisionDescriptor[];
  const ids = (hits: CollisionDescriptor[]) => hits.map((h) => String(h.id));

  it("prefers the row under the pointer over the list that merely contains it", () => {
    expect(ids(run(itemDndId("x"), { x: 50, y: 150 }))).toEqual([itemDndId("b")]);
  });

  it("falls back to the list when the pointer is over an empty one", () => {
    expect(ids(run(itemDndId("x"), { x: 50, y: 430 }))).toEqual([subtopicContainerId("empty")]);
  });

  it("only considers subtopics while a subtopic is dragged", () => {
    const hits = ids(run(subtopicDndId("s1"), { x: 50, y: 450 }));

    expect(hits).toEqual([subtopicDndId("s2")]);
  });

  it("never offers subtopic sections as targets for an item", () => {
    const hits = ids(run(itemDndId("x"), { x: 50, y: 450 }));

    expect(hits.some((id) => id.startsWith("subtopic:"))).toBe(false);
  });

  it("still finds a target without a pointer (keyboard drag)", () => {
    expect(run(itemDndId("x"), null).length).toBeGreaterThan(0);
  });
});
