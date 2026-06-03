"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiPlus } from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";
import { LoanResponse, formatTRY } from "@/types/finance/finance";

type Filter = "all" | "free" | "interest";

function isFree(l: LoanResponse): boolean {
  return l.interestFree || l.interestRate === 0;
}

export function LoansList({
  loans,
  onCreate,
  onOpen,
}: {
  loans: LoanResponse[];
  onCreate: () => void;
  onOpen: (l: LoanResponse) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");

  const totalRemaining = loans
    .filter((l) => !l.settledAt)
    .reduce((s, l) => s + l.remainingAmount, 0);

  const filtered = useMemo(() => {
    const list =
      filter === "all"
        ? loans
        : filter === "free"
          ? loans.filter(isFree)
          : loans.filter((l) => !isFree(l));
    // Open loans first (active before settled), interest-free bubble up within.
    return [...list].sort((a, b) => {
      const settledDiff = Number(!!a.settledAt) - Number(!!b.settledAt);
      if (settledDiff !== 0) return settledDiff;
      return Number(isFree(b)) - Number(isFree(a));
    });
  }, [loans, filter]);

  const FILTERS: [Filter, string][] = [
    ["all", t("finance.loan.filterAll", "Tümü")],
    ["free", t("finance.loan.filterFree", "Faizsiz")],
    ["interest", t("finance.loan.filterInterest", "Faizli")],
  ];

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("finance.section.loans", "Krediler & taksitler")}
          </h3>
          <div className="mt-0.5 tabular-nums text-lg font-semibold text-husrev-ember dark:text-husrev-amber">
            {formatTRY(totalRemaining)}{" "}
            <span className="text-xs font-normal text-gray-400">
              {t("finance.loan.remainingTotal", "kalan")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-husrev-sand/50 p-1 dark:bg-white/[0.06]">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === key
                    ? "bg-husrev-ember text-husrev-cream"
                    : "text-gray-600 hover:text-husrev-ember dark:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onCreate} className="husrev-btn">
            <BiPlus className="h-4 w-4" />
            {t("finance.newLoan", "Kredi ekle")}
          </button>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
            {t("finance.empty.loans.title", "Kayıt yok")}
          </div>
          <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">
            {t(
              "finance.empty.loans.body",
              "Taksitli alışveriş ya da kredilerini ekle; tercihen faizsiz olanları.",
            )}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((l) => {
            const free = isFree(l);
            const progress =
              l.installmentCount > 0
                ? (l.paidCount / l.installmentCount) * 100
                : 0;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onOpen(l)}
                  className={`w-full rounded-2xl bg-white p-4 text-left ring-1 ring-husrev-sand/70 shadow-card-warm husrev-lift focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow dark:ring-white/[0.06] ${
                    l.settledAt ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {free && (
                          <HiSparkles
                            className="h-3.5 w-3.5 flex-none text-husrev-moss"
                            aria-label={t("finance.loan.interestFree", "Faizsiz")}
                          />
                        )}
                        <span className="truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                          {l.name}
                        </span>
                      </div>
                      {l.lender && (
                        <div className="mt-0.5 text-[11px] text-gray-400 truncate">
                          {l.lender}
                        </div>
                      )}
                    </div>
                    <span
                      className={`husrev-pill flex-none ${
                        free ? "text-husrev-moss" : "text-husrev-ember"
                      }`}
                    >
                      {free
                        ? t("finance.loan.zeroInterest", "%0")
                        : `%${l.interestRate ?? "?"}`}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[12px]">
                    <span className="text-gray-500 dark:text-gray-400">
                      {l.installmentCount} × {formatTRY(l.installmentAmount)}
                    </span>
                    <span className="tabular-nums font-semibold text-husrev-ink dark:text-husrev-cream">
                      {l.paidCount}/{l.installmentCount}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-husrev-sand/60 dark:bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-husrev-moss"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                    <span>
                      {l.settledAt
                        ? t("finance.loan.settled", "Bitti")
                        : l.nextDueAt
                          ? `${t("finance.loan.next", "Sıradaki")}: ${new Date(l.nextDueAt).toLocaleDateString("tr-TR")}`
                          : "—"}
                    </span>
                    <span className="tabular-nums">
                      {formatTRY(l.remainingAmount)} {t("finance.loan.remainingTotal", "kalan")}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
