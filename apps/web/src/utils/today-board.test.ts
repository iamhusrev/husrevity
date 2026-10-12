import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  minutesToTop,
  snapMinutes,
  clampToDay,
  slotToIso,
  layoutOverlaps,
  segmentsForWeekday,
  ISTANBUL_TIMEZONE_OFFSET,
} from "./today-board";
import { RoutineSegmentResponse } from "@/types/routine/routine";

describe("today-board pure scheduling helpers", () => {
  describe("minutesToTop", () => {
    it("calculates top pixel offset based on minutes and pxPerMinute", () => {
      expect(minutesToTop(0, 1.5)).toBe(0);
      expect(minutesToTop(60, 1.5)).toBe(90);
      expect(minutesToTop(120, 2)).toBe(240);
    });
  });

  describe("snapMinutes", () => {
    it("snaps to nearest 15-minute interval by default", () => {
      expect(snapMinutes(0)).toBe(0);
      expect(snapMinutes(7)).toBe(0);
      expect(snapMinutes(8)).toBe(15);
      expect(snapMinutes(14)).toBe(15);
      expect(snapMinutes(22)).toBe(15);
      expect(snapMinutes(23)).toBe(30);
      expect(snapMinutes(55)).toBe(60);
    });

    it("supports custom step", () => {
      expect(snapMinutes(27, 30)).toBe(30);
      expect(snapMinutes(14, 30)).toBe(0);
    });
  });

  describe("clampToDay", () => {
    it("clamps at 00:00 (0) and 23:59 (1439)", () => {
      expect(clampToDay(-15)).toBe(0);
      expect(clampToDay(0)).toBe(0);
      expect(clampToDay(720)).toBe(720);
      expect(clampToDay(1439)).toBe(1439);
      expect(clampToDay(1440)).toBe(1439);
      expect(clampToDay(2000)).toBe(1439);
    });
  });

  describe("slotToIso", () => {
    it("exports Istanbul timezone offset constant as +03:00", () => {
      expect(ISTANBUL_TIMEZONE_OFFSET).toBe("+03:00");
    });

    it("formats exact midnight slot at 00:00", () => {
      const iso = slotToIso("2026-10-12", 0);
      expect(iso).toBe("2026-10-12T00:00:00+03:00");
      expect(new Date(iso).toISOString()).toBe("2026-10-11T21:00:00.000Z");
    });

    it("formats morning slot (09:15)", () => {
      const minutes = 9 * 60 + 15; // 555
      const iso = slotToIso("2026-10-12", minutes);
      expect(iso).toBe("2026-10-12T09:15:00+03:00");
      expect(new Date(iso).toISOString()).toBe("2026-10-12T06:15:00.000Z");
    });

    it("formats evening slot (21:45)", () => {
      const minutes = 21 * 60 + 45; // 1305
      const iso = slotToIso("2026-10-12", minutes);
      expect(iso).toBe("2026-10-12T21:45:00+03:00");
      expect(new Date(iso).toISOString()).toBe("2026-10-12T18:45:00.000Z");
    });
  });

  describe("layoutOverlaps", () => {
    it("returns empty array for empty input", () => {
      expect(layoutOverlaps([])).toEqual([]);
    });

    it("assigns single column for non-overlapping entries", () => {
      const entries = [
        { itemId: "1", scheduledAt: "2026-10-12T09:00:00Z", durationMin: 60 },
        { itemId: "2", scheduledAt: "2026-10-12T10:00:00Z", durationMin: 60 },
      ];
      const result = layoutOverlaps(entries);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ itemId: "1", column: 0, columns: 1 });
      expect(result[1]).toMatchObject({ itemId: "2", column: 0, columns: 1 });
    });

    it("assigns side-by-side columns for overlapping entries and defaults duration to 30 min", () => {
      const entries = [
        { itemId: "1", scheduledAt: "2026-10-12T10:00:00Z", durationMin: null }, // defaults to 30 min (10:00-10:30)
        { itemId: "2", scheduledAt: "2026-10-12T10:15:00Z", durationMin: 45 }, // overlaps (10:15-11:00)
      ];
      const result = layoutOverlaps(entries);
      expect(result).toHaveLength(2);
      expect(result[0].column).toBe(0);
      expect(result[0].columns).toBe(2);
      expect(result[1].column).toBe(1);
      expect(result[1].columns).toBe(2);
    });

    it("handles multiple overlapping entries in a cluster greedy layout", () => {
      const entries = [
        { itemId: "1", scheduledAt: "2026-10-12T10:00:00Z", durationMin: 60 }, // 10:00-11:00 (col 0)
        { itemId: "2", scheduledAt: "2026-10-12T10:00:00Z", durationMin: 30 }, // 10:00-10:30 (col 1)
        { itemId: "3", scheduledAt: "2026-10-12T10:30:00Z", durationMin: 30 }, // 10:30-11:00 (col 1 reused)
      ];
      const result = layoutOverlaps(entries);
      expect(result[0]).toMatchObject({ itemId: "1", column: 0, columns: 2 });
      expect(result[1]).toMatchObject({ itemId: "2", column: 1, columns: 2 });
      expect(result[2]).toMatchObject({ itemId: "3", column: 1, columns: 2 });
    });
  });

  describe("segmentsForWeekday", () => {
    const makeSegment = (
      id: string,
      daysOfWeek: number,
      startMinute: number | null,
      endMinute: number | null,
    ): RoutineSegmentResponse => ({
      id,
      name: `Seg ${id}`,
      startMinute,
      endMinute,
      theme: null,
      colorToken: "husrev-amber",
      notes: null,
      position: 0,
      daysOfWeek,
      activities: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    // 2026-10-12 is Monday (bit 0 = 1)
    // 2026-10-13 is Tuesday (bit 1 = 2)
    // 2026-10-14 is Wednesday (bit 2 = 4)
    // 2026-10-18 is Sunday (bit 6 = 64)

    it("filters segments matching Monday bit", () => {
      const mondayOnly = makeSegment("1", 1, 540, 600); // 09:00 - 10:00
      const tuesdayOnly = makeSegment("2", 2, 540, 600);
      const allDays = makeSegment("3", 127, 480, 540);

      const result = segmentsForWeekday([mondayOnly, tuesdayOnly, allDays], "2026-10-12");
      expect(result.map((s) => s.id)).toEqual(["1", "3"]);
    });

    it("accepts a Date object as well as a YYYY-MM-DD string", () => {
      const mon = makeSegment("1", 1, 540, 600);
      // 2026-10-12T07:00:00Z is Monday 10:00 in Istanbul
      const date = new Date("2026-10-12T07:00:00Z");
      const result = segmentsForWeekday([mon], date);
      expect(result.map((s) => s.id)).toEqual(["1"]);
    });

    it("keeps segments with null startMinute or endMinute when daysOfWeek match", () => {
      const nullBounds = makeSegment("null-bounds", 1, null, null);
      const result = segmentsForWeekday([nullBounds], "2026-10-12");
      expect(result.map((s) => s.id)).toEqual(["null-bounds"]);
    });

    describe.each(["UTC", "Europe/Istanbul", "America/Los_Angeles", "Pacific/Apia"])(
      "under TZ=%s",
      (zone) => {
        beforeEach(() => {
          vi.stubEnv("TZ", zone);
        });

        afterEach(() => {
          vi.unstubAllEnvs();
        });

        it("derives the weekday from the YYYY-MM-DD string for every day of a week", () => {
          const perDay = [1, 2, 4, 8, 16, 32, 64].map((mask, i) =>
            makeSegment(`d${i}`, mask, 0, 60),
          );
          // 2026-10-12 (Mon) .. 2026-10-18 (Sun)
          for (let i = 0; i < 7; i++) {
            const ymd = `2026-10-${String(12 + i).padStart(2, "0")}`;
            expect(segmentsForWeekday(perDay, ymd).map((s) => s.id)).toEqual([`d${i}`]);
          }
        });

        it("resolves a date that does not exist at local midnight in some zones", () => {
          // Samoa skipped 2011-12-30 entirely (UTC+13 jump), so a locally constructed
          // midnight for that day lands on 2011-12-31 in Pacific/Apia. 2011-12-30 is a Friday.
          const friday = makeSegment("fri", 16, 0, 60);
          const saturday = makeSegment("sat", 32, 0, 60);
          expect(segmentsForWeekday([friday, saturday], "2011-12-30").map((s) => s.id)).toEqual([
            "fri",
          ]);
        });

        it("uses the Istanbul weekday for a Date instant", () => {
          // 2026-10-11T21:00:00Z is Sunday in UTC / Los Angeles but already Monday 00:00 in Istanbul
          const mon = makeSegment("mon", 1, 0, 60);
          const sun = makeSegment("sun", 64, 0, 60);
          const result = segmentsForWeekday([mon, sun], new Date("2026-10-11T21:00:00Z"));
          expect(result.map((s) => s.id)).toEqual(["mon"]);
        });
      },
    );
  });

  describe("minutesOfDayIstanbul and dateYmdIstanbul (zone-independent)", () => {
    const timezones = ["UTC", "Europe/Istanbul", "America/Los_Angeles"];

    timezones.forEach((tz) => {
      describe(`under TZ=${tz}`, () => {
        beforeEach(() => {
          vi.stubEnv("TZ", tz);
        });

        afterEach(() => {
          vi.unstubAllEnvs();
        });

        it("computes minutes-of-day and date in Istanbul timezone correctly across calendar boundaries", async () => {
          // Instant: 2026-10-12T22:30:00Z
          // In UTC: 2026-10-12 22:30
          // In America/Los_Angeles (PDT, UTC-7): 2026-10-12 15:30
          // In Europe/Istanbul (UTC+3): 2026-10-13 01:30 (next calendar day! 90 minutes)
          const lateNightUtc = "2026-10-12T22:30:00.000Z";

          // Instant: 2026-10-12T07:15:00Z
          // In Europe/Istanbul (UTC+3): 2026-10-12 10:15 (615 minutes)
          const morningUtc = "2026-10-12T07:15:00.000Z";

          // Instant: Exact midnight in Istanbul: 2026-10-12T21:00:00Z => 2026-10-13 00:00 (0 minutes)
          const midnightIstanbul = "2026-10-12T21:00:00.000Z";

          // Dynamically import to ensure zone resolution if needed
          const { minutesOfDayIstanbul, dateYmdIstanbul } = await import("./today-board");

          expect(minutesOfDayIstanbul(lateNightUtc)).toBe(90);
          expect(dateYmdIstanbul(lateNightUtc)).toBe("2026-10-13");

          expect(minutesOfDayIstanbul(morningUtc)).toBe(615);
          expect(dateYmdIstanbul(morningUtc)).toBe("2026-10-12");

          expect(minutesOfDayIstanbul(midnightIstanbul)).toBe(0);
          expect(dateYmdIstanbul(midnightIstanbul)).toBe("2026-10-13");
        });
      });
    });
  });
});
