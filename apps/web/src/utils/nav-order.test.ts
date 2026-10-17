import { describe, it, expect } from "vitest";
import { DEFAULT_NAV_ORDER, moveNavItem, resolveNavOrder, stepNavItem } from "./nav-order";
import type { NavPreferences } from "@/types/user/user";

const allIds = (o: { core: string[]; daily: string[] }) => [...o.core, ...o.daily].sort();

describe("resolveNavOrder", () => {
  it("returns the default order when there are no preferences", () => {
    expect(resolveNavOrder(null)).toEqual(DEFAULT_NAV_ORDER);
  });

  it("applies a saved order", () => {
    const prefs: NavPreferences = {
      sections: {
        core: ["vault", "notes", "reminders", "projects"],
        daily: ["sport", "inbox", "week", "month", "goals", "evkat", "learning"],
      },
    };
    expect(resolveNavOrder(prefs).core).toEqual(["vault", "notes", "reminders", "projects"]);
    expect(resolveNavOrder(prefs).daily[0]).toBe("sport");
  });

  it("keeps an item moved to another section there", () => {
    const prefs: NavPreferences = {
      sections: { core: ["notes", "reminders", "projects"], daily: ["vault"] },
    };
    const order = resolveNavOrder(prefs);
    expect(order.daily[0]).toBe("vault");
    expect(order.core).not.toContain("vault");
  });

  it("drops unknown ids", () => {
    const prefs = {
      sections: { core: ["notes", "ghost"], daily: [] },
    } as unknown as NavPreferences;
    expect(allIds(resolveNavOrder(prefs))).toEqual(allIds(DEFAULT_NAV_ORDER));
  });

  it("drops duplicates, keeping the first occurrence", () => {
    const prefs = {
      sections: { core: ["notes", "notes"], daily: ["notes"] },
    } as unknown as NavPreferences;
    const order = resolveNavOrder(prefs);
    expect(order.core.filter((id) => id === "notes")).toHaveLength(1);
    expect(order.daily).not.toContain("notes");
  });

  it("appends missing items to their default section", () => {
    const prefs: NavPreferences = { sections: { core: ["notes"], daily: ["sport"] } };
    const order = resolveNavOrder(prefs);
    expect(order.core.slice(0, 1)).toEqual(["notes"]);
    expect(order.core).toContain("reminders");
    expect(order.daily).toContain("inbox");
    expect(allIds(order)).toEqual(allIds(DEFAULT_NAV_ORDER));
  });
});

describe("moveNavItem", () => {
  const base = { core: ["reminders", "notes", "projects", "vault"], daily: ["inbox", "week"] };

  it("reorders within a section", () => {
    const next = moveNavItem(base as never, "vault", "core", 0);
    expect(next.core).toEqual(["vault", "reminders", "notes", "projects"]);
  });

  it("moves across sections at an index", () => {
    const next = moveNavItem(base as never, "notes", "daily", 1);
    expect(next.core).toEqual(["reminders", "projects", "vault"]);
    expect(next.daily).toEqual(["inbox", "notes", "week"]);
  });

  it("can empty a section and fill an empty one", () => {
    const solo = { core: ["notes"], daily: [] };
    const next = moveNavItem(solo as never, "notes", "daily", 0);
    expect(next).toEqual({ core: [], daily: ["notes"] });
  });

  it("clamps an out-of-range index", () => {
    const next = moveNavItem(base as never, "inbox", "core", 99);
    expect(next.core[next.core.length - 1]).toBe("inbox");
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(base));
    moveNavItem(base as never, "notes", "daily", 0);
    expect(base).toEqual(copy);
  });

  it("returns the same order for an unknown id", () => {
    expect(moveNavItem(base as never, "ghost" as never, "core", 0)).toEqual(base);
  });
});

describe("stepNavItem", () => {
  const base = { core: ["reminders", "notes"], daily: ["inbox", "week"] };

  it("moves up and down inside a section", () => {
    expect(stepNavItem(base as never, "notes", -1).core).toEqual(["notes", "reminders"]);
    expect(stepNavItem(base as never, "reminders", 1).core).toEqual(["notes", "reminders"]);
  });

  it("crosses into the next section when stepping down from the end", () => {
    const next = stepNavItem(base as never, "notes", 1);
    expect(next.core).toEqual(["reminders"]);
    expect(next.daily).toEqual(["notes", "inbox", "week"]);
  });

  it("crosses into the previous section when stepping up from the start", () => {
    const next = stepNavItem(base as never, "inbox", -1);
    expect(next.core).toEqual(["reminders", "notes", "inbox"]);
    expect(next.daily).toEqual(["week"]);
  });

  it("is a no-op at the very top and bottom", () => {
    expect(stepNavItem(base as never, "reminders", -1)).toEqual(base);
    expect(stepNavItem(base as never, "week", 1)).toEqual(base);
  });
});
