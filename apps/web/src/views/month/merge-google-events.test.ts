import { describe, it, expect } from "vitest";
import { GoogleFeedEvent } from "@/services/integrations-service";
import { ItemResponse } from "@/types/item/item";
import { groupGoogleEventsByDay, hideLegacyGcalItems } from "./merge-google-events";

function ev(overrides: Partial<GoogleFeedEvent>): GoogleFeedEvent {
  return {
    id: "e1",
    subscriptionId: "s1",
    googleEventId: "g1",
    recurringEventId: null,
    title: "Event",
    allDay: false,
    startAt: null,
    endAt: null,
    startDate: null,
    endDateExclusive: null,
    status: "confirmed",
    htmlLink: null,
    ...overrides,
  };
}

function item(id: string, source: ItemResponse["source"]): ItemResponse {
  return { id, source, kind: "event", title: id } as ItemResponse;
}

describe("all_day_uses_exclusive_end", () => {
  it("shows a one-day all-day event only on its own day", () => {
    const grouped = groupGoogleEventsByDay([
      ev({ allDay: true, startDate: "2026-03-10", endDateExclusive: "2026-03-11" }),
    ]);
    expect(Object.keys(grouped)).toEqual(["2026-03-10"]);
    expect(grouped["2026-03-10"][0].timeLabel).toBeNull();
  });

  it("spans a multi-day all-day event up to the day before the exclusive end", () => {
    const grouped = groupGoogleEventsByDay([
      ev({ allDay: true, startDate: "2026-03-30", endDateExclusive: "2026-04-02" }),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(["2026-03-30", "2026-03-31", "2026-04-01"]);
  });

  it("never shifts an all-day event to another day or a 03:00 time of day", () => {
    const grouped = groupGoogleEventsByDay([
      ev({ allDay: true, startDate: "2026-12-31", endDateExclusive: "2027-01-01" }),
    ]);
    expect(Object.keys(grouped)).toEqual(["2026-12-31"]);
    expect(grouped["2026-12-31"][0].timeLabel).toBeNull();
  });

  it("falls back to a single day when the exclusive end is missing", () => {
    const grouped = groupGoogleEventsByDay([
      ev({ allDay: true, startDate: "2026-03-10", endDateExclusive: null }),
    ]);
    expect(Object.keys(grouped)).toEqual(["2026-03-10"]);
  });
});

describe("timed google events", () => {
  it("places a timed event on its Istanbul day with an HH:mm label", () => {
    const grouped = groupGoogleEventsByDay([
      ev({ startAt: "2026-03-10T21:30:00Z", endAt: "2026-03-10T22:00:00Z" }),
    ]);
    // 21:30Z is 00:30 on the 11th in Istanbul (UTC+3).
    expect(Object.keys(grouped)).toEqual(["2026-03-11"]);
    expect(grouped["2026-03-11"][0].timeLabel).toBe("00:30");
  });

  it("skips cancelled events and events without usable dates", () => {
    const grouped = groupGoogleEventsByDay([
      ev({ status: "cancelled", startAt: "2026-03-10T10:00:00Z" }),
      ev({ id: "e2" }),
    ]);
    expect(grouped).toEqual({});
  });

  it("sorts a day's entries by time with all-day first", () => {
    const grouped = groupGoogleEventsByDay([
      ev({ id: "late", title: "Late", startAt: "2026-03-10T15:00:00Z" }),
      ev({ id: "early", title: "Early", startAt: "2026-03-10T07:00:00Z" }),
      ev({ id: "all", title: "All", allDay: true, startDate: "2026-03-10", endDateExclusive: "2026-03-11" }),
    ]);
    expect(grouped["2026-03-10"].map((e) => e.event.id)).toEqual(["all", "early", "late"]);
  });
});

describe("hideLegacyGcalItems", () => {
  it("hides only gcal items whose id is listed", () => {
    const items = [item("a", "gcal"), item("b", "gcal"), item("c", "web")];
    const out = hideLegacyGcalItems(items, ["a", "c"]);
    expect(out.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("returns the same items when nothing is hidden", () => {
    const items = [item("a", "gcal")];
    expect(hideLegacyGcalItems(items, [])).toBe(items);
  });
});
