import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addDaysYmd, firstDayOfMonthYmd, isRealYmd, lastDayOfMonthYmd, spanDaysYmd } from "./ymd";

describe("ymd helpers", () => {
  ["UTC", "Europe/Istanbul", "America/Los_Angeles"].forEach((tz) => {
    describe(`under TZ=${tz}`, () => {
      beforeEach(() => {
        vi.stubEnv("TZ", tz);
      });
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it("accepts real calendar dates and rejects impossible ones", () => {
        expect(isRealYmd("2028-02-29")).toBe(true);
        expect(isRealYmd("2026-02-29")).toBe(false);
        expect(isRealYmd("2026-13-01")).toBe(false);
        expect(isRealYmd("2026-4-01")).toBe(false);
        expect(isRealYmd("")).toBe(false);
        expect(isRealYmd("2026-02-30")).toBe(false);
      });

      it("counts the inclusive day span", () => {
        expect(spanDaysYmd("2026-01-01", "2026-01-01")).toBe(1);
        expect(spanDaysYmd("2026-01-01", "2026-12-31")).toBe(365);
        expect(spanDaysYmd("2028-01-01", "2028-12-31")).toBe(366);
        expect(spanDaysYmd("2026-10-31", "2026-11-02")).toBe(3);
      });

      it("returns first and last day of a month incl. leap February", () => {
        expect(firstDayOfMonthYmd(2026, 2)).toBe("2026-02-01");
        expect(lastDayOfMonthYmd(2026, 2)).toBe("2026-02-28");
        expect(lastDayOfMonthYmd(2028, 2)).toBe("2028-02-29");
        expect(lastDayOfMonthYmd(2026, 12)).toBe("2026-12-31");
      });

      it("adds days across a year boundary", () => {
        expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
      });
    });
  });
});
