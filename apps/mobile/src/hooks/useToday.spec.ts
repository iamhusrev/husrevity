import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

const memoryStore = new Map<string, string>();

mock.module("react-native", () => ({}));

mock.module("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memoryStore.get(key) ?? null,
  setItemAsync: async (key: string, val: string) => {
    memoryStore.set(key, val);
  },
  deleteItemAsync: async (key: string) => {
    memoryStore.delete(key);
  },
}));

import { fetchToday, TodayResponse } from "./useToday";

describe("useToday / fetchToday", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    memoryStore.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should fetch today data successfully from GET /today", async () => {
    const mockData: TodayResponse = {
      date: "2026-09-28",
      currentBlock: {
        itemId: "item-1",
        title: "Deep Work Session",
        scheduledAt: "2026-09-28T10:00:00.000Z",
        durationMin: 60,
      },
      timeline: [
        {
          itemId: "item-1",
          title: "Deep Work Session",
          kind: "task",
          scheduledAt: "2026-09-28T10:00:00.000Z",
          durationMin: 60,
        },
      ],
      dueToday: [
        {
          itemId: "item-2",
          title: "Review pull requests",
          dueAt: "2026-09-28T23:59:59.000Z",
          status: "open",
        },
      ],
      suggestion: "Focus on your highest priority task first.",
    };

    let capturedUrl = "";

    global.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          message: "OK",
          code: 200,
          data: mockData,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    const data = await fetchToday();

    expect(capturedUrl).toBe("http://localhost:4090/api/today");
    expect(data.date).toBe("2026-09-28");
    expect(data.currentBlock?.title).toBe("Deep Work Session");
    expect(data.timeline.length).toBe(1);
    expect(data.dueToday.length).toBe(1);
    expect(data.suggestion).toBe("Focus on your highest priority task first.");
  });
});
