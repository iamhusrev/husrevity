import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relative-time";

const now = new Date("2026-10-18T12:00:00Z");

describe("formatRelativeTime", () => {
  it("says how many days ago in the given locale", () => {
    expect(formatRelativeTime("2026-10-15T09:00:00Z", now, "en-US")).toBe("3 days ago");
    expect(formatRelativeTime("2026-10-15T09:00:00Z", now, "tr-TR")).toBe("3 gün önce");
  });

  it("uses the natural word for one day", () => {
    expect(formatRelativeTime("2026-10-17T11:00:00Z", now, "en-US")).toBe("yesterday");
    expect(formatRelativeTime("2026-10-17T11:00:00Z", now, "tr-TR")).toBe("dün");
  });

  it("falls back to hours and minutes inside the first day", () => {
    expect(formatRelativeTime("2026-10-18T07:00:00Z", now, "en-US")).toBe("5 hours ago");
    expect(formatRelativeTime("2026-10-18T11:40:00Z", now, "en-US")).toBe("20 minutes ago");
  });

  it("never says zero: anything under a minute reads as one minute ago", () => {
    expect(formatRelativeTime("2026-10-18T11:59:50Z", now, "en-US")).toBe("1 minute ago");
    expect(formatRelativeTime(now, now, "en-US")).toBe("1 minute ago");
  });

  it("returns an empty string for an unparseable date instead of throwing", () => {
    expect(formatRelativeTime("not a date", now, "en-US")).toBe("");
  });

  it("treats a date in the future as just now", () => {
    expect(formatRelativeTime("2026-10-19T12:00:00Z", now, "en-US")).toBe("1 minute ago");
  });
});
