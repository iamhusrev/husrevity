import { describe, expect, it } from "vitest";
import {
  LearningItemResponse,
  LearningSubtopicResponse,
  LearningTopicResponse,
} from "@/types/learning/learning";
import {
  applyItemMove,
  applyItemOrder,
  applySubtopicOrder,
  applyTopicOrder,
  moveToEdge,
} from "./learning-order";

const item = (
  id: string,
  position: number,
  subtopicId: string | null = null,
): LearningItemResponse => ({
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
  position,
});

const subtopic = (
  id: string,
  position: number,
  items: LearningItemResponse[] = [],
): LearningSubtopicResponse => ({
  id,
  topicId: "t1",
  title: id,
  description: null,
  position,
  items,
  itemCount: items.length,
  completedCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const topic = (
  id: string,
  position: number,
  year: number,
  over: Partial<LearningTopicResponse> = {},
): LearningTopicResponse => ({
  id,
  title: id,
  description: null,
  position,
  year,
  items: [],
  subtopics: [],
  itemCount: 0,
  completedCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe("moveToEdge", () => {
  it("moves an id to the top", () => {
    expect(moveToEdge(["a", "b", "c"], "c", "top")).toEqual(["c", "a", "b"]);
  });

  it("moves an id to the bottom", () => {
    expect(moveToEdge(["a", "b", "c"], "a", "bottom")).toEqual(["b", "c", "a"]);
  });

  it("returns the same order when the id is already at that edge", () => {
    expect(moveToEdge(["a", "b"], "a", "top")).toEqual(["a", "b"]);
  });

  it("ignores an unknown id", () => {
    expect(moveToEdge(["a", "b"], "zzz", "top")).toEqual(["a", "b"]);
  });
});

describe("applyTopicOrder", () => {
  const topics = [
    topic("a", 0, 2024),
    topic("b", 1, 2025),
    topic("c", 2, 2024),
    topic("d", 3, 2025),
  ];

  it("reorders everything when no year is given and renumbers positions", () => {
    const next = applyTopicOrder(topics, { orderedIds: ["d", "c", "b", "a"] });

    expect(ids(next)).toEqual(["d", "c", "b", "a"]);
    expect(next.map((t) => t.position)).toEqual([0, 1, 2, 3]);
  });

  it("with a year, refills only that year's slots and keeps other years where they are", () => {
    const next = applyTopicOrder(topics, { year: 2024, orderedIds: ["c", "a"] });

    expect(ids(next)).toEqual(["c", "b", "a", "d"]);
    expect(next.map((t) => t.position)).toEqual([0, 1, 2, 3]);
  });

  it("does not mutate its input", () => {
    const copy = JSON.stringify(topics);

    applyTopicOrder(topics, { orderedIds: ["d", "c", "b", "a"] });

    expect(JSON.stringify(topics)).toBe(copy);
  });
});

describe("applySubtopicOrder", () => {
  it("reorders the subtopics of one topic only", () => {
    const topics = [
      topic("t1", 0, 2026, { subtopics: [subtopic("s1", 0), subtopic("s2", 1)] }),
      topic("t2", 1, 2026, { subtopics: [subtopic("x1", 0), subtopic("x2", 1)] }),
    ];

    const next = applySubtopicOrder(topics, "t1", ["s2", "s1"]);

    expect(ids(next[0].subtopics)).toEqual(["s2", "s1"]);
    expect(next[0].subtopics.map((s) => s.position)).toEqual([0, 1]);
    expect(ids(next[1].subtopics)).toEqual(["x1", "x2"]);
  });
});

describe("applyItemOrder", () => {
  it("reorders the direct items of a topic when no subtopic is given", () => {
    const topics = [topic("t1", 0, 2026, { items: [item("i1", 0), item("i2", 1)] })];

    const next = applyItemOrder(topics, { topicId: "t1", orderedIds: ["i2", "i1"] });

    expect(ids(next[0].items)).toEqual(["i2", "i1"]);
    expect(next[0].items.map((i) => i.position)).toEqual([0, 1]);
  });

  it("reorders the items of one subtopic", () => {
    const topics = [
      topic("t1", 0, 2026, {
        subtopics: [subtopic("s1", 0, [item("i1", 0, "s1"), item("i2", 1, "s1")])],
      }),
    ];

    const next = applyItemOrder(topics, {
      topicId: "t1",
      subtopicId: "s1",
      orderedIds: ["i2", "i1"],
    });

    expect(ids(next[0].subtopics[0].items)).toEqual(["i2", "i1"]);
  });
});

describe("applyItemMove", () => {
  const build = () => [
    topic("t1", 0, 2026, {
      items: [item("d1", 0)],
      subtopics: [
        subtopic("s1", 0, [item("i1", 0, "s1"), item("i2", 1, "s1")]),
        subtopic("s2", 1, [item("i3", 0, "s2")]),
      ],
      itemCount: 4,
    }),
  ];

  it("moves an item into another subtopic at an index and fixes the subtopicId", () => {
    const next = applyItemMove(build(), "i2", { subtopicId: "s2", index: 0 });

    expect(ids(next[0].subtopics[0].items)).toEqual(["i1"]);
    expect(ids(next[0].subtopics[1].items)).toEqual(["i2", "i3"]);
    expect(next[0].subtopics[1].items.map((i) => i.subtopicId)).toEqual(["s2", "s2"]);
    expect(next[0].subtopics[1].items.map((i) => i.position)).toEqual([0, 1]);
  });

  it("moves an item out of a subtopic to the topic's direct list", () => {
    const next = applyItemMove(build(), "i1", { subtopicId: null, index: 1 });

    expect(ids(next[0].items)).toEqual(["d1", "i1"]);
    expect(next[0].items[1].subtopicId).toBeNull();
    expect(ids(next[0].subtopics[0].items)).toEqual(["i2"]);
  });

  it("reorders inside the same list", () => {
    const next = applyItemMove(build(), "i2", { subtopicId: "s1", index: 0 });

    expect(ids(next[0].subtopics[0].items)).toEqual(["i2", "i1"]);
  });

  it("clamps an index past the end", () => {
    const next = applyItemMove(build(), "i1", { subtopicId: "s2", index: 99 });

    expect(ids(next[0].subtopics[1].items)).toEqual(["i3", "i1"]);
  });

  it("leaves the tree unchanged for an unknown item", () => {
    const topics = build();

    expect(applyItemMove(topics, "nope", { subtopicId: "s2", index: 0 })).toEqual(topics);
  });
});
