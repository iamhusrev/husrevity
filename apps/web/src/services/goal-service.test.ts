import { describe, it, expect, vi, beforeEach } from "vitest";
import { goalService } from "./goal-service";
import apiClient from "./api-client";

vi.mock("./api-client", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

describe("goalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: {} } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: "" });
  });

  it("lists with the filter as query params", async () => {
    await goalService.list({ status: "active", from: "2026-01-01", to: "2026-12-31", limit: 200 });
    expect(apiClient.get).toHaveBeenCalledWith("/goals", {
      params: { status: "active", from: "2026-01-01", to: "2026-12-31", limit: 200 },
    });
  });

  it("gets one goal", async () => {
    await goalService.get("7");
    expect(apiClient.get).toHaveBeenCalledWith("/goals/7");
  });

  it("creates with POST /goals", async () => {
    const body = {
      title: "Ship",
      horizon: "month" as const,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    };
    await goalService.create(body);
    expect(apiClient.post).toHaveBeenCalledWith("/goals", body);
  });

  it("updates with PATCH /goals/:id", async () => {
    await goalService.update("7", { status: "done" });
    expect(apiClient.patch).toHaveBeenCalledWith("/goals/7", { status: "done" });
  });

  it("deletes with DELETE /goals/:id", async () => {
    await goalService.remove("7");
    expect(apiClient.delete).toHaveBeenCalledWith("/goals/7");
  });

  it("restores with PATCH /goals/:id/restore", async () => {
    await goalService.restore("7");
    expect(apiClient.patch).toHaveBeenCalledWith("/goals/7/restore");
  });
});
