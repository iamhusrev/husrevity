import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildGoalTree,
  periodForHorizon,
  progressLabel,
  progressPercent,
  validParents,
  validateGoalDraft,
  GoalDraft,
} from "./goal-tree";
import { GoalResponse } from "@/types/goal/goal";

function goal(overrides: Partial<GoalResponse> & { id: string }): GoalResponse {
  return {
    ownerId: "1",
    title: `Goal ${overrides.id}`,
    notes: null,
    horizon: "month",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    parentGoalId: null,
    status: "active",
    progress: { total: 0, done: 0, open: 0, percent: 0 },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("goal-tree helpers", () => {
  ["UTC", "Europe/Istanbul", "America/Los_Angeles"].forEach((tz) => {
    describe(`under TZ=${tz}`, () => {
      beforeEach(() => {
        vi.stubEnv("TZ", tz);
      });
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      describe("periodForHorizon", () => {
        it("returns the whole calendar year", () => {
          expect(periodForHorizon("year", 2026, 1)).toEqual({
            periodStart: "2026-01-01",
            periodEnd: "2026-12-31",
          });
        });

        it("returns calendar quarters", () => {
          expect(periodForHorizon("quarter", 2026, 1)).toEqual({
            periodStart: "2026-01-01",
            periodEnd: "2026-03-31",
          });
          expect(periodForHorizon("quarter", 2026, 2)).toEqual({
            periodStart: "2026-04-01",
            periodEnd: "2026-06-30",
          });
          expect(periodForHorizon("quarter", 2026, 4)).toEqual({
            periodStart: "2026-10-01",
            periodEnd: "2026-12-31",
          });
        });

        it("uses the real last day of a month, incl. leap February", () => {
          expect(periodForHorizon("month", 2026, 2).periodEnd).toBe("2026-02-28");
          expect(periodForHorizon("month", 2028, 2).periodEnd).toBe("2028-02-29");
          expect(periodForHorizon("month", 2026, 12)).toEqual({
            periodStart: "2026-12-01",
            periodEnd: "2026-12-31",
          });
        });

        it("rejects an out-of-range index", () => {
          expect(() => periodForHorizon("quarter", 2026, 5)).toThrow(RangeError);
          expect(() => periodForHorizon("month", 2026, 0)).toThrow(RangeError);
        });
      });

      describe("buildGoalTree", () => {
        it("nests year -> quarter -> month by parentGoalId", () => {
          const year = goal({
            id: "1",
            horizon: "year",
            periodStart: "2026-01-01",
            periodEnd: "2026-12-31",
          });
          const q4 = goal({
            id: "2",
            horizon: "quarter",
            periodStart: "2026-10-01",
            periodEnd: "2026-12-31",
            parentGoalId: "1",
          });
          const dec = goal({
            id: "3",
            horizon: "month",
            periodStart: "2026-12-01",
            periodEnd: "2026-12-31",
            parentGoalId: "2",
          });
          const tree = buildGoalTree([dec, q4, year]);
          expect(tree).toHaveLength(1);
          expect(tree[0].goal.id).toBe("1");
          expect(tree[0].children[0].goal.id).toBe("2");
          expect(tree[0].children[0].children[0].goal.id).toBe("3");
        });

        it("turns an orphaned child into a root", () => {
          const orphan = goal({ id: "5", parentGoalId: "999" });
          const tree = buildGoalTree([orphan]);
          expect(tree.map((n) => n.goal.id)).toEqual(["5"]);
        });

        it("sorts siblings by periodStart then numeric id", () => {
          const a = goal({ id: "10", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
          const b = goal({ id: "9", periodStart: "2026-10-01", periodEnd: "2026-10-31" });
          const c = goal({ id: "11", periodStart: "2026-10-01", periodEnd: "2026-10-31" });
          const tree = buildGoalTree([a, c, b]);
          expect(tree.map((n) => n.goal.id)).toEqual(["9", "11", "10"]);
        });

        it("compares ids numerically, not lexically", () => {
          const a = goal({ id: "100" });
          const b = goal({ id: "20" });
          expect(buildGoalTree([a, b]).map((n) => n.goal.id)).toEqual(["20", "100"]);
        });

        it("does not loop on a cycle (depth cap) and keeps every goal reachable", () => {
          const a = goal({ id: "1", parentGoalId: "2" });
          const b = goal({ id: "2", parentGoalId: "1" });
          const tree = buildGoalTree([a, b]);
          const seen: string[] = [];
          const walk = (nodes: typeof tree, depth: number) => {
            expect(depth).toBeLessThanOrEqual(5);
            nodes.forEach((n) => {
              seen.push(n.goal.id);
              walk(n.children, depth + 1);
            });
          };
          walk(tree, 1);
          expect(seen.sort()).toEqual(["1", "2"]);
        });
      });

      describe("validParents", () => {
        const year = goal({
          id: "1",
          horizon: "year",
          periodStart: "2026-01-01",
          periodEnd: "2026-12-31",
        });
        const q4 = goal({
          id: "2",
          horizon: "quarter",
          periodStart: "2026-10-01",
          periodEnd: "2026-12-31",
        });
        const q1 = goal({
          id: "3",
          horizon: "quarter",
          periodStart: "2026-01-01",
          periodEnd: "2026-03-31",
        });
        const otherYear = goal({
          id: "4",
          horizon: "year",
          periodStart: "2027-01-01",
          periodEnd: "2027-12-31",
        });
        const octMonth = goal({ id: "5" });
        const all = [year, q4, q1, otherYear, octMonth];

        it("offers only strictly larger horizons that contain the period", () => {
          const draft: GoalDraft = {
            title: "x",
            horizon: "month",
            periodStart: "2026-12-01",
            periodEnd: "2026-12-31",
          };
          expect(validParents(draft, all).map((g) => g.id)).toEqual(["1", "2"]);
        });

        it("offers only year goals for a quarter", () => {
          const draft: GoalDraft = {
            title: "x",
            horizon: "quarter",
            periodStart: "2026-04-01",
            periodEnd: "2026-06-30",
          };
          expect(validParents(draft, all).map((g) => g.id)).toEqual(["1"]);
        });

        it("offers nothing for a year goal", () => {
          const draft: GoalDraft = {
            title: "x",
            horizon: "year",
            periodStart: "2026-01-01",
            periodEnd: "2026-12-31",
          };
          expect(validParents(draft, all)).toEqual([]);
        });

        it("never offers a goal with the same horizon or the goal itself", () => {
          const draft: GoalDraft = {
            id: "2",
            title: "x",
            horizon: "quarter",
            periodStart: "2026-10-01",
            periodEnd: "2026-12-31",
          };
          const ids = validParents(draft, all).map((g) => g.id);
          expect(ids).not.toContain("2");
          expect(ids).not.toContain("3");
        });
      });

      describe("validateGoalDraft", () => {
        const base: GoalDraft = {
          title: "Ship it",
          horizon: "month",
          periodStart: "2026-10-01",
          periodEnd: "2026-10-31",
        };

        it("accepts a valid draft", () => {
          expect(validateGoalDraft(base)).toEqual({});
        });

        it("rejects a blank or too long title", () => {
          expect(validateGoalDraft({ ...base, title: "   " }).title).toBe("titleRequired");
          expect(validateGoalDraft({ ...base, title: "a".repeat(201) }).title).toBe("titleTooLong");
          expect(validateGoalDraft({ ...base, title: "a".repeat(200) }).title).toBeUndefined();
        });

        it("rejects notes over 2000 characters", () => {
          expect(validateGoalDraft({ ...base, notes: "a".repeat(2001) }).notes).toBe(
            "notesTooLong",
          );
        });

        it("validates the trimmed notes, as the body sends them trimmed", () => {
          const ok = "a".repeat(2000);
          expect(validateGoalDraft({ ...base, notes: `${ok}   \n` }).notes).toBeUndefined();
          expect(validateGoalDraft({ ...base, notes: `  ${ok}` }).notes).toBeUndefined();
          expect(validateGoalDraft({ ...base, notes: "a".repeat(2001) }).notes).toBe(
            "notesTooLong",
          );
        });

        it("rejects impossible calendar dates", () => {
          expect(validateGoalDraft({ ...base, periodStart: "2026-02-30" }).periodStart).toBe(
            "periodStartInvalid",
          );
          expect(validateGoalDraft({ ...base, periodEnd: "" }).periodEnd).toBe("periodEndInvalid");
        });

        it("rejects an end before the start", () => {
          expect(
            validateGoalDraft({ ...base, periodStart: "2026-10-10", periodEnd: "2026-10-09" })
              .periodEnd,
          ).toBe("periodEndBeforeStart");
        });

        it("enforces span limits per horizon", () => {
          expect(
            validateGoalDraft({ ...base, periodStart: "2026-10-01", periodEnd: "2026-11-01" })
              .periodEnd,
          ).toBe("periodTooLong");
          expect(
            validateGoalDraft({
              ...base,
              horizon: "quarter",
              periodStart: "2026-01-01",
              periodEnd: "2026-04-04",
            }).periodEnd,
          ).toBe("periodTooLong");
          expect(
            validateGoalDraft({
              ...base,
              horizon: "quarter",
              periodStart: "2026-10-01",
              periodEnd: "2026-12-31",
            }),
          ).toEqual({});
          expect(
            validateGoalDraft({
              ...base,
              horizon: "year",
              periodStart: "2028-01-01",
              periodEnd: "2028-12-31",
            }),
          ).toEqual({});
          expect(
            validateGoalDraft({
              ...base,
              horizon: "year",
              periodStart: "2026-01-01",
              periodEnd: "2027-01-02",
            }).periodEnd,
          ).toBe("periodTooLong");
        });
      });

      describe("progressLabel", () => {
        it("formats done/total and percent", () => {
          expect(progressLabel({ total: 7, done: 3, open: 4, percent: 43 })).toBe("3/7 · 43%");
        });
        it("renders an empty goal as a dash, never NaN", () => {
          expect(progressLabel({ total: 0, done: 0, open: 0, percent: 0 })).toBe("—");
          expect(progressLabel({ total: 0, done: 0, open: 0, percent: NaN })).toBe("—");
        });
        it("recomputes a non-finite percent from the counts", () => {
          expect(progressLabel({ total: 4, done: 1, open: 3, percent: NaN })).toBe("1/4 · 25%");
        });
      });
    });
  });
});

describe("progressPercent", () => {
  it("clamps to 0..100 and never returns NaN", () => {
    expect(progressPercent({ total: 7, done: 3, open: 4, percent: 43 })).toBe(43);
    expect(progressPercent({ total: 0, done: 0, open: 0, percent: 0 })).toBe(0);
    expect(progressPercent({ total: 4, done: 1, open: 3, percent: NaN })).toBe(25);
    expect(progressPercent({ total: 2, done: 2, open: 0, percent: 180 })).toBe(100);
    expect(progressPercent({ total: 2, done: 0, open: 2, percent: -5 })).toBe(0);
  });
});
