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

import { parseQuickAdd, createItem, ParsedDraft, ItemResponse } from "./useQuickAdd";

describe("useQuickAdd API functions", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    memoryStore.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should call POST /api/items/parse-quick-add with input text and return ParsedDraft", async () => {
    const mockDraft: ParsedDraft = {
      title: "HGS kontrol",
      scheduledAt: "2026-09-29T09:00:00.000Z",
      context: "alican",
    };

    let capturedUrl = "";
    let capturedBody: any = null;

    global.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: "OK",
          code: 200,
          data: mockDraft,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    const result = await parseQuickAdd("yarın 9da HGS kontrol #alican");

    expect(capturedUrl).toBe("http://localhost:4090/api/items/parse-quick-add");
    expect(capturedBody).toEqual({ text: "yarın 9da HGS kontrol #alican" });
    expect(result.title).toBe("HGS kontrol");
    expect(result.scheduledAt).toBe("2026-09-29T09:00:00.000Z");
    expect(result.context).toBe("alican");
  });

  it("should call POST /api/items to create item with source ios", async () => {
    const mockCreatedItem: ItemResponse = {
      id: "item-100",
      kind: "task",
      title: "HGS kontrol",
      notes: null,
      context: "alican",
      projectId: null,
      scheduledAt: "2026-09-29T09:00:00.000Z",
      dueAt: null,
      rrule: null,
      status: "open",
      source: "ios",
      createdAt: "2026-09-28T23:00:00.000Z",
      updatedAt: "2026-09-28T23:00:00.000Z",
    };

    let capturedUrl = "";
    let capturedBody: any = null;

    global.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: "Created",
          code: 201,
          data: mockCreatedItem,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    const result = await createItem({
      title: "HGS kontrol",
      scheduledAt: "2026-09-29T09:00:00.000Z",
      context: "alican",
    });

    expect(capturedUrl).toBe("http://localhost:4090/api/items");
    expect(capturedBody).toEqual({
      kind: "task",
      source: "ios",
      title: "HGS kontrol",
      scheduledAt: "2026-09-29T09:00:00.000Z",
      context: "alican",
    });
    expect(result.id).toBe("item-100");
    expect(result.status).toBe("open");
  });
});
