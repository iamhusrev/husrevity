import { describe, it, expect, vi, beforeEach } from "vitest";
import { noteLinkService } from "./note-link-service";
import apiClient from "./api-client";

vi.mock("./api-client", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

describe("noteLinkService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: "" });
  });

  it("lists the links of a note", async () => {
    await noteLinkService.listForNote("12");
    expect(apiClient.get).toHaveBeenCalledWith("/notes/12/links");
  });

  it("adds a link with the target type and id", async () => {
    await noteLinkService.add("12", { targetType: "goal", targetId: "3" });
    expect(apiClient.post).toHaveBeenCalledWith("/notes/12/links", {
      targetType: "goal",
      targetId: "3",
    });
  });

  it("removes a link", async () => {
    await noteLinkService.remove("12", "99");
    expect(apiClient.delete).toHaveBeenCalledWith("/notes/12/links/99");
  });

  it("lists notes linked to a target", async () => {
    await noteLinkService.notesLinkedTo("goal", "3");
    expect(apiClient.get).toHaveBeenCalledWith("/note-links", {
      params: { targetType: "goal", targetId: "3" },
    });
  });
});
