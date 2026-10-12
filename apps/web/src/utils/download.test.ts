import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadBlob } from "./download";

describe("downloadBlob", () => {
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let clicked: HTMLAnchorElement | null;

  beforeEach(() => {
    vi.useFakeTimers();
    clicked = null;
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = this;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    clickSpy.mockRestore();
  });

  it("defers revoking the URL until after the click", () => {
    downloadBlob("cal.ics", new Blob(["x"]));
    expect(clicked).not.toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("creates an object URL, clicks a download link and revokes the URL", () => {
    const blob = new Blob(["x"], { type: "text/calendar" });
    downloadBlob("cal.ics", blob);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).not.toBeNull();
    expect(clicked?.download).toBe("cal.ics");
    expect(clicked?.href).toBe("blob:mock-url");
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("revokes the URL and removes the link even when click throws", () => {
    clickSpy.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => downloadBlob("cal.ics", new Blob(["x"]))).toThrow("blocked");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
