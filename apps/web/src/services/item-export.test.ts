import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { exportItemsIcs } from "./item-service";
import { parseAxiosError } from "@/utils/handleError";
import apiClient from "./api-client";

vi.mock("./api-client", () => ({
  default: { get: vi.fn() },
}));

describe("exportItemsIcs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests the raw calendar as a blob with the query params", async () => {
    const blob = new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar" });
    vi.mocked(apiClient.get).mockResolvedValue({ data: blob, headers: {} });
    await exportItemsIcs({ from: "2026-10-01", to: "2026-10-31", includeTasks: false });
    expect(apiClient.get).toHaveBeenCalledWith("/items/export.ics", {
      params: { from: "2026-10-01", to: "2026-10-31", includeTasks: false },
      responseType: "blob",
    });
  });

  it("takes the file name from Content-Disposition when present", async () => {
    const blob = new Blob(["x"], { type: "text/calendar" });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: blob,
      headers: { "content-disposition": 'attachment; filename="custom-name.ics"' },
    });
    const res = await exportItemsIcs({ from: "2026-10-01", to: "2026-10-31", includeTasks: true });
    expect(res.filename).toBe("custom-name.ics");
    expect(res.blob).toBe(blob);
  });

  it("falls back to husrevity-<from>_<to>.ics", async () => {
    const blob = new Blob(["x"], { type: "text/calendar" });
    vi.mocked(apiClient.get).mockResolvedValue({ data: blob, headers: {} });
    const res = await exportItemsIcs({ from: "2026-10-01", to: "2026-10-31", includeTasks: true });
    expect(res.filename).toBe("husrevity-2026-10-01_2026-10-31.ics");
  });

  it("ignores an unsafe Content-Disposition file name", async () => {
    const blob = new Blob(["x"], { type: "text/calendar" });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: blob,
      headers: { "content-disposition": 'attachment; filename="../../etc/passwd"' },
    });
    const res = await exportItemsIcs({ from: "2026-10-01", to: "2026-10-31", includeTasks: true });
    expect(res.filename).toBe("husrevity-2026-10-01_2026-10-31.ics");
  });

  function blobError(body: string, status = 400): AxiosError {
    const response = {
      data: new Blob([body], { type: "application/json" }),
      status,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    return new AxiosError("Request failed", "ERR_BAD_REQUEST", response.config, null, response);
  }

  it("surfaces the server message of a Blob-wrapped JSON error", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(
      blobError(JSON.stringify({ success: false, message: "Range is limited to 366 days" })),
    );
    const err = await exportItemsIcs({ from: "2026-01-01", to: "2027-12-31", includeTasks: true })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect(parseAxiosError(err).message).toBe("Range is limited to 366 days");
  });

  it("falls back to the generic error when the Blob is not JSON", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(blobError("<html>Bad gateway</html>", 502));
    const err = await exportItemsIcs({ from: "2026-01-01", to: "2026-01-31", includeTasks: true })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect(parseAxiosError(err).message).toBe("Something went wrong. Please try again.");
  });

  it("rethrows non-axios errors untouched", async () => {
    const boom = new Error("boom");
    vi.mocked(apiClient.get).mockRejectedValue(boom);
    await expect(
      exportItemsIcs({ from: "2026-01-01", to: "2026-01-31", includeTasks: true }),
    ).rejects.toBe(boom);
  });
});
