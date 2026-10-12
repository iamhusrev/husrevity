"use client";

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateGoal, useGoals, useUpdateGoal } from "@/hooks/useGoals";
import { GoalHorizon, GoalResponse } from "@/types/goal/goal";
import {
  GOAL_NOTES_MAX,
  GOAL_TITLE_MAX,
  GoalDraft,
  GoalDraftErrors,
  periodForHorizon,
  validateGoalDraft,
  validParents,
} from "@/utils/goal-tree";
import { errorMessage } from "@/utils/mutation-error";
import Dialog from "@/components/ui/Dialog";

const HORIZONS: GoalHorizon[] = ["year", "quarter", "month"];
const FIELD =
  "mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white";

export interface GoalFormDialogProps {
  /** Present when editing. */
  goal?: GoalResponse;
  defaultYear: number;
  todayYmd: string;
  /** Goals already loaded by the page; used to label the current parent while candidates load. */
  knownGoals?: GoalResponse[];
  onClose: () => void;
}

/** Splits an existing goal into picker values when its period is a calendar year/quarter/month. */
function pickerFromGoal(goal: GoalResponse): { year: number; index: number } | null {
  const year = Number(goal.periodStart.slice(0, 4));
  const month = Number(goal.periodStart.slice(5, 7));
  const index =
    goal.horizon === "year" ? 1 : goal.horizon === "quarter" ? Math.ceil(month / 3) : month;
  try {
    const p = periodForHorizon(goal.horizon, year, index);
    if (p.periodStart === goal.periodStart && p.periodEnd === goal.periodEnd) {
      return { year, index };
    }
  } catch {
    return null;
  }
  return null;
}

