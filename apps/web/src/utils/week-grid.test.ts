import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildWeek,
  weekRange,
  shiftWeek,
  loadMinutes,
  loadLevel,
  weekSummary,
  sortByTime,
  itemTimeLabel,
  WEEK_DAY_CAPACITY_MIN,
  DEFAULT_ITEM_DURATION_MIN,
} from "./week-grid";
import { ItemResponse } from "@/types/item/item";

function makeItem(overrides: Partial<ItemResponse>): ItemResponse {
  return {
    id: "1",
    kind: "task",
    title: "Item",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: null,
    durationMin: null,
    dueAt: null,
    notifyMinutesBefore: null,
    rrule: null,
    status: "open",
    completedAt: null,
    payload: {},
    source: "web",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("week-grid helpers", () => {
  const timezones = ["UTC", "Europe/Istanbul", "America/Los_Angeles"];

  timezones.forEach((tz) => {
    describe(`under TZ=${tz}`, () => {
      beforeEach(() => {
        vi.stubEnv("TZ", tz);
      });
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      describe("buildWeek / weekRange", () => {
        it("starts on Monday for a mid-week date", () => {
          // 2026-10-14 is a Wednesday.
          const days = buildWeek("2026-10-14");
          expect(days.map((d) => d.ymd)).toEqual([
            "2026-10-12",
            "2026-10-13",
            "2026-10-14",
            "2026-10-15",
            "2026-10-16",
            "2026-10-17",
            "2026-10-18",
          ]);
          expect(days[0].weekdayIndex).toBe(0);
          expect(days[6].weekdayIndex).toBe(6);
        });

        it("keeps Monday as itself and maps Sunday to the preceding Monday", () => {
          expect(buildWeek("2026-10-12")[0].ymd).toBe("2026-10-12");
          expect(buildWeek("2026-10-18")[0].ymd).toBe("2026-10-12");
          expect(buildWeek("2026-10-19")[0].ymd).toBe("2026-10-19");
        });

        it("crosses a month boundary", () => {
          // 2026-10-29 is Thursday; week is Oct 26 .. Nov 1.
          const days = buildWeek("2026-10-29");
          expect(days[0].ymd).toBe("2026-10-26");
          expect(days[5].ymd).toBe("2026-10-31");
          expect(days[6].ymd).toBe("2026-11-01");
        });

        it("crosses a year boundary", () => {
          // 2026-12-31 is Thursday; week is Dec 28 .. Jan 3.
          const range = weekRange("2026-12-31");
          expect(range).toEqual({ fromYmd: "2026-12-28", toYmd: "2027-01-03" });
          const days = buildWeek("2027-01-01");
          expect(days[3].ymd).toBe("2026-12-31");
          expect(days[4].ymd).toBe("2027-01-01");
        });

        it("handles a leap day", () => {
          // 2028-02-29 is Tuesday.
          const days = buildWeek("2028-02-29");
          expect(days[0].ymd).toBe("2028-02-28");
          expect(days[1].ymd).toBe("2028-02-29");
          expect(days[2].ymd).toBe("2028-03-01");
        });

        it("flags today using the Istanbul day, not the host zone", () => {
          vi.useFakeTimers();
          try {
            // 2026-10-14 22:30 UTC is 2026-10-15 01:30 in Istanbul.
            vi.setSystemTime(new Date("2026-10-14T22:30:00Z"));
            const days = buildWeek("2026-10-14");
            const today = days.filter((d) => d.isToday).map((d) => d.ymd);
            expect(today).toEqual(["2026-10-15"]);
          } finally {
            vi.useRealTimers();
          }
        });

        it("shiftWeek moves by whole weeks across boundaries", () => {
          expect(shiftWeek("2026-10-14", 1)).toBe("2026-10-21");
          expect(shiftWeek("2026-10-14", -1)).toBe("2026-10-07");
          expect(shiftWeek("2026-12-30", 1)).toBe("2027-01-06");
          expect(shiftWeek("2027-01-02", -1)).toBe("2026-12-26");
        });
      });

      describe("loadMinutes / loadLevel", () => {
        it("sums durations of scheduled items and counts null as the default", () => {
          const items = [
            makeItem({ id: "a", scheduledAt: "2026-10-12T09:00:00+03:00", durationMin: 60 }),
            makeItem({ id: "b", scheduledAt: "2026-10-12T11:00:00+03:00", durationMin: null }),
          ];
          expect(DEFAULT_ITEM_DURATION_MIN).toBe(30);
          expect(loadMinutes(items)).toBe(90);
        });

        it("ignores dueAt-only, undated and cancelled items", () => {
          const items = [
            makeItem({ id: "a", dueAt: "2026-10-12T00:00:00+03:00", durationMin: 120 }),
            makeItem({
              id: "b",
              scheduledAt: "2026-10-12T09:00:00+03:00",
              status: "cancelled",
              durationMin: 60,
            }),
            makeItem({
              id: "c",
              scheduledAt: "2026-10-12T10:00:00+03:00",
              status: "done",
              durationMin: 45,
            }),
          ];
          expect(loadMinutes(items)).toBe(45);
        });

        it("counts a recurring occurrence through occursOn", () => {
          const items = [
            makeItem({
              id: "r",
              rrule: "FREQ=DAILY",
              occursOn: "2026-10-12",
              scheduledAt: "2026-10-01T09:00:00+03:00",
              durationMin: 20,
            }),
          ];
          expect(loadMinutes(items)).toBe(20);
        });

        it("thresholds: ok up to 100%, warn above 100%, over above 125%", () => {
          expect(WEEK_DAY_CAPACITY_MIN).toBe(480);
          expect(loadLevel(0)).toBe("ok");
          expect(loadLevel(480)).toBe("ok");
          expect(loadLevel(481)).toBe("warn");
          expect(loadLevel(600)).toBe("warn");
          expect(loadLevel(601)).toBe("over");
        });
      });

      describe("sortByTime / itemTimeLabel", () => {
        it("sorts by Istanbul time with timeless items first", () => {
          const items = [
            makeItem({ id: "late", scheduledAt: "2026-10-12T23:30:00+03:00" }),
            makeItem({ id: "morning", scheduledAt: "2026-10-12T08:15:00+03:00" }),
            makeItem({ id: "timeless", dueAt: "2026-10-12T00:00:00+03:00" }),
            makeItem({ id: "due-noon", dueAt: "2026-10-12T12:00:00+03:00" }),
          ];
          expect(sortByTime(items).map((i) => i.id)).toEqual([
            "timeless",
            "morning",
            "due-noon",
            "late",
          ]);
        });

        it("formats the label in Istanbul time and hides midnight dueAt", () => {
          expect(itemTimeLabel(makeItem({ scheduledAt: "2026-10-12T23:30:00+03:00" }))).toBe(
            "23:30",
          );
          expect(itemTimeLabel(makeItem({ dueAt: "2026-10-12T00:00:00+03:00" }))).toBeNull();
          expect(itemTimeLabel(makeItem({ dueAt: "2026-10-12T09:05:00+03:00" }))).toBe("09:05");
          expect(itemTimeLabel(makeItem({}))).toBeNull();
        });

        it("hides a scheduledAt at exactly 00:00 Istanbul and sorts it with the timeless items", () => {
          const allDay = makeItem({
            id: "all-day",
            kind: "event",
            scheduledAt: "2026-10-12T00:00:00+03:00",
          });
          expect(itemTimeLabel(allDay)).toBeNull();
          expect(itemTimeLabel(makeItem({ scheduledAt: "2026-10-12T00:15:00+03:00" }))).toBe(
            "00:15",
          );
          const items = [
            makeItem({ id: "morning", scheduledAt: "2026-10-12T08:15:00+03:00" }),
            allDay,
            makeItem({ id: "timeless", dueAt: "2026-10-12T00:00:00+03:00" }),
          ];
          expect(sortByTime(items).map((i) => i.id)).toEqual(["all-day", "timeless", "morning"]);
        });
      });

      describe("weekSummary", () => {
        const today = "2026-10-14";

        it("counts total, done, open and slipped (cancelled excluded)", () => {
          const items = [
            makeItem({ id: "1", scheduledAt: "2026-10-12T09:00:00+03:00" }), // open, slipped
            makeItem({ id: "2", dueAt: "2026-10-13T00:00:00+03:00" }), // open, slipped
            makeItem({ id: "3", scheduledAt: "2026-10-14T09:00:00+03:00" }), // open, today: not slipped
            makeItem({ id: "4", scheduledAt: "2026-10-15T09:00:00+03:00" }), // open, future
            makeItem({ id: "5", scheduledAt: "2026-10-12T09:00:00+03:00", status: "done" }),
            makeItem({ id: "6", scheduledAt: "2026-10-12T09:00:00+03:00", status: "cancelled" }),
          ];
          expect(weekSummary(items, today)).toEqual({ total: 5, done: 1, open: 4, slipped: 2 });
        });

        it("uses the Istanbul day for a 23:30 Istanbul item", () => {
          // 2026-10-13 23:30 Istanbul = 20:30 UTC = 13:30 Los Angeles on the same date,
          // but 2026-10-14 02:30 Istanbul is 2026-10-13 23:30 UTC: still Istanbul Oct 14.
          const late = makeItem({ id: "late", scheduledAt: "2026-10-13T23:30:00+03:00" });
          const early = makeItem({ id: "early", scheduledAt: "2026-10-14T00:30:00+03:00" });
          expect(weekSummary([late], today).slipped).toBe(1);
          expect(weekSummary([early], today).slipped).toBe(0);
        });

        it("uses occursOn for recurring occurrences and ignores undated items", () => {
          const items = [
            makeItem({
              id: "r",
              rrule: "FREQ=DAILY",
              occursOn: "2026-10-13",
              scheduledAt: "2026-10-01T09:00:00+03:00",
            }),
            makeItem({ id: "n" }),
          ];
          expect(weekSummary(items, today)).toEqual({ total: 1, done: 0, open: 1, slipped: 1 });
        });

        it("returns zeros for an empty week", () => {
          expect(weekSummary([], today)).toEqual({ total: 0, done: 0, open: 0, slipped: 0 });
        });

        it("counts only items whose day is one of the displayed week days", () => {
          const weekYmds = buildWeek("2026-10-14").map((d) => d.ymd);
          const items = [
            // Returned by the API for this week through dueAt Oct 14, but placed on Oct 5.
            makeItem({
              id: "out",
              scheduledAt: "2026-10-05T09:00:00+03:00",
              dueAt: "2026-10-14T00:00:00+03:00",
            }),
            // Previous week item left over by keepPreviousData.
            makeItem({ id: "prev", scheduledAt: "2026-10-08T09:00:00+03:00" }),
            makeItem({ id: "in", scheduledAt: "2026-10-13T09:00:00+03:00" }),
          ];
          expect(weekSummary(items, today, weekYmds)).toEqual({
            total: 1,
            done: 0,
            open: 1,
            slipped: 1,
          });
        });
      });
    });
  });
});
