import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildMonthGrid,
  monthRange,
  groupItemsByDay,
  moveToDay,
  MonthGridCell,
} from "./month-grid";
import { ItemResponse } from "@/types/item/item";

describe("month-grid helpers", () => {
  const timezones = ["UTC", "Europe/Istanbul", "America/Los_Angeles"];

  timezones.forEach((tz) => {
    describe(`under TZ=${tz}`, () => {
      beforeEach(() => {
        vi.stubEnv("TZ", tz);
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      describe("buildMonthGrid and monthRange", () => {
        it("builds October 2026 grid (Monday-first, Oct 31 boundary)", () => {
          // October 2026 starts on Thursday (Oct 1).
          // Monday-first week starts with Sep 28, 29, 30 (leading days).
          // Oct 31 is Saturday. Trailing day is Nov 1 (Sunday).
          // Total days: 3 + 31 + 1 = 35 (5 weeks).
          const cells = buildMonthGrid(2026, 10);
          expect(cells.length).toBe(35);
          expect(cells[0].ymd).toBe("2026-09-28");
          expect(cells[0].inMonth).toBe(false);
          expect(cells[2].ymd).toBe("2026-09-30");
          expect(cells[2].inMonth).toBe(false);

          expect(cells[3].ymd).toBe("2026-10-01");
          expect(cells[3].inMonth).toBe(true);

          expect(cells[33].ymd).toBe("2026-10-31");
          expect(cells[33].inMonth).toBe(true);

          expect(cells[34].ymd).toBe("2026-11-01");
          expect(cells[34].inMonth).toBe(false);

          const range = monthRange(2026, 10);
          expect(range).toEqual({
            fromYmd: "2026-09-28",
            toYmd: "2026-11-01",
          });
        });

        it("handles leap February 2024 (29 days)", () => {
          // Feb 1, 2024 is Thursday.
          // Leading days: Jan 29, 30, 31 (Mon, Tue, Wed).
          // Feb 29, 2024 is Thursday.
          // Trailing days: Mar 1, 2, 3 (Fri, Sat, Sun).
          // Total days: 3 + 29 + 3 = 35 (5 weeks).
          const cells = buildMonthGrid(2024, 2);
          expect(cells.length).toBe(35);
          expect(cells[0].ymd).toBe("2024-01-29");
          expect(cells[0].inMonth).toBe(false);
          expect(cells[3].ymd).toBe("2024-02-01");
          expect(cells[3].inMonth).toBe(true);
          expect(cells[31].ymd).toBe("2024-02-29");
          expect(cells[31].inMonth).toBe(true);
          expect(cells[34].ymd).toBe("2024-03-03");
          expect(cells[34].inMonth).toBe(false);

          const range = monthRange(2024, 2);
          expect(range).toEqual({
            fromYmd: "2024-01-29",
            toYmd: "2024-03-03",
          });
        });

        it("handles non-leap February 2026 with Sunday-start edge", () => {
          // Feb 1, 2026 is Sunday!
          // Monday-first: Mon-Sat are leading days (Jan 26..31 = 6 days).
          // Feb 1..28 = 28 days.
          // Feb 28 is Saturday. Trailing day: Mar 1 (Sunday = 1 day).
          // Total days: 6 + 28 + 1 = 35 (5 weeks).
          const cells = buildMonthGrid(2026, 2);
          expect(cells.length).toBe(35);
          expect(cells[0].ymd).toBe("2026-01-26");
          expect(cells[0].inMonth).toBe(false);
          expect(cells[5].ymd).toBe("2026-01-31");
          expect(cells[5].inMonth).toBe(false);
          expect(cells[6].ymd).toBe("2026-02-01");
          expect(cells[6].inMonth).toBe(true);
          expect(cells[33].ymd).toBe("2026-02-28");
          expect(cells[33].inMonth).toBe(true);
          expect(cells[34].ymd).toBe("2026-03-01");
          expect(cells[34].inMonth).toBe(false);

          const range = monthRange(2026, 2);
          expect(range).toEqual({
            fromYmd: "2026-01-26",
            toYmd: "2026-03-01",
          });
        });

        it("determines isToday using Europe/Istanbul calendar day, not local browser day", () => {
          // At instant 2026-10-12T22:30:00Z:
          // In UTC: 2026-10-12
          // In Los Angeles: 2026-10-12
          // In Europe/Istanbul: 2026-10-13!
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2026-10-12T22:30:00.000Z"));

          const cells = buildMonthGrid(2026, 10);
          const oct12 = cells.find((c) => c.ymd === "2026-10-12");
          const oct13 = cells.find((c) => c.ymd === "2026-10-13");

          expect(oct12?.isToday).toBe(false);
          expect(oct13?.isToday).toBe(true);

          vi.useRealTimers();
        });
      });

      describe("groupItemsByDay", () => {
        it("groups by Istanbul date of scheduledAt or dueAt, preferring occursOn for expansions", () => {
          const makeItem = (id: string, fields: Partial<ItemResponse>): ItemResponse => ({
            id,
            kind: "task",
            title: `Item ${id}`,
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
            ...fields,
          });

          // Item 1: scheduledAt at 2026-10-12T21:30:00Z -> 2026-10-13 in Istanbul!
          const item1 = makeItem("1", {
            scheduledAt: "2026-10-12T21:30:00.000Z",
          });

          // Item 2: dueAt only at 2026-10-15T09:00:00+03:00 -> 2026-10-15 in Istanbul
          const item2 = makeItem("2", {
            dueAt: "2026-10-15T09:00:00+03:00",
          });

          // Item 3: scheduledAt at 2026-10-01, but occursOn is "2026-10-20" -> occursOn wins
          const item3 = makeItem("3", {
            scheduledAt: "2026-10-01T10:00:00+03:00",
            occursOn: "2026-10-20",
          });

          // Item 4: neither scheduledAt nor dueAt -> excluded
          const item4 = makeItem("4", {});

          const grouped = groupItemsByDay([item1, item2, item3, item4]);

          expect(grouped["2026-10-13"]?.map((i) => i.id)).toEqual(["1"]);
          expect(grouped["2026-10-15"]?.map((i) => i.id)).toEqual(["2"]);
          expect(grouped["2026-10-20"]?.map((i) => i.id)).toEqual(["3"]);
          expect(grouped["2026-10-01"]).toBeUndefined();
        });

        it("handles item at 23:30 Istanbul correctly across all zones", () => {
          const makeItem = (id: string, scheduledAt: string): ItemResponse => ({
            id,
            kind: "event",
            title: "Late night event",
            notes: null,
            context: null,
            projectId: null,
            blockId: null,
            scheduledAt,
            durationMin: 30,
            dueAt: null,
            notifyMinutesBefore: null,
            rrule: null,
            status: "open",
            completedAt: null,
            payload: {},
            source: "web",
            createdAt: "2026-10-01T00:00:00Z",
            updatedAt: "2026-10-01T00:00:00Z",
          });

          // 23:30 Istanbul on 2026-10-31 is 20:30 UTC on 2026-10-31
          const lateOct31 = makeItem("late", "2026-10-31T20:30:00.000Z");
          const grouped = groupItemsByDay([lateOct31]);

          expect(grouped["2026-10-31"]?.map((i) => i.id)).toEqual(["late"]);
          expect(grouped["2026-11-01"]).toBeUndefined();
        });
      });

      describe("moveToDay", () => {
        it("moves scheduledAt to target day preserving Istanbul time of day", () => {
          const item: Pick<ItemResponse, "scheduledAt" | "dueAt"> = {
            scheduledAt: "2026-10-12T14:30:00+03:00", // 14:30
            dueAt: null,
          };

          const moved = moveToDay(item, "2026-10-25");
          expect(moved).toEqual({
            scheduledAt: "2026-10-25T14:30:00+03:00",
          });
        });

        it("moves dueAt to target day preserving Istanbul time of day for due-only items", () => {
          const item: Pick<ItemResponse, "scheduledAt" | "dueAt"> = {
            scheduledAt: null,
            dueAt: "2026-10-12T18:15:00+03:00", // 18:15
          };

          const moved = moveToDay(item, "2026-10-25");
          expect(moved).toEqual({
            dueAt: "2026-10-25T18:15:00+03:00",
          });
        });

        it("preserves 23:30 Istanbul time across month boundaries", () => {
          // 2026-10-31T23:30:00+03:00 (which is 2026-10-31T20:30:00.000Z)
          const item: Pick<ItemResponse, "scheduledAt" | "dueAt"> = {
            scheduledAt: "2026-10-31T20:30:00.000Z",
            dueAt: null,
          };

          const moved = moveToDay(item, "2026-11-01");
          expect(moved).toEqual({
            scheduledAt: "2026-11-01T23:30:00+03:00",
          });
        });

        it("handles timeless/all-day items keeping their field type at midnight", () => {
          const itemScheduled: Pick<ItemResponse, "scheduledAt" | "dueAt"> = {
            scheduledAt: "2026-10-12T00:00:00+03:00",
            dueAt: null,
          };
          expect(moveToDay(itemScheduled, "2026-10-16")).toEqual({
            scheduledAt: "2026-10-16T00:00:00+03:00",
          });

          const itemDue: Pick<ItemResponse, "scheduledAt" | "dueAt"> = {
            scheduledAt: null,
            dueAt: "2026-10-12T00:00:00+03:00",
          };
          expect(moveToDay(itemDue, "2026-10-16")).toEqual({
            dueAt: "2026-10-16T00:00:00+03:00",
          });
        });

        it("moves only the field specified by placedBy when both scheduledAt and dueAt exist", () => {
          const itemBoth: Pick<ItemResponse, "scheduledAt" | "dueAt"> = {
            scheduledAt: "2026-10-12T10:00:00+03:00",
            dueAt: "2026-10-15T18:00:00+03:00",
          };

          expect(moveToDay(itemBoth, "2026-10-20", "dueAt")).toEqual({
            dueAt: "2026-10-20T18:00:00+03:00",
          });

          expect(moveToDay(itemBoth, "2026-10-20", "scheduledAt")).toEqual({
            scheduledAt: "2026-10-20T10:00:00+03:00",
          });
        });
      });
    });
  });

  describe("explicit America/Los_Angeles timezone isolation", () => {
    beforeEach(() => {
      vi.stubEnv("TZ", "America/Los_Angeles");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("asserts a 23:30 Istanbul item lands on the Istanbul day even when local host time is Los Angeles", () => {
      // 2026-10-31 23:30 Istanbul (+03:00) is 20:30 UTC and 13:30 Los Angeles (PDT).
      const item: ItemResponse = {
        id: "late-istanbul-task",
        kind: "task",
        title: "Late night task",
        notes: null,
        context: null,
        projectId: null,
        blockId: null,
        scheduledAt: "2026-10-31T23:30:00+03:00",
        durationMin: 30,
        dueAt: null,
        notifyMinutesBefore: null,
        rrule: null,
        status: "open",
        completedAt: null,
        payload: {},
        source: "web",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
      };

      const grouped = groupItemsByDay([item]);
      expect(grouped["2026-10-31"]).toBeDefined();
      expect(grouped["2026-10-31"][0].id).toBe("late-istanbul-task");
      expect(grouped["2026-11-01"]).toBeUndefined();
    });
  });
});
