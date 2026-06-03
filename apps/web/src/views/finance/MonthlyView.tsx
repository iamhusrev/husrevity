"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BiChevronLeft,
  BiChevronRight,
  BiTrendingUp,
  BiTrendingDown,
  BiTransfer,
  BiCalendarEvent,
} from "react-icons/bi";
import { useFinanceSummary, useFinanceTransactions } from "@/hooks/useFinance";
import {
  AccountResponse,
  TransactionResponse,
  formatTRY,
} from "@/types/finance/finance";

/** Local-time start/end of a calendar month as ISO strings for the API window. */
function monthWindow(year: number, monthIndex: number): { from: string; to: string } {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function MonthlyView({ accounts }: { accounts: AccountResponse[] }) {
  const { t } = useTranslation();
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  const { from, to } = useMemo(
    () => monthWindow(cursor.year, cursor.month),
    [cursor],
  );

  const { data: summary, isLoading: sumLoading } = useFinanceSummary(from, to);
  const { data: txData, isLoading: txLoading } = useFinanceTransactions({
    from,
    to,
    limit: 500,
  });

  const isLoading = sumLoading || txLoading;
  const txs = txData ?? [];

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(
    "tr-TR",
    { month: "long", year: "numeric" },
  );
  const isCurrentMonth =
    cursor.year === now.getFullYear() && cursor.month === now.getMonth();

  // Transfers come as a pair of rows (one per account). Dedupe by pair so the
  // stat counts each movement once — convention matches the API: the lower id
  // is the source side.
  const transferTotal = useMemo(
    () =>
      txs
        .filter(
          (tx) =>
            tx.kind === "transfer" &&
            tx.transferPairId !== null &&
            Number(tx.id) < Number(tx.transferPairId),
        )
        .reduce((sum, tx) => sum + tx.amount, 0),
    [txs],
  );
  const transferCount = useMemo(
    () =>
      txs.filter(
        (tx) =>
          tx.kind === "transfer" &&
          tx.transferPairId !== null &&
          Number(tx.id) < Number(tx.transferPairId),
      ).length,
    [txs],
  );

  // Group transactions by day, newest first, for the ledger view.
  const grouped = useMemo(() => {
    const map = new Map<string, TransactionResponse[]>();
    for (const tx of txs) {
      const k = dayKey(tx.occurredAt);
      const bucket = map.get(k);
      if (bucket) bucket.push(tx);
      else map.set(k, [tx]);
    }
    return [...map.entries()]
      .map(([key, items]) => ({
        key,
        date: new Date(items[0].occurredAt),
        items: [...items].sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [txs]);

  const income = summary?.income ?? 0;
  const expense = summary?.expense ?? 0;
  const net = summary?.net ?? 0;

  const step = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <div className="space-y-6">
      {/* Month navigator + monthly totals */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-husrev-sand/90 bg-gradient-to-br from-white via-husrev-cream/60 to-husrev-sand/40 p-6 grain dark:from-husrev-shadow dark:via-husrev-ink dark:to-husrev-shadow dark:ring-white/[0.06] husrev-settle">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-husrev-amber/10 blur-3xl dark:bg-husrev-amber/15" />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t("finance.month.prev", "Önceki ay")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-husrev-sand/80 bg-white/70 text-husrev-ink transition hover:bg-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-white/[0.04] dark:text-husrev-cream dark:ring-white/[0.08]"
            >
              <BiChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-[10rem] text-center">
              <div className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
                {t("finance.month.kicker", "Aylık defter")}
              </div>
              <div className="font-instrument-serif italic text-2xl capitalize text-husrev-ink dark:text-husrev-cream">
                {monthLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t("finance.month.next", "Sonraki ay")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-husrev-sand/80 bg-white/70 text-husrev-ink transition hover:bg-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-white/[0.04] dark:text-husrev-cream dark:ring-white/[0.08]"
            >
              <BiChevronRight className="h-5 w-5" />
            </button>
          </div>

          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
              className="husrev-btn-ghost"
            >
              <BiCalendarEvent className="h-4 w-4" />
              {t("finance.month.today", "Bu ay")}
            </button>
          )}
        </div>

        <div className="relative mt-6 grid gap-4 sm:grid-cols-3">
          <MonthStat
            kicker={t("finance.stat.monthIncome", "Gelir")}
            value={summary ? formatTRY(income) : "—"}
            icon={<BiTrendingUp className="h-4 w-4" />}
            tone="moss"
          />
          <MonthStat
            kicker={t("finance.stat.monthExpense", "Gider")}
            value={summary ? formatTRY(expense) : "—"}
            icon={<BiTrendingDown className="h-4 w-4" />}
            tone="ember"
          />
          <MonthStat
            kicker={t("finance.stat.monthNet", "Net")}
            value={summary ? formatTRY(net) : "—"}
            icon={<BiTransfer className="h-4 w-4" />}
            tone={net < 0 ? "ember" : "moss"}
          />
        </div>

        {transferCount > 0 && (
          <div className="relative mt-4 border-t border-husrev-sand/60 pt-3 text-[12px] text-gray-500 dark:border-white/[0.06] dark:text-gray-400">
            {t("finance.month.transfersSummary", "Transferler")}:{" "}
            <span className="font-semibold text-husrev-ink dark:text-husrev-cream tabular-nums">
              {transferCount}
            </span>{" "}
            · <span className="tabular-nums">{formatTRY(transferTotal)}</span>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily ledger */}
        <div className="lg:col-span-2">
          <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
            <h3 className="mb-3 text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
              {t("finance.month.movements", "Bu ayki hareketler")}
            </h3>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
                  />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                  {t("finance.month.empty.title", "Bu ay hareket yok")}
                </div>
                <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    "finance.month.empty.body",
                    "Seçtiğin ayda gelir, gider veya transfer kaydı bulunmuyor.",
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map((day) => {
                  const dayNet = day.items.reduce(
                    (sum, tx) =>
                      tx.kind === "income"
                        ? sum + tx.amount
                        : tx.kind === "expense"
                          ? sum - tx.amount
                          : sum,
                    0,
                  );
                  return (
                    <div key={day.key}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                          {day.date.toLocaleDateString("tr-TR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                        {dayNet !== 0 && (
                          <span
                            className={`tabular-nums text-[11px] font-semibold ${
                              dayNet > 0 ? "text-husrev-moss" : "text-husrev-ember"
                            }`}
                          >
                            {dayNet > 0 ? "+" : "−"}
                            {formatTRY(Math.abs(dayNet))}
                          </span>
                        )}
                      </div>
                      <ul className="divide-y divide-husrev-sand/40 dark:divide-white/[0.04]">
                        {day.items.map((tx) => (
                          <li
                            key={tx.id}
                            className="flex items-center gap-3 py-2"
                          >
                            <div
                              className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${
                                tx.kind === "income"
                                  ? "bg-husrev-moss/15 text-husrev-moss"
                                  : tx.kind === "expense"
                                    ? "bg-husrev-ember/15 text-husrev-ember"
                                    : "bg-husrev-amber/15 text-husrev-amber"
                              }`}
                            >
                              {tx.kind === "income" ? (
                                <BiTrendingUp className="h-4 w-4" />
                              ) : tx.kind === "expense" ? (
                                <BiTrendingDown className="h-4 w-4" />
                              ) : (
                                <BiTransfer className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                                {tx.description ||
                                  (tx.kind === "transfer"
                                    ? t("finance.transfer", "Transfer")
                                    : t("finance.untitled", "(Açıklama yok)"))}
                              </div>
                              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                {accounts.find((a) => a.id === tx.accountId)?.name ?? "—"}
                              </div>
                            </div>
                            <div
                              className={`tabular-nums text-sm font-semibold ${
                                tx.kind === "income"
                                  ? "text-husrev-moss"
                                  : tx.kind === "expense"
                                    ? "text-husrev-ember"
                                    : "text-gray-500"
                              }`}
                            >
                              {tx.kind === "expense"
                                ? "−"
                                : tx.kind === "income"
                                  ? "+"
                                  : ""}
                              {formatTRY(tx.amount)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Category breakdown for the month */}
        <div className="space-y-6">
          <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
            <h3 className="mb-3 text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
              {t("finance.section.byCategory", "Kategoriye göre")}
            </h3>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 rounded-lg bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
                  />
                ))}
              </div>
            ) : !summary || summary.byCategory.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                {t("finance.month.empty.byCategory", "Bu ay kategorili işlem yok.")}
              </p>
            ) : (
              <ul className="space-y-2">
                {summary.byCategory.map((c, i) => {
                  const total = c.kind === "income" ? income : expense;
                  const pct = total > 0 ? (c.total / total) * 100 : 0;
                  return (
                    <li key={`${c.categoryName}-${i}`}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 flex-none rounded-full ${
                              c.kind === "income" ? "bg-husrev-moss" : "bg-husrev-ember"
                            }`}
                          />
                          <span className="truncate text-husrev-ink dark:text-husrev-cream">
                            {c.categoryName}
                          </span>
                        </span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400">
                          {formatTRY(c.total)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-husrev-sand/50 dark:bg-white/[0.06]">
                        <div
                          className={
                            c.kind === "income"
                              ? "h-full bg-husrev-moss"
                              : "h-full bg-husrev-ember"
                          }
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MonthStat({
  kicker,
  value,
  icon,
  tone,
}: {
  kicker: string;
  value: string;
  icon: React.ReactNode;
  tone: "moss" | "ember";
}) {
  const toneClass = tone === "moss" ? "text-husrev-moss" : "text-husrev-ember";
  return (
    <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-husrev-sand/70 dark:bg-white/[0.03] dark:ring-white/[0.06]">
      <div className="flex items-center gap-2 text-husrev-amber/80">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-husrev-amber/15">
          {icon}
        </span>
        <span className="husrev-kicker">{kicker}</span>
      </div>
      <div className={`mt-2 tabular-nums text-xl font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
