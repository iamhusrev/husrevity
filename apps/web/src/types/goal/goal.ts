export type GoalHorizon = "year" | "quarter" | "month";
export type GoalStatus = "active" | "done" | "dropped";

export interface GoalProgress {
  total: number;
  done: number;
  open: number;
  percent: number;
}

export interface GoalResponse {
  id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  horizon: GoalHorizon;
  /** YYYY-MM-DD, an Europe/Istanbul calendar day. */
  periodStart: string;
  /** YYYY-MM-DD, inclusive. */
  periodEnd: string;
  parentGoalId: string | null;
  status: GoalStatus;
  progress: GoalProgress;
  createdAt: string;
  updatedAt: string;
}

export interface GoalRequest {
  title: string;
  notes?: string | null;
  horizon: GoalHorizon;
  periodStart: string;
  periodEnd: string;
  parentGoalId?: string | null;
  status?: GoalStatus;
}

export type GoalUpdateRequest = Partial<GoalRequest>;

export interface GoalListFilter {
  horizon?: GoalHorizon;
  status?: GoalStatus;
  /** YYYY-MM-DD: goals whose period ends on or after this day. */
  from?: string;
  /** YYYY-MM-DD: goals whose period starts on or before this day. */
  to?: string;
  limit?: number;
}
