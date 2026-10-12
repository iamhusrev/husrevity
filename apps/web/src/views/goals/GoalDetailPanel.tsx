"use client";

import React from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { BiCheck, BiX } from "react-icons/bi";
import Dialog from "@/components/ui/Dialog";
import { useCompleteItem, useGoalItems } from "@/hooks/useItems";
import { useNotesLinkedTo } from "@/hooks/useNoteLinks";
import { alertStore } from "@/stores/alert-store";
import { GoalResponse } from "@/types/goal/goal";
import { ItemResponse } from "@/types/item/item";
import { errorMessage } from "@/utils/mutation-error";
import { progressLabel, progressPercent } from "@/utils/goal-tree";
import { formatYmdRange, itemWhenLabel } from "./goal-format";

/** The goal items endpoint caps at 200 and returns recurring items as templates. */
const GOAL_ITEMS_LIMIT = 200;

export interface GoalDetailPanelProps {
  goal: GoalResponse;
  onClose: () => void;
}

function isRecurringTemplate(item: ItemResponse): boolean {
  return Boolean(item.rrule) && !item.occursOn;
}

export default function GoalDetailPanel({ goal, onClose }: GoalDetailPanelProps) {
  const { t, i18n } = useTranslation();

  const itemsQuery = useGoalItems(goal.id);
  const notesQuery = useNotesLinkedTo("goal", goal.id);
  const completeMutation = useCompleteItem();

  const items = itemsQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const pct = progressPercent(goal.progress);

  const handleComplete = (item: ItemResponse) => {
    if (completeMutation.isPending || isRecurringTemplate(item)) return;
    completeMutation.mutate(
      item.occursOn ? { id: item.id, occursOn: item.occursOn } : { id: item.id },
      {
        // useCompleteItem has no hook-level alert (its other callers alert per call).
        onError: (err: unknown) =>
          alertStore.getState().show({
            title: t("goals.detail.completeFailed"),
            message: errorMessage(err),
            type: "error",
          }),
      },
    );
  };

  return (
    <Dialog
      open={true}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
      panelClassName="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-husrev-shadow xl:inset-y-0 xl:left-auto xl:right-0 xl:max-h-none xl:w-[28rem] xl:rounded-none xl:rounded-l-3xl"
      labelledBy="goal-detail-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="goal-detail-title"
            className="break-words text-lg font-semibold text-gray-900 dark:text-white"
          >
            {goal.title}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t(`goals.horizon.${goal.horizon}`)} ·{" "}
            {formatYmdRange(goal.periodStart, goal.periodEnd, i18n.language || "tr")} ·{" "}
            {t(`goals.status.${goal.status}`)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="cursor-pointer rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <BiX size={20} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={t("goals.progressFor", { title: goal.title })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={
            goal.progress.total > 0 ? progressLabel(goal.progress) : t("goals.noWorkYet")
          }
          className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
        >
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-gray-600 dark:text-gray-300">
          {progressLabel(goal.progress)}
        </span>
      </div>

      {goal.notes && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {goal.notes}
        </p>
      )}

      <section className="mt-5" aria-labelledby="goal-detail-work">
        <h3 id="goal-detail-work" className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("goals.detail.linkedWork")}
        </h3>
        {itemsQuery.isLoading ? (
          <p className="mt-2 text-xs text-gray-500">{t("goals.loading")}</p>
        ) : itemsQuery.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {t("goals.detail.itemsError")}
          </p>
        ) : items.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t("goals.detail.noLinkedWork")}
          </p>
        ) : (
          <>
            {items.length >= GOAL_ITEMS_LIMIT && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                {t("goals.detail.itemsTruncated", { count: GOAL_ITEMS_LIMIT })}
              </p>
            )}
            <ul className="m-0 mt-2 list-none space-y-2 p-0">
              {items.map((item) => {
                const when = itemWhenLabel(item);
                const template = isRecurringTemplate(item);
                return (
                  <li
                    key={`${item.id}-${item.occursOn ?? ""}`}
                    data-testid={`goal-item-${item.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-2 dark:border-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm ${
                          item.status === "done"
                            ? "text-gray-400 line-through"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {when ?? t("goals.detail.noTime")} ·{" "}
                        {t(`goals.detail.itemStatus.${item.status}`)}
                        {template && <> · {t("goals.detail.recurring")}</>}
                      </p>
                    </div>
                    {item.status === "open" && !template && (
                      <button
                        type="button"
                        disabled={completeMutation.isPending}
                        aria-label={`${t("goals.detail.complete")}: ${item.title}`}
                        onClick={() => handleComplete(item)}
                        className="cursor-pointer rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30"
                      >
                        <BiCheck size={18} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="mt-5" aria-labelledby="goal-detail-notes">
        <h3 id="goal-detail-notes" className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("goals.detail.linkedNotes")}
        </h3>
        {notesQuery.isLoading ? (
          <p className="mt-2 text-xs text-gray-500">{t("goals.loading")}</p>
        ) : notesQuery.isError ? (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {t("goals.detail.notesError")}
          </p>
        ) : notes.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t("goals.detail.noLinkedNotes")}
          </p>
        ) : (
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {notes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notes/${n.id}`}
                  className="text-sm text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                >
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Dialog>
  );
}
