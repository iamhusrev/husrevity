"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { isAxiosError } from "axios";
import { BiRecycle, BiUndo } from "react-icons/bi";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import { useRestoreDeleted, useTrash } from "@/hooks/useTrash";
import { alertStore } from "@/stores/alert-store";
import { TRASH_KINDS, TrashEntry, TrashKind } from "@/types/trash/trash";
import { parseAxiosError } from "@/utils/handleError";
import { formatDateTime, getDateLocale } from "@/utils/i18n-date";
import { formatRelativeTime } from "./relative-time";

type KindFilter = TrashKind | "all";

/**
 * Literal `t()` calls on purpose: the static i18n check only sees literal keys, so a template
 * string built from the kind would slip past it.
 */
function kindLabel(t: TFunction, kind: TrashKind): string {
  switch (kind) {
    case "task":
      return t("trash.kind.task", "Task");
    case "project":
      return t("trash.kind.project", "Project");
    case "reminder":
      return t("trash.kind.reminder", "Reminder");
    case "reminder_list":
      return t("trash.kind.reminder_list", "Reminder list");
    case "calendar_event":
      return t("trash.kind.calendar_event", "Calendar event");
    case "goal":
      return t("trash.kind.goal", "Goal");
  }
}

const KIND_BADGE: Record<TrashKind, string> = {
  task: "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/20 dark:text-husrev-amber",
  project: "bg-husrev-ember/10 text-husrev-ember dark:bg-husrev-ember/25 dark:text-husrev-amber",
  reminder: "bg-husrev-moss/10 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream",
  reminder_list: "bg-husrev-moss/10 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream",
  calendar_event: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300",
  goal: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

const entryKey = (entry: Pick<TrashEntry, "kind" | "id">) => `${entry.kind}:${entry.id}`;

export default function TrashPage() {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const [filter, setFilter] = useState<KindFilter>("all");
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useTrash(filter === "all" ? [] : [filter]);
  const restore = useRestoreDeleted();
  // Rows restored in this session disappear at once instead of waiting for the refetch.
  const [restoredKeys, setRestoredKeys] = useState<Set<string>>(() => new Set());
  const entries = (data ?? []).filter((entry) => !restoredKeys.has(entryKey(entry)));
  const pendingKey = restore.isPending && restore.variables ? entryKey(restore.variables) : null;

  const restoreEntry = (entry: TrashEntry) => {
    restore.mutate(entry, {
      onSuccess: () => {
        setRestoredKeys((prev) => new Set(prev).add(entryKey(entry)));
        showAlert({
          title: t("trash.restored", "Restored"),
          message: entry.title,
          type: "success",
          position: "top-center",
        });
      },
      onError: (err) => {
        // Already restored (or removed) elsewhere: the row is stale, so reload the list.
        if (isAxiosError(err) && err.response?.status === 404) void refetch();
        const { message } = parseAxiosError(err);
        showAlert({
          title: t("trash.restoreFailed", "Could not restore"),
          message,
          type: "error",
          position: "top-center",
        });
      },
    });
  };

  const chips: { id: KindFilter; label: string }[] = [
    { id: "all", label: t("trash.kind.all", "All") },
    ...TRASH_KINDS.map((kind) => ({ id: kind, label: kindLabel(t, kind) })),
  ];

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("trash.title", "Recently deleted")}
        kicker={t("trash.kicker", "Settings")}
      />
      <p className="max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">
        {t(
          "trash.intro",
          "Deleted tasks, projects, reminders, events and goals are kept here until you restore them.",
        )}
      </p>

      <div
        role="group"
        aria-label={t("trash.filterLabel", "Filter by kind")}
        className="flex flex-wrap gap-2"
      >
        {chips.map((chip) => {
          const pressed = filter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => setFilter(chip.id)}
              className={`h-10 rounded-full px-4 text-sm font-medium ring-1 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
                pressed
                  ? "bg-husrev-ink text-husrev-cream ring-husrev-ink dark:bg-husrev-cream dark:text-husrev-ink dark:ring-husrev-cream"
                  : "bg-white text-gray-700 ring-husrev-sand hover:bg-husrev-cream/60 dark:bg-husrev-shadow dark:text-gray-200 dark:ring-white/[0.08] dark:hover:bg-white/[0.04]"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl ring-1 ring-husrev-sand bg-white px-4 py-3 text-sm text-error-500 dark:bg-husrev-shadow dark:ring-white/[0.06]"
        >
          <span>{t("trash.error", "Deleted items could not be loaded.")}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded px-2 py-1 text-xs text-husrev-ember hover:underline dark:text-husrev-amber"
          >
            {t("common.retry", "Retry")}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3" role="status">
          <span className="sr-only">{t("trash.loading", "Loading deleted items…")}</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              data-testid="trash-skeleton"
              aria-hidden="true"
              className="h-16 rounded-2xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50 dark:bg-white/[0.04]"
            />
          ))}
        </div>
      )}

      {!isLoading && !isError && entries.length === 0 && (
        <div className="rounded-2xl ring-1 ring-husrev-sand bg-white px-6 py-12 text-center shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-husrev-moss/10 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream">
            <BiRecycle size={20} />
          </div>
          <div className="husrev-kicker text-husrev-amber">
            {t("trash.empty.kicker", "Nothing deleted")}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
            {filter === "all"
              ? t("trash.empty.body", "Anything you delete will show up here, ready to bring back.")
              : t("trash.empty.filtered", "Nothing of this kind has been deleted.")}
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => {
            const key = entryKey(entry);
            const isRestoring = pendingKey === key;
            return (
              <li
                key={key}
                className="flex flex-col gap-3 rounded-2xl ring-1 ring-husrev-sand bg-white p-4 shadow-card-warm sm:flex-row sm:items-center sm:justify-between dark:bg-husrev-shadow dark:ring-white/[0.06]"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-[0.08em] ${KIND_BADGE[entry.kind]}`}
                    >
                      {kindLabel(t, entry.kind)}
                    </span>
                    {entry.projectName && (
                      <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {entry.projectName}
                      </span>
                    )}
                  </div>
                  <p className="break-words text-[15px] font-medium text-husrev-ink dark:text-husrev-cream">
                    {entry.title}
                  </p>
                  <time
                    dateTime={entry.deletedAt}
                    title={formatDateTime(entry.deletedAt)}
                    className="block text-xs text-gray-500 dark:text-gray-400"
                  >
                    {t("trash.deletedAgo", "Deleted {{when}}", {
                      when: formatRelativeTime(entry.deletedAt, new Date(), getDateLocale()),
                    })}
                  </time>
                </div>
                <button
                  type="button"
                  onClick={() => restoreEntry(entry)}
                  disabled={restore.isPending}
                  aria-label={
                    isRestoring
                      ? t("trash.restoringItem", "Restoring {{title}}…", { title: entry.title })
                      : t("trash.restoreItem", "Restore {{title}}", { title: entry.title })
                  }
                  className="husrev-btn-ghost h-10 shrink-0 self-start px-4 text-sm sm:self-center"
                >
                  <BiUndo className="h-4 w-4" aria-hidden="true" />
                  {isRestoring ? t("trash.restoring", "Restoring…") : t("trash.restore", "Restore")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="husrev-btn-ghost h-10 px-5 text-sm"
          >
            {isFetchingNextPage
              ? t("trash.loadingMore", "Loading…")
              : t("trash.loadMore", "Load more")}
          </button>
        </div>
      )}
    </div>
  );
}
