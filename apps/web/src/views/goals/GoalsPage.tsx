"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiChevronLeft, BiChevronRight, BiPlus } from "react-icons/bi";
import { useDeleteGoal, useGoals, useRestoreGoal, useUpdateGoal } from "@/hooks/useGoals";
import { useIstanbulToday } from "@/hooks/useIstanbulToday";
import { showUndoToast } from "@/stores/alert-store";
import { GoalResponse, GoalStatus } from "@/types/goal/goal";
import { buildGoalTree } from "@/utils/goal-tree";
import { firstDayOfMonthYmd, lastDayOfMonthYmd } from "@/utils/ymd";
import GoalTree from "./GoalTree";
import GoalFormDialog from "./GoalFormDialog";
import GoalDetailPanel from "./GoalDetailPanel";

/** The API caps a goal list at 200 rows; hitting it means the year may have more. */
export const GOAL_LIST_LIMIT = 200;

type StatusFilter = GoalStatus | "all";
const STATUS_FILTERS: StatusFilter[] = ["active", "done", "dropped", "all"];

type FormState = { mode: "create" } | { mode: "edit"; goal: GoalResponse } | null;

export default function GoalsPage() {
  const { t } = useTranslation();
  const todayYmd = useIstanbulToday();
  const todayYear = Number(todayYmd.slice(0, 4));

  // The year being looked at is user state: it is initialised from Istanbul "today"
  // and only follows it through the "this year" button.
  const [year, setYear] = useState(todayYear);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [form, setForm] = useState<FormState>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const from = firstDayOfMonthYmd(year, 1);
  const to = lastDayOfMonthYmd(year, 12);

  const { data, isLoading, isError, refetch } = useGoals({
    status: status === "all" ? undefined : status,
    from,
    to,
    limit: GOAL_LIST_LIMIT,
  });

  const updateMutation = useUpdateGoal();
  const deleteMutation = useDeleteGoal();
  const restoreMutation = useRestoreGoal();
  const busy = updateMutation.isPending || deleteMutation.isPending || restoreMutation.isPending;

  const goals = useMemo(() => data ?? [], [data]);
  const tree = useMemo(() => buildGoalTree(goals), [goals]);
  const detailGoal = detailId ? (goals.find((g) => g.id === detailId) ?? null) : null;

  // A goal that vanished (deleted, or filtered out) takes its panel with it.
  useEffect(() => {
    if (detailId && data && !detailGoal) setDetailId(null);
  }, [detailId, data, detailGoal]);

  const handleSetStatus = (goal: GoalResponse, next: GoalStatus) => {
    if (busy) return;
    updateMutation.mutate({ id: goal.id, body: { status: next } });
  };

  const handleDelete = (goal: GoalResponse) => {
    if (busy) return;
    deleteMutation.mutate(goal.id, {
      onSuccess: () =>
        showUndoToast({
          title: t("goals.deleted"),
          message: t("goals.deletedMessage", { title: goal.title }),
          actionLabel: t("common.undo"),
          onUndo: () => restoreMutation.mutate(goal.id),
        }),
    });
  };

  const truncated = goals.length >= GOAL_LIST_LIMIT;

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            data-testid="goals-heading"
            className="font-serif text-2xl italic text-gray-900 dark:text-white sm:text-3xl"
          >
            {t("goals.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("goals.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ mode: "create" })}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
        >
          <BiPlus size={16} />
          {t("goals.newGoal")}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("goals.prevYear")}
            onClick={() => setYear((y) => y - 1)}
            className="cursor-pointer rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <BiChevronLeft size={20} />
          </button>
          <span
            data-testid="goals-year"
            aria-live="polite"
            className="min-w-16 text-center text-lg font-semibold tabular-nums text-gray-900 dark:text-white"
          >
            {year}
          </span>
          <button
            type="button"
            aria-label={t("goals.nextYear")}
            onClick={() => setYear((y) => y + 1)}
            className="cursor-pointer rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <BiChevronRight size={20} />
          </button>
          <button
            type="button"
            aria-label={t("goals.thisYear")}
            onClick={() => setYear(todayYear)}
            className="ml-1 cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {t("goals.thisYear")}
          </button>
        </div>

        <select
          aria-label={t("goals.statusFilter")}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {t(s === "all" ? "goals.statusAll" : `goals.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div
          data-testid="goals-skeleton"
          className="animate-pulse space-y-2"
          aria-label={t("goals.loading")}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-white/[0.03]" />
          ))}
        </div>
      ) : isError ? (
        <div
          data-testid="goals-error"
          className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 p-12 text-center dark:border-red-900/30 dark:bg-red-950/10"
        >
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("goals.error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 cursor-pointer rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            {t("goals.retry")}
          </button>
        </div>
      ) : goals.length === 0 ? (
        <div
          data-testid="goals-empty"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-white/10"
        >
          <p className="text-base font-semibold text-gray-800 dark:text-white">
            {t("goals.empty", { year })}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("goals.emptyHint")}</p>
          <button
            type="button"
            onClick={() => setForm({ mode: "create" })}
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
          >
            <BiPlus size={16} />
            {t("goals.newGoal")}
          </button>
        </div>
      ) : (
        <>
          {truncated && (
            <p
              data-testid="goals-truncated"
              className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
            >
              {t("goals.truncated", { count: GOAL_LIST_LIMIT })}
            </p>
          )}
          <GoalTree
            nodes={tree}
            busy={busy}
            onOpen={(g) => setDetailId(g.id)}
            onEdit={(g) => setForm({ mode: "edit", goal: g })}
            onSetStatus={handleSetStatus}
            onDelete={handleDelete}
          />
        </>
      )}

      {detailGoal && !form && (
        <GoalDetailPanel goal={detailGoal} onClose={() => setDetailId(null)} />
      )}

      {form && (
        <GoalFormDialog
          goal={form.mode === "edit" ? form.goal : undefined}
          defaultYear={year}
          todayYmd={todayYmd}
          knownGoals={goals}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
