import { GoalHorizon, GoalProgress, GoalResponse } from "@/types/goal/goal";
import { firstDayOfMonthYmd, isRealYmd, lastDayOfMonthYmd, spanDaysYmd } from "./ymd";

/** Mirrors the API rules (apps/api/src/goal/goal.service.ts). */
export const GOAL_TITLE_MAX = 200;
export const GOAL_NOTES_MAX = 2000;
export const GOAL_MAX_SPAN_DAYS: Record<GoalHorizon, number> = {
  year: 366,
  quarter: 93,
  month: 31,
};
const HORIZON_RANK: Record<GoalHorizon, number> = { year: 3, quarter: 2, month: 1 };
/** year -> quarter -> month is three levels; anything deeper is a data error. */
const MAX_TREE_DEPTH = 5;

export interface GoalNode {
  goal: GoalResponse;
  children: GoalNode[];
}

export interface GoalDraft {
  /** Present when editing an existing goal. */
  id?: string;
  title: string;
  notes?: string | null;
  horizon: GoalHorizon;
  periodStart: string;
  periodEnd: string;
  parentGoalId?: string | null;
}

export type GoalDraftErrorCode =
  | "titleRequired"
  | "titleTooLong"
  | "notesTooLong"
  | "periodStartInvalid"
  | "periodEndInvalid"
  | "periodEndBeforeStart"
  | "periodTooLong";

export type GoalDraftErrors = Partial<
  Record<"title" | "notes" | "periodStart" | "periodEnd", GoalDraftErrorCode>
>;

/** Numeric-string compare that is safe for 19-digit bigint ids. */
function compareIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareGoals(a: GoalResponse, b: GoalResponse): number {
  if (a.periodStart !== b.periodStart) return a.periodStart < b.periodStart ? -1 : 1;
  return compareIds(a.id, b.id);
}

/**
 * Builds the year -> quarter -> month forest from a flat list.
 * A goal whose parent is not in the list (deleted, filtered out, foreign) is a root.
 * A cycle or a chain deeper than the cap is broken by treating the goal as a root.
 */
export function buildGoalTree(goals: GoalResponse[]): GoalNode[] {
  const byId = new Map(goals.map((g) => [g.id, g]));

  const hasLiveParentChain = (goal: GoalResponse): boolean => {
    let current: GoalResponse | undefined = goal;
    for (let depth = 1; depth <= MAX_TREE_DEPTH; depth++) {
      const parentId: string | null = current.parentGoalId;
      if (!parentId) return true;
      current = byId.get(parentId);
      if (!current) return true;
    }
    return false;
  };

  const nodes = new Map<string, GoalNode>(goals.map((g) => [g.id, { goal: g, children: [] }]));
  const roots: GoalNode[] = [];

  for (const goal of goals) {
    const node = nodes.get(goal.id) as GoalNode;
    const parent = goal.parentGoalId ? nodes.get(goal.parentGoalId) : undefined;
    if (parent && parent !== node && hasLiveParentChain(goal)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: GoalNode[]) => {
    list.sort((a, b) => compareGoals(a.goal, b.goal));
    list.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

/**
 * Calendar period for a horizon. `index` is ignored for a year, 1..4 for a quarter,
 * 1..12 for a month. Dates are Europe/Istanbul calendar days (no zone maths involved).
 */
export function periodForHorizon(
  horizon: GoalHorizon,
  year: number,
  index: number,
): { periodStart: string; periodEnd: string } {
  if (horizon === "year") {
    return { periodStart: firstDayOfMonthYmd(year, 1), periodEnd: lastDayOfMonthYmd(year, 12) };
  }
  if (horizon === "quarter") {
    if (!Number.isInteger(index) || index < 1 || index > 4) {
      throw new RangeError(`Quarter must be 1..4, got ${index}`);
    }
    const firstMonth = (index - 1) * 3 + 1;
    return {
      periodStart: firstDayOfMonthYmd(year, firstMonth),
      periodEnd: lastDayOfMonthYmd(year, firstMonth + 2),
    };
  }
  if (!Number.isInteger(index) || index < 1 || index > 12) {
    throw new RangeError(`Month must be 1..12, got ${index}`);
  }
  return {
    periodStart: firstDayOfMonthYmd(year, index),
    periodEnd: lastDayOfMonthYmd(year, index),
  };
}

/**
 * Goals that may be the parent of `draft`: a strictly larger horizon whose period
 * contains the draft's period. The goal itself is never offered. Status is not filtered.
 */
export function validParents(draft: GoalDraft, allGoals: GoalResponse[]): GoalResponse[] {
  return allGoals
    .filter(
      (g) =>
        g.id !== draft.id &&
        HORIZON_RANK[g.horizon] > HORIZON_RANK[draft.horizon] &&
        g.periodStart <= draft.periodStart &&
        g.periodEnd >= draft.periodEnd,
    )
    .sort(compareGoals);
}

/** Mirrors the API validation so most mistakes are caught before the request. */
export function validateGoalDraft(draft: GoalDraft): GoalDraftErrors {
  const errors: GoalDraftErrors = {};
  const title = draft.title.trim();
  if (title.length === 0) errors.title = "titleRequired";
  else if (title.length > GOAL_TITLE_MAX) errors.title = "titleTooLong";

  if (draft.notes && draft.notes.trim().length > GOAL_NOTES_MAX) errors.notes = "notesTooLong";

  const startOk = isRealYmd(draft.periodStart);
  const endOk = isRealYmd(draft.periodEnd);
  if (!startOk) errors.periodStart = "periodStartInvalid";
  if (!endOk) errors.periodEnd = "periodEndInvalid";

  if (startOk && endOk) {
    const span = spanDaysYmd(draft.periodStart, draft.periodEnd);
    if (span < 1) errors.periodEnd = "periodEndBeforeStart";
    else if (span > GOAL_MAX_SPAN_DAYS[draft.horizon]) errors.periodEnd = "periodTooLong";
  }
  return errors;
}

/** "3/7 · 43%"; an empty goal renders as an em dash. Never NaN. */
export function progressLabel(progress: GoalProgress): string {
  const total = Number.isFinite(progress.total) ? progress.total : 0;
  if (total <= 0) return "—";
  const done = Number.isFinite(progress.done) ? progress.done : 0;
  const percent = Number.isFinite(progress.percent)
    ? progress.percent
    : Math.round((done / total) * 100);
  return `${done}/${total} · ${Math.round(percent)}%`;
}

/** Bar width 0..100 (integer); an empty goal is 0. Never NaN. */
export function progressPercent(progress: GoalProgress): number {
  const total = Number.isFinite(progress.total) ? progress.total : 0;
  if (total <= 0) return 0;
  const done = Number.isFinite(progress.done) ? progress.done : 0;
  const raw = Number.isFinite(progress.percent) ? progress.percent : (done / total) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}
