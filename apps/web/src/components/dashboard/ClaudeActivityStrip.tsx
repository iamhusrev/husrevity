"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useChangeSets, useUndoChangeSet } from "@/hooks/useChangeSets";
import { ChangeSetSource, ChangeSetStatus, UndoResponse } from "@/types/change-set/change-set";
import { alertStore } from "@/stores/alert-store";
import { BiUndo, BiCheck, BiErrorCircle } from "react-icons/bi";

function formatRelativeTime(
  dateIso: string,
  t: (key: string, opts?: { count?: number }) => string,
): string {
  const diffMs = Date.now() - new Date(dateIso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return t("claudeActivity.timeAgo.justNow");
  if (diffHours < 1) return t("claudeActivity.timeAgo.minutesAgo", { count: diffMin });
  if (diffDays < 1) return t("claudeActivity.timeAgo.hoursAgo", { count: diffHours });
  return t("claudeActivity.timeAgo.daysAgo", { count: diffDays });
}

function resolveReasonText(reason: string, t: (key: string) => string): string {
  const lower = reason.toLowerCase();
  if (lower === "not_owner" || lower.includes("not owner")) {
    return t("claudeActivity.reasons.not_owner");
  }
  if (lower === "no_access" || lower.includes("access") || lower.includes("permission")) {
    return t("claudeActivity.reasons.no_access");
  }
  if (lower === "modified_after" || lower.includes("modified after")) {
    return t("claudeActivity.reasons.modified_after");
  }
  if (lower.includes("item not found")) {
    return t("claudeActivity.reasons.item_not_found");
  }
  if (lower.includes("occurrence not found")) {
    return t("claudeActivity.reasons.occurrence_not_found");
  }
  return reason || t("claudeActivity.reasons.unknown");
}

function getStatusBadgeClass(status: ChangeSetStatus): string {
  switch (status) {
    case "applied":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400";
    case "undone":
      return "bg-gray-100 text-gray-600 ring-1 ring-gray-500/20 dark:bg-white/[0.06] dark:text-gray-400";
    case "partially_undone":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

function getSourceLabel(source: ChangeSetSource | string, t: (key: string) => string): string {
  if (source === "mcp") return t("claudeActivity.sources.mcp");
  if (source === "web") return t("claudeActivity.sources.web");
  if (source === "telegram") return t("claudeActivity.sources.telegram");
  if (source === "slack") return t("claudeActivity.sources.slack");
  if (source === "system") return t("claudeActivity.sources.system");
  return source;
}

export default function ClaudeActivityStrip() {
  const { t } = useTranslation();
  const { data: changeSets, isLoading, isError } = useChangeSets(5);
  const undoMutation = useUndoChangeSet();
  const [undoResult, setUndoResult] = useState<UndoResponse | null>(null);

  // If loading, error, or no change sets exist, do not display the strip
  if (isLoading || isError || !changeSets || changeSets.length === 0) {
    return null;
  }

  const handleUndo = (id: string) => {
    setUndoResult(null);
    undoMutation.mutate(id, {
      onSuccess: (res) => {
        setUndoResult(res.data);
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        alertStore.getState().show({
          title: t("common.error"),
          message: msg || t("common.error"),
          type: "error",
        });
      },
    });
  };

  return (
    <section
      aria-label={t("claudeActivity.title")}
      className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white/80 p-4 shadow-card-warm backdrop-blur-sm dark:bg-husrev-shadow/80 dark:ring-white/[0.06] space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
          <h3 className="text-sm font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("claudeActivity.title")}
          </h3>
        </div>
      </div>

      {undoResult && (
        <div
          className={`rounded-xl p-3 text-xs ${
            undoResult.undoneEntries === 0 || undoResult.conflicts.length > 0
              ? "bg-amber-50 text-amber-900 ring-1 ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
              : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          <div className="flex items-center gap-1.5 font-medium">
            {undoResult.undoneEntries === 0 || undoResult.conflicts.length > 0 ? (
              <BiErrorCircle size={16} className="shrink-0" />
            ) : (
              <BiCheck size={16} className="shrink-0" />
            )}
            <span>
              {undoResult.undoneEntries === 0
                ? t("claudeActivity.undoNone")
                : t("claudeActivity.undoSuccess", { count: undoResult.undoneEntries })}
            </span>
          </div>
          {undoResult.conflicts.length > 0 && (
            <div className="mt-2 pl-5 space-y-1">
              <p className="font-semibold">
                {t("claudeActivity.undoConflictWarning", { count: undoResult.conflicts.length })}
              </p>
              <ul className="list-disc space-y-0.5">
                {undoResult.conflicts.map((conflict, i) => (
                  <li key={`${conflict.targetId}-${i}`}>{resolveReasonText(conflict.reason, t)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
        {changeSets.slice(0, 5).map((cs) => {
          const canUndo = cs.status === "applied" || cs.status === "partially_undone";
          const isPending = undoMutation.isPending && undoMutation.variables === cs.id;

          return (
            <li
              key={cs.id}
              className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                    cs.source === "mcp"
                      ? "bg-brand-50 text-brand-600 ring-1 ring-brand-500/20 dark:bg-brand-500/10 dark:text-brand-400"
                      : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
                  }`}
                >
                  {getSourceLabel(cs.source, t)}
                </span>
                <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {cs.label}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatRelativeTime(cs.createdAt, t)}
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                    cs.status,
                  )}`}
                >
                  {t(`claudeActivity.status.${cs.status}`)}
                </span>

                {canUndo && (
                  <button
                    type="button"
                    onClick={() => handleUndo(cs.id)}
                    disabled={isPending}
                    aria-label={`${t("claudeActivity.undo")}: ${cs.label}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/[0.06] cursor-pointer disabled:cursor-not-allowed"
                  >
                    <BiUndo size={14} className="shrink-0" />
                    <span>
                      {isPending ? t("claudeActivity.undoing") : t("claudeActivity.undo")}
                    </span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
