import { describe, it, expect, vi, beforeEach } from "vitest";
import { trashService } from "./trash-service";
import apiClient from "./api-client";

vi.mock("./api-client", () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

const page = {
  success: true,
  message: "ok",
  code: 200,
  data: { items: [], nextCursor: null },
};

/** The query string axios would send for the last GET call. */
const lastQuery = () => {
  const [, config] = vi.mocked(apiClient.get).mock.calls.at(-1) as [string, { params: unknown }];
  return String(config.params);
};

describe("trashService.listDeleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: {} } });
  });

  it("GETs /trash with no query when nothing is filtered", async () => {
    await trashService.listDeleted({});
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiClient.get).mock.calls[0][0]).toBe("/trash");
    expect(lastQuery()).toBe("");
  });

  it("repeats kind for every selected kind and passes limit and cursor", async () => {
    await trashService.listDeleted({ kinds: ["task", "project"], limit: 20, cursor: "abc" });
    expect(lastQuery()).toBe("kind=task&kind=project&limit=20&cursor=abc");
  });

  it("passes since as an ISO date-time", async () => {
    await trashService.listDeleted({ since: "2026-03-01T10:00:00.000Z" });
    expect(lastQuery()).toBe("since=2026-03-01T10%3A00%3A00.000Z");
  });

  it("returns the envelope so callers read .data", async () => {
    const result = await trashService.listDeleted({});
    expect(result).toEqual(page);
  });

  it("restores with a PATCH to the entry's restorePath", async () => {
    await trashService.restore("/projects/7/restore");
    expect(apiClient.patch).toHaveBeenCalledWith("/projects/7/restore");
  });

  // axios ignores baseURL for absolute and protocol-relative URLs, so such a value would send the
  // Bearer token to another host. The path comes from the API, but it is checked anyway.
  it.each(["https://evil.example/x", "//evil.example/x", "tasks/1/restore", "", "/\\evil.example"])(
    "refuses to PATCH %j and never calls the client",
    async (path) => {
      vi.mocked(apiClient.patch).mockClear();
      await expect(trashService.restore(path)).rejects.toThrow(/restore path/i);
      expect(apiClient.patch).not.toHaveBeenCalled();
    },
  );
});