export default function GoalFormDialog({
  goal,
  defaultYear,
  todayYmd,
  knownGoals,
  onClose,
}: GoalFormDialogProps) {
  const { t } = useTranslation();

  const createMutation = useCreateGoal({ inlineErrors: true });
  const updateMutation = useUpdateGoal({ inlineErrors: true });
  const pending = createMutation.isPending || updateMutation.isPending;

  const initialPicker = goal ? pickerFromGoal(goal) : null;
  const todayYear = Number(todayYmd.slice(0, 4));
  const todayMonth = Number(todayYmd.slice(5, 7));

  const [horizon, setHorizon] = useState<GoalHorizon>(goal?.horizon ?? "month");
  const [year, setYear] = useState<number>(initialPicker?.year ?? defaultYear);
  const [index, setIndex] = useState<number>(
    initialPicker?.index ?? (defaultYear === todayYear ? todayMonth : 1),
  );
  // Goals created elsewhere (e.g. through Claude) may have a non-calendar period.
  const customPeriod = Boolean(goal) && !initialPicker;
  const [customStart, setCustomStart] = useState(goal?.periodStart ?? "");
  const [customEnd, setCustomEnd] = useState(goal?.periodEnd ?? "");
  const [title, setTitle] = useState(goal?.title ?? "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [parentGoalId, setParentGoalId] = useState(goal?.parentGoalId ?? "");
  // When editing, the parent is only sent if the user actually changed it.
  const [parentTouched, setParentTouched] = useState(false);
  const [errors, setErrors] = useState<GoalDraftErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const base = initialPicker?.year ?? defaultYear;
    return Array.from({ length: 6 }, (_, i) => base - 2 + i);
  }, [initialPicker, defaultYear]);

  // Quarter index is 1..4; keep it valid when the horizon changes.
  const effectiveIndex = horizon === "quarter" ? Math.min(Math.max(index, 1), 4) : index;

  const period = useMemo(() => {
    if (customPeriod) return { periodStart: customStart, periodEnd: customEnd };
    return periodForHorizon(horizon, year, horizon === "year" ? 1 : effectiveIndex);
  }, [customPeriod, customStart, customEnd, horizon, year, effectiveIndex]);

  const draft: GoalDraft = {
    id: goal?.id,
    title,
    notes: notes || null,
    horizon,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    parentGoalId: parentGoalId || null,
  };

  // Parent candidates are loaded for the draft's own period (not the page's year).
  const candidatesQuery = useGoals(
    period.periodStart && period.periodEnd
      ? { from: period.periodStart, to: period.periodEnd, limit: 200 }
      : undefined,
  );
  const parents = useMemo(
    () => validParents(draft, candidatesQuery.data ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidatesQuery.data, horizon, period.periodStart, period.periodEnd, goal?.id],
  );
  // A parent chosen before the period changed may no longer qualify.
  const parentStillValid = !parentGoalId || parents.some((p) => p.id === parentGoalId);
  // An untouched parent is shown as-is (the server decides whether it still fits);
  // only a parent the user picked is dropped when the period change invalidates it.
  const keepUntouchedParent = Boolean(goal) && !parentTouched;
  const effectiveParentId = parentStillValid || keepUntouchedParent ? parentGoalId : "";
  const candidatesUnavailable =
    Boolean(goal) && (candidatesQuery.isLoading || candidatesQuery.isError);
  const parentLockedOption =
    effectiveParentId && !parents.some((p) => p.id === effectiveParentId)
      ? (knownGoals ?? []).find((g) => g.id === effectiveParentId)
      : undefined;

  // `index` is a quarter (1..4) while the horizon is a quarter and a month (1..12) otherwise
  // (a year keeps the month), so converting on each switch keeps the picked period.
  const handleHorizonChange = (next: GoalHorizon) => {
    if (next === horizon) return;
    if (horizon === "quarter") {
      setIndex((Math.min(Math.max(index, 1), 4) - 1) * 3 + 1);
    } else if (next === "quarter") {
      setIndex(Math.ceil(Math.min(Math.max(index, 1), 12) / 3));
    }
    setHorizon(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const found = validateGoalDraft(draft);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    const body = {
      title: title.trim(),
      notes: notes.trim() ? notes.trim() : null,
      horizon,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      ...(!goal || parentTouched ? { parentGoalId: effectiveParentId || null } : {}),
    };
    const callbacks = {
      onSuccess: () => onClose(),
      onError: (err: unknown) => setServerError(errorMessage(err)),
    };
    if (goal) updateMutation.mutate({ id: goal.id, body }, callbacks);
    else createMutation.mutate(body, callbacks);
  };

  const errorText = (code: string | undefined) => (code ? t(`goals.errors.${code}`) : null);

  return (
    <Dialog
      open={true}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      panelClassName="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-gray-200 dark:bg-husrev-shadow dark:ring-white/10"
      labelledBy="goal-form-title"
      panelAs="form"
      panelProps={{ onSubmit: handleSubmit, noValidate: true }}
    >
      <h2 id="goal-form-title" className="text-base font-semibold text-gray-900 dark:text-white">
        {goal ? t("goals.form.editTitle") : t("goals.form.newTitle")}
      </h2>

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {t("goals.field.horizon")}
        <select
          value={horizon}
          onChange={(e) => handleHorizonChange(e.target.value as GoalHorizon)}
          disabled={customPeriod}
          className={FIELD}
        >
          {HORIZONS.map((h) => (
            <option key={h} value={h}>
              {t(`goals.horizon.${h}`)}
            </option>
          ))}
        </select>
      </label>

      {customPeriod ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("goals.form.customPeriodHint")}
          </p>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            {t("goals.field.periodStart")}
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className={FIELD}
            />
            {errors.periodStart && (
              <span role="alert" className="mt-1 block text-xs text-red-600">
                {errorText(errors.periodStart)}
              </span>
            )}
          </label>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            {t("goals.field.periodEnd")}
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className={FIELD}
            />
            {errors.periodEnd && (
              <span role="alert" className="mt-1 block text-xs text-red-600">
                {errorText(errors.periodEnd)}
              </span>
            )}
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <label className="min-w-24 flex-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            {t("goals.field.year")}
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={FIELD}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {horizon === "quarter" && (
            <label className="min-w-24 flex-1 text-xs font-medium text-gray-700 dark:text-gray-300">
              {t("goals.field.quarter")}
              <select
                value={effectiveIndex}
                onChange={(e) => setIndex(Number(e.target.value))}
                className={FIELD}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {t("goals.quarterOption", { n: q })}
                  </option>
                ))}
              </select>
            </label>
          )}
          {horizon === "month" && (
            <label className="min-w-24 flex-1 text-xs font-medium text-gray-700 dark:text-gray-300">
              {t("goals.field.month")}
              <select
                value={effectiveIndex}
                onChange={(e) => setIndex(Number(e.target.value))}
                className={FIELD}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {t(`goals.monthName.${m}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {t("goals.field.title")}
        <input
          type="text"
          value={title}
          maxLength={GOAL_TITLE_MAX + 50}
          onChange={(e) => setTitle(e.target.value)}
          data-autofocus
          className={FIELD}
        />
        {errors.title && (
          <span role="alert" className="mt-1 block text-xs text-red-600">
            {errorText(errors.title)}
          </span>
        )}
      </label>

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {t("goals.field.notes")}
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={FIELD}
        />
        <span className="mt-1 block text-[11px] text-gray-400">
          {notes.trim().length}/{GOAL_NOTES_MAX}
        </span>
        {errors.notes && (
          <span role="alert" className="mt-1 block text-xs text-red-600">
            {errorText(errors.notes)}
          </span>
        )}
      </label>

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {t("goals.field.parent")}
        <select
          value={effectiveParentId}
          onChange={(e) => {
            setParentTouched(true);
            setParentGoalId(e.target.value);
          }}
          disabled={candidatesUnavailable}
          className={FIELD}
        >
          <option value="">{t("goals.parentNone")}</option>
          {effectiveParentId && !parents.some((p) => p.id === effectiveParentId) && (
            <option value={effectiveParentId}>
              {parentLockedOption
                ? `${parentLockedOption.title} · ${t(`goals.horizon.${parentLockedOption.horizon}`)}`
                : t("goals.parentCurrent")}
            </option>
          )}
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} · {t(`goals.horizon.${p.horizon}`)}
            </option>
          ))}
        </select>
      </label>

      {!customPeriod && errors.periodEnd && (
        <p role="alert" className="text-xs text-red-600">
          {errorText(errors.periodEnd)}
        </p>
      )}
      {serverError && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-300"
        >
          {serverError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"
        >
          {t("goals.cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-xl bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? t("goals.saving") : t("goals.save")}
        </button>
      </div>
    </Dialog>
  );
}
