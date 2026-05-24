"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  useFinanceAccounts,
  useFinanceDebts,
  useFinanceSummary,
  useFinanceTransactions,
} from "@/hooks/useFinance";
import {
  AccountResponse,
  DebtResponse,
  TransactionResponse,
  formatTRY,
} from "@/types/finance/finance";
import {
  BiPlus,
  BiTrendingUp,
  BiTrendingDown,
  BiWallet,
  BiTransfer,
} from "react-icons/bi";
import { HiArrowRight } from "react-icons/hi2";
import { TransactionModal } from "./TransactionModal";
import { TransferModal } from "./TransferModal";
import { AccountModal } from "./AccountModal";
import { DebtModal } from "./DebtModal";
import { TransactionsTable } from "./TransactionsTable";
import { DebtsList } from "./DebtsList";
import { AccountsList } from "./AccountsList";

type Tab = "overview" | "transactions" | "accounts" | "debts";

const ACCOUNT_TYPE_LABELS_TR: Record<string, string> = {
  bank: "Banka",
  card: "Kart",
  cash: "Nakit",
  savings: "Birikim",
};

function relativeDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return "Bugün";
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (isYesterday) return "Dün";
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  });
}

export default function FinancePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  const [txModal, setTxModal] = useState<{
    open: boolean;
    initial: TransactionResponse | null;
  }>({ open: false, initial: null });
  const [transferOpen, setTransferOpen] = useState(false);
  const [accountModal, setAccountModal] = useState<{
    open: boolean;
    initial: AccountResponse | null;
  }>({ open: false, initial: null });
  const [debtModal, setDebtModal] = useState<{
    open: boolean;
    initial: DebtResponse | null;
  }>({ open: false, initial: null });

  const { data: summary, isLoading: sumLoading } = useFinanceSummary();
  const { data: accounts, isLoading: accLoading } = useFinanceAccounts();
  const { data: openDebts } = useFinanceDebts(true);
  const { data: recentTx, isLoading: txLoading } = useFinanceTransactions({
    limit: 8,
  });

  const totalBalance = useMemo(
    () =>
      (accounts ?? [])
        .filter((a) => !a.archived)
        .reduce((sum, a) => sum + a.balance, 0),
    [accounts],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: t("finance.tab.overview", "Özet") },
    { id: "transactions", label: t("finance.tab.transactions", "İşlemler") },
    { id: "accounts", label: t("finance.tab.accounts", "Hesaplar") },
    { id: "debts", label: t("finance.tab.debts", "Borçlar") },
  ];

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("finance.title", "Finans")}
        kicker={t("finance.kicker", "Para defteri")}
        flourish={t("finance.flourish", "ekonomim")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav role="tablist" className="flex flex-wrap gap-1">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              role="tab"
              aria-selected={tab === tb.id}
              onClick={() => setTab(tb.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
                tab === tb.id
                  ? "bg-husrev-ember text-husrev-cream"
                  : "text-gray-600 hover:bg-husrev-sand/40 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTransferOpen(true)}
            className="husrev-btn-ghost"
          >
            <BiTransfer className="h-4 w-4" />
            {t("finance.newTransfer", "Transfer")}
          </button>
          <button
            type="button"
            onClick={() => setTxModal({ open: true, initial: null })}
            className="husrev-btn"
          >
            <BiPlus className="h-4 w-4" />
            {t("finance.newTransaction", "Yeni işlem")}
          </button>
        </div>
      </div>

      {/* Hero — totals */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-husrev-sand/90 bg-gradient-to-br from-white via-husrev-cream/60 to-husrev-sand/40 p-7 grain dark:from-husrev-shadow dark:via-husrev-ink dark:to-husrev-shadow dark:ring-white/[0.06] husrev-settle">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-husrev-amber/10 blur-3xl dark:bg-husrev-amber/15" />
        <div className="grid gap-6 sm:grid-cols-3">
          <HeroStat
            kicker={t("finance.stat.totalBalance", "Toplam servet")}
            value={sumLoading ? "—" : formatTRY(totalBalance)}
            icon={<BiWallet className="h-5 w-5" />}
            tone="neutral"
          />
          <HeroStat
            kicker={t("finance.stat.monthIncome", "Bu ay gelir")}
            value={summary ? formatTRY(summary.income) : "—"}
            icon={<BiTrendingUp className="h-5 w-5" />}
            tone="moss"
          />
          <HeroStat
            kicker={t("finance.stat.monthExpense", "Bu ay gider")}
            value={summary ? formatTRY(summary.expense) : "—"}
            icon={<BiTrendingDown className="h-5 w-5" />}
            tone="ember"
          />
        </div>
        {summary && (
          <div className="mt-5">
            <div className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80 mb-1.5">
              {t("finance.netLabel", "Net")} · {formatTRY(summary.net)}
            </div>
            <IncomeExpenseBar income={summary.income} expense={summary.expense} />
          </div>
        )}
      </section>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Account snapshots */}
          <div className="lg:col-span-2 space-y-6">
            <Section title={t("finance.section.accounts", "Hesaplar")}>
              {accLoading ? (
                <SkeletonGrid />
              ) : (accounts ?? []).filter((a) => !a.archived).length === 0 ? (
                <Empty
                  title={t("finance.empty.accounts.title", "İlk hesabını ekle")}
                  body={t(
                    "finance.empty.accounts.body",
                    "Banka, kart veya nakit cüzdan — gelirlerini ve giderlerini onlara bağlayacaksın.",
                  )}
                  action={
                    <button
                      type="button"
                      onClick={() => setAccountModal({ open: true, initial: null })}
                      className="husrev-btn"
                    >
                      <BiPlus className="h-4 w-4" />
                      {t("finance.newAccount", "Hesap ekle")}
                    </button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(accounts ?? [])
                    .filter((a) => !a.archived)
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAccountModal({ open: true, initial: a })}
                        className="group relative overflow-hidden rounded-2xl bg-white text-left ring-1 ring-husrev-sand/80 p-4 shadow-card-warm husrev-lift focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow dark:ring-white/[0.06]"
                      >
                        <div className="husrev-kicker text-gray-400">
                          {ACCOUNT_TYPE_LABELS_TR[a.type] ?? a.type}
                        </div>
                        <div className="mt-1 text-base font-medium text-husrev-ink dark:text-husrev-cream truncate">
                          {a.name}
                        </div>
                        <div
                          className={`mt-2 tabular-nums text-lg font-semibold ${
                            a.balance < 0 ? "text-error-500" : "text-husrev-ink dark:text-husrev-cream"
                          }`}
                        >
                          {formatTRY(a.balance)}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </Section>

            <Section
              title={t("finance.section.recent", "Son işlemler")}
              action={
                <button
                  type="button"
                  onClick={() => setTab("transactions")}
                  className="text-xs text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber rounded inline-flex items-center gap-1"
                >
                  {t("finance.viewAll", "Tümü")} <HiArrowRight className="h-3 w-3" />
                </button>
              }
            >
              {txLoading ? (
                <SkeletonRows />
              ) : (recentTx ?? []).length === 0 ? (
                <Empty
                  title={t("finance.empty.tx.title", "Henüz işlem yok")}
                  body={t("finance.empty.tx.body", "Bir gelir/gider girerek başla.")}
                />
              ) : (
                <ul className="divide-y divide-husrev-sand/50 dark:divide-white/[0.04]">
                  {(recentTx ?? []).map((tx) => (
                    <li key={tx.id}>
                      <button
                        type="button"
                        onClick={() =>
                          tx.kind !== "transfer" &&
                          setTxModal({ open: true, initial: tx })
                        }
                        disabled={tx.kind === "transfer"}
                        className="flex w-full items-center gap-3 py-2.5 text-left disabled:cursor-default focus-visible:outline-hidden focus-visible:bg-husrev-cream/40 rounded-lg px-2"
                      >
                        <div
                          className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${
                            tx.kind === "income"
                              ? "bg-husrev-moss/15 text-husrev-moss"
                              : tx.kind === "expense"
                                ? "bg-husrev-ember/15 text-husrev-ember"
                                : "bg-husrev-amber/15 text-husrev-amber"
                          }`}
                        >
                          {tx.kind === "income" ? (
                            <BiTrendingUp />
                          ) : tx.kind === "expense" ? (
                            <BiTrendingDown />
                          ) : (
                            <BiTransfer />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-husrev-ink dark:text-husrev-cream truncate">
                            {tx.description ||
                              (tx.kind === "transfer"
                                ? t("finance.transfer", "Transfer")
                                : t("finance.untitled", "(Açıklama yok)"))}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">
                            {relativeDayLabel(tx.occurredAt)} ·{" "}
                            {accountName(accounts, tx.accountId)}
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
                          {tx.kind === "expense" ? "−" : tx.kind === "income" ? "+" : ""}
                          {formatTRY(tx.amount)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* Upcoming debts */}
          <div className="space-y-6">
            <Section
              title={t("finance.section.upcoming", "Yaklaşan borçlar")}
              action={
                <button
                  type="button"
                  onClick={() => setTab("debts")}
                  className="text-xs text-husrev-ember hover:underline rounded inline-flex items-center gap-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
                >
                  {t("finance.viewAll", "Tümü")} <HiArrowRight className="h-3 w-3" />
                </button>
              }
            >
              {(summary?.upcomingDebts ?? []).length === 0 ? (
                <Empty
                  title={t("finance.empty.debts.title", "Sırada bekleyen borç yok")}
                  body={t(
                    "finance.empty.debts.body",
                    "Vadesi yaklaşan borçlar burada görünür.",
                  )}
                />
              ) : (
                <ul className="space-y-2">
                  {(summary?.upcomingDebts ?? []).map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setDebtModal({ open: true, initial: d })}
                        className="block w-full rounded-xl bg-husrev-cream/50 p-3 text-left ring-1 ring-husrev-sand/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-white/[0.03] dark:ring-white/[0.06]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-husrev-ink dark:text-husrev-cream truncate">
                            {d.counterparty}
                          </span>
                          <span
                            className={`husrev-pill ${
                              d.direction === "i_owe"
                                ? "text-husrev-ember"
                                : "text-husrev-moss"
                            }`}
                          >
                            {d.direction === "i_owe"
                              ? t("finance.debt.iOwe", "Borçluyum")
                              : t("finance.debt.owedToMe", "Alacak")}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[12px] text-gray-500 dark:text-gray-400">
                          <span>
                            {d.dueAt
                              ? new Date(d.dueAt).toLocaleDateString("tr-TR")
                              : "—"}
                          </span>
                          <span className="tabular-nums font-semibold text-husrev-ink dark:text-husrev-cream">
                            {formatTRY(d.principalAmount)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {summary && summary.byCategory.length > 0 && (
              <Section title={t("finance.section.byCategory", "Kategoriye göre")}>
                <CategoryBreakdown
                  items={summary.byCategory}
                  totalIncome={summary.income}
                  totalExpense={summary.expense}
                />
              </Section>
            )}
          </div>
        </div>
      )}

      {tab === "transactions" && (
        <TransactionsTable
          accounts={accounts ?? []}
          onEdit={(tx) => setTxModal({ open: true, initial: tx })}
        />
      )}

      {tab === "accounts" && (
        <AccountsList
          accounts={accounts ?? []}
          onEdit={(a) => setAccountModal({ open: true, initial: a })}
          onCreate={() => setAccountModal({ open: true, initial: null })}
        />
      )}

      {tab === "debts" && (
        <DebtsList
          debts={openDebts ?? []}
          onEdit={(d) => setDebtModal({ open: true, initial: d })}
          onCreate={() => setDebtModal({ open: true, initial: null })}
        />
      )}

      {txModal.open && (
        <TransactionModal
          initial={txModal.initial}
          accounts={accounts ?? []}
          onClose={() => setTxModal({ open: false, initial: null })}
        />
      )}
      {transferOpen && (
        <TransferModal
          accounts={accounts ?? []}
          onClose={() => setTransferOpen(false)}
        />
      )}
      {accountModal.open && (
        <AccountModal
          initial={accountModal.initial}
          onClose={() => setAccountModal({ open: false, initial: null })}
        />
      )}
      {debtModal.open && (
        <DebtModal
          initial={debtModal.initial}
          onClose={() => setDebtModal({ open: false, initial: null })}
        />
      )}
    </div>
  );
}

function HeroStat({
  kicker,
  value,
  icon,
  tone,
}: {
  kicker: string;
  value: string;
  icon: React.ReactNode;
  tone: "neutral" | "moss" | "ember";
}) {
  const toneClass = {
    neutral: "text-husrev-ink dark:text-husrev-cream",
    moss: "text-husrev-moss",
    ember: "text-husrev-ember",
  }[tone];
  return (
    <div>
      <div className="flex items-center gap-2 text-husrev-amber/80">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-husrev-amber/15">
          {icon}
        </span>
        <span className="husrev-kicker">{kicker}</span>
      </div>
      <div className={`mt-2 font-instrument-serif italic text-3xl md:text-4xl tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function IncomeExpenseBar({ income, expense }: { income: number; expense: number }) {
  const total = income + expense;
  if (total <= 0) {
    return (
      <div className="h-2 w-full rounded-full bg-husrev-sand dark:bg-white/[0.06]" />
    );
  }
  const incomePct = (income / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full ring-1 ring-husrev-sand/60 dark:ring-white/[0.06]">
      <div
        className="bg-husrev-moss"
        style={{ width: `${incomePct}%` }}
        aria-label="Gelir oranı"
      />
      <div
        className="bg-husrev-ember"
        style={{ width: `${100 - incomePct}%` }}
        aria-label="Gider oranı"
      />
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <div className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
        {title}
      </div>
      <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-24 rounded-2xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
        />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-lg bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
        />
      ))}
    </div>
  );
}

function CategoryBreakdown({
  items,
  totalIncome,
  totalExpense,
}: {
  items: { categoryName: string; kind: "income" | "expense"; total: number }[];
  totalIncome: number;
  totalExpense: number;
}) {
  return (
    <ul className="space-y-2">
      {items.slice(0, 8).map((c, i) => {
        const total = c.kind === "income" ? totalIncome : totalExpense;
        const pct = total > 0 ? (c.total / total) * 100 : 0;
        return (
          <li key={`${c.categoryName}-${i}`}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-husrev-ink dark:text-husrev-cream truncate">
                {c.categoryName}
              </span>
              <span className="tabular-nums text-gray-500 dark:text-gray-400">
                {formatTRY(c.total)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-husrev-sand/50 dark:bg-white/[0.06]">
              <div
                className={c.kind === "income" ? "bg-husrev-moss h-full" : "bg-husrev-ember h-full"}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function accountName(
  accounts: AccountResponse[] | undefined,
  accountId: string,
): string {
  return accounts?.find((a) => a.id === accountId)?.name ?? "—";
}
