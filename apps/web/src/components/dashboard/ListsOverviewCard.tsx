"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTodoLists } from "@/hooks/useLists";
import { listService } from "@/services/list-service";
import { TodoListItemResponse } from "@/types/list/list";

export default function ListsOverviewCard() {
  const { t } = useTranslation();
  const { data: listsData, isLoading, isError, refetch } = useTodoLists();

  const lists = useMemo(
    () => (listsData ?? []).filter((l) => !l.archived),
    [listsData],
  );

  // One items query per list. This is an N+1 fan-out; acceptable for the
  // dashboard's small list count. TODO: collapse into a single aggregate
  // endpoint (e.g. GET /lists?withCounts=true) if list counts grow.
  const itemQueries = useQueries({
    queries: lists.map((l) => ({
      queryKey: ["list-items", l.id] as const,
      queryFn: () => listService.listItems(l.id),
      select: (d: { data: TodoListItemResponse[] }) => d.data,
      enabled: l.id > 0,
    })),
  });

  const rows = lists.map((l, i) => {
    const items = (itemQueries[i]?.data as TodoListItemResponse[] | undefined) ?? [];
    const total = items.length;
    const done = items.filter((it) => it.done).length;
    return { id: l.id, name: l.name, done, total };
  });

  const itemsLoading = itemQueries.some((q) => q.isLoading);

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          {t("dashboard.listsOverview.title")}
        </h3>
        <Link href="/lists" className="text-xs text-brand-500 hover:underline">
          {t("dashboard.listsOverview.link")} →
        </Link>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 rounded-xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
            />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex items-center justify-between gap-3 py-2 text-sm text-error-500">
          <span>{t("dashboard.listsOverview.error")}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded px-2 py-1 text-xs text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!isLoading && !isError && lists.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-400">
          {t("dashboard.listsOverview.empty")}
        </p>
      )}

      {!isLoading && !isError && lists.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const pct = row.total > 0 ? (row.done / row.total) * 100 : 0;
            const complete = row.total > 0 && row.done === row.total;
            return (
              <li key={row.id}>
                <Link
                  href={`/lists/${row.id}`}
                  className="block rounded-xl border border-gray-100 p-3 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-gray-800 dark:text-white/90">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                      {itemsLoading && row.total === 0
                        ? "…"
                        : t("dashboard.listsOverview.progress", {
                            done: row.done,
                            total: row.total,
                          })}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className={`h-full transition-all ${complete ? "bg-husrev-moss" : "bg-husrev-amber"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
