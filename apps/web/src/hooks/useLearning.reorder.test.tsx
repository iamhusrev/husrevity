import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useLearningTopics,
  useMoveLearningItem,
  useReorderLearningItems,
  useReorderLearningSubtopics,
  useReorderLearningTopics,
} from "./useLearning";
import { learningService } from "@/services/learning-service";
import type {
  LearningItemResponse,
  LearningSubtopicResponse,
  LearningTopicResponse,
} from "@/types/learning/learning";

vi.mock("@/services/learning-service", () => ({
  learningService: {
    listTopics: vi.fn(),
    reorderTopics: vi.fn(),
    reorderSubtopics: vi.fn(),
    reorderItems: vi.fn(),
    reorderSubtopicItems: vi.fn(),
    moveItem: vi.fn(),
  },
}));

const ok = <T,>(data: T) => ({ success: true, code: 200, message: "ok", data });
const KEY = ["learning", "topics"];

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
  over: Partial<LearningTopicResponse> = {},
): LearningTopicResponse => ({
  id,
  title: id,
  description: null,
  position,
  year: 2026,
  items: [],
  subtopics: [],
  itemCount: 0,
  completedCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("optimistic learning reorder hooks", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const cached = () => queryClient.getQueryData<{ data: LearningTopicResponse[] }>(KEY)?.data ?? [];
  const seed = (topics: LearningTopicResponse[]) => queryClient.setQueryData(KEY, ok(topics));

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: Infinity } },
    });
    vi.clearAllMocks();
    vi.mocked(learningService.listTopics).mockResolvedValue(ok([]));
  });

  describe("useReorderLearningTopics", () => {
    it("shows the new order before the request resolves and sends { year, orderedIds }", async () => {
      seed([topic("a", 0), topic("b", 1), topic("c", 2)]);
      let release!: () => void;
      vi.mocked(learningService.reorderTopics).mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve(ok(undefined));
        }),
      );
      const { result } = renderHook(() => useReorderLearningTopics(), { wrapper });

      act(() => result.current.mutate({ year: 2026, orderedIds: ["c", "a", "b"] }));

      await waitFor(() => expect(cached().map((t) => t.id)).toEqual(["c", "a", "b"]));
      expect(learningService.reorderTopics).toHaveBeenCalledWith({
        year: 2026,
        orderedIds: ["c", "a", "b"],
      });
      release();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it("restores the previous order and calls onError when the request fails", async () => {
      seed([topic("a", 0), topic("b", 1)]);
      const failure = new Error("boom");
      vi.mocked(learningService.reorderTopics).mockRejectedValue(failure);
      const onError = vi.fn();
      const { result } = renderHook(() => useReorderLearningTopics({ onError }), { wrapper });

      act(() => result.current.mutate({ orderedIds: ["b", "a"] }));

      await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
      expect(cached().map((t) => t.id)).toEqual(["a", "b"]);
      expect(cached().map((t) => t.position)).toEqual([0, 1]);
    });

    it("refetches the topic list once the request settles", async () => {
      vi.mocked(learningService.listTopics).mockResolvedValue(ok([topic("a", 0), topic("b", 1)]));
      vi.mocked(learningService.reorderTopics).mockResolvedValue(ok(undefined));
      // A mounted observer is what makes invalidation refetch.
      const list = renderHook(() => useLearningTopics(), { wrapper });
      await waitFor(() => expect(list.result.current.data).toHaveLength(2));
      const mutation = renderHook(() => useReorderLearningTopics(), { wrapper });
      vi.mocked(learningService.listTopics).mockClear();

      act(() => mutation.result.current.mutate({ orderedIds: ["b", "a"] }));

      await waitFor(() => expect(learningService.listTopics).toHaveBeenCalledTimes(1));
    });

    it("does not touch a cache that was never loaded", async () => {
      vi.mocked(learningService.reorderTopics).mockResolvedValue(ok(undefined));
      const { result } = renderHook(() => useReorderLearningTopics(), { wrapper });

      act(() => result.current.mutate({ orderedIds: ["a"] }));
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(queryClient.getQueryData(KEY)).toBeUndefined();
    });
  });

  describe("overlapping reorders", () => {
    const deferred = () => {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const promise = new Promise((res, rej) => {
        resolve = () => res(ok(undefined));
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    it("does not roll back or refetch over a newer reorder that is still in flight", async () => {
      const original = [topic("a", 0), topic("b", 1), topic("c", 2)];
      seed(original);
      // The mounted list observer fetches once on mount; it must see the same list.
      vi.mocked(learningService.listTopics).mockResolvedValue(ok(original));
      const first = deferred();
      const second = deferred();
      vi.mocked(learningService.reorderTopics)
        .mockReturnValueOnce(first.promise as never)
        .mockReturnValueOnce(second.promise as never);
      const onError = vi.fn();
      const list = renderHook(() => useLearningTopics(), { wrapper });
      const { result } = renderHook(() => useReorderLearningTopics({ onError }), { wrapper });
      await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
      vi.mocked(learningService.listTopics).mockClear();

      act(() => result.current.mutate({ orderedIds: ["b", "a", "c"] }));
      await waitFor(() => expect(cached().map((t) => t.id)).toEqual(["b", "a", "c"]));
      act(() => result.current.mutate({ orderedIds: ["c", "b", "a"] }));
      await waitFor(() => expect(cached().map((t) => t.id)).toEqual(["c", "b", "a"]));

      await act(async () => first.reject(new Error("first failed")));
      await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

      // The second reorder is still pending: its optimistic order stays and nothing is refetched.
      expect(cached().map((t) => t.id)).toEqual(["c", "b", "a"]);
      expect(learningService.listTopics).not.toHaveBeenCalled();

      vi.mocked(learningService.listTopics).mockResolvedValue(
        ok([topic("c", 0), topic("a", 1), topic("b", 2)]),
      );
      await act(async () => second.resolve());

      // Once the last one settles, the server's list is the truth.
      await waitFor(() => expect(cached().map((t) => t.id)).toEqual(["c", "a", "b"]));
      expect(learningService.listTopics).toHaveBeenCalledTimes(1);
    });
  });

  describe("useReorderLearningSubtopics", () => {
    it("reorders the subtopics in the cache and sends only the ids", async () => {
      seed([topic("t1", 0, { subtopics: [subtopic("s1", 0), subtopic("s2", 1)] })]);
      vi.mocked(learningService.reorderSubtopics).mockResolvedValue(ok(undefined));
      const { result } = renderHook(() => useReorderLearningSubtopics(), { wrapper });

      act(() => result.current.mutate({ topicId: "t1", orderedIds: ["s2", "s1"] }));

      await waitFor(() => expect(cached()[0].subtopics.map((s) => s.id)).toEqual(["s2", "s1"]));
      expect(learningService.reorderSubtopics).toHaveBeenCalledWith("t1", ["s2", "s1"]);
    });
  });

  describe("useReorderLearningItems", () => {
    it("uses the topic endpoint for direct items", async () => {
      seed([topic("t1", 0, { items: [item("i1", 0), item("i2", 1)] })]);
      vi.mocked(learningService.reorderItems).mockResolvedValue(ok(undefined));
      const { result } = renderHook(() => useReorderLearningItems(), { wrapper });

      act(() => result.current.mutate({ topicId: "t1", orderedIds: ["i2", "i1"] }));

      await waitFor(() => expect(cached()[0].items.map((i) => i.id)).toEqual(["i2", "i1"]));
      expect(learningService.reorderItems).toHaveBeenCalledWith("t1", ["i2", "i1"]);
      expect(learningService.reorderSubtopicItems).not.toHaveBeenCalled();
    });

    it("uses the subtopic endpoint when a subtopicId is given", async () => {
      seed([
        topic("t1", 0, {
          subtopics: [subtopic("s1", 0, [item("i1", 0, "s1"), item("i2", 1, "s1")])],
        }),
      ]);
      vi.mocked(learningService.reorderSubtopicItems).mockResolvedValue(ok(undefined));
      const { result } = renderHook(() => useReorderLearningItems(), { wrapper });

      act(() =>
        result.current.mutate({ topicId: "t1", subtopicId: "s1", orderedIds: ["i2", "i1"] }),
      );

      await waitFor(() =>
        expect(cached()[0].subtopics[0].items.map((i) => i.id)).toEqual(["i2", "i1"]),
      );
      expect(learningService.reorderSubtopicItems).toHaveBeenCalledWith("s1", ["i2", "i1"]);
      expect(learningService.reorderItems).not.toHaveBeenCalled();
    });
  });

  describe("useMoveLearningItem", () => {
    const tree = () => [
      topic("t1", 0, {
        subtopics: [subtopic("s1", 0, [item("i1", 0, "s1")]), subtopic("s2", 1)],
      }),
    ];

    it("moves the item in the cache at once and posts { subtopicId, index }", async () => {
      seed(tree());
      vi.mocked(learningService.moveItem).mockResolvedValue(ok(undefined));
      const { result } = renderHook(() => useMoveLearningItem(), { wrapper });

      act(() => result.current.mutate({ itemId: "i1", subtopicId: "s2", index: 0 }));

      await waitFor(() => expect(cached()[0].subtopics[1].items.map((i) => i.id)).toEqual(["i1"]));
      expect(cached()[0].subtopics[1].items[0].subtopicId).toBe("s2");
      expect(cached()[0].subtopics[0].items).toEqual([]);
      expect(learningService.moveItem).toHaveBeenCalledWith("i1", { subtopicId: "s2", index: 0 });
    });

    it("puts the item back and calls onError when the move fails", async () => {
      seed(tree());
      const failure = new Error("nope");
      vi.mocked(learningService.moveItem).mockRejectedValue(failure);
      const onError = vi.fn();
      const { result } = renderHook(() => useMoveLearningItem({ onError }), { wrapper });

      act(() => result.current.mutate({ itemId: "i1", subtopicId: "s2", index: 0 }));

      await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
      expect(cached()[0].subtopics[0].items.map((i) => i.id)).toEqual(["i1"]);
      expect(cached()[0].subtopics[1].items).toEqual([]);
    });
  });
});
