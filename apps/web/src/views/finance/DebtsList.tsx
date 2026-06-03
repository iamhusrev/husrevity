"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiPlus } from "react-icons/bi";
import { useFinanceDebts } from "@/hooks/useFinance";
import { DebtResponse, formatTRY } from "@/types/finance/finance";

export function DebtsList({
  debts,
  onEdit,
  onCreate,
}: {
  debts: DebtResponse[];
  onEdit: (d: DebtResponse) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const [showSettled, setShowSettled] = useState(false);
  const all = useFinanceDebts(false);

  const list = showSettled ? all.data ?? debts : debts;
  const iOwe = list.filter((d) => d.direction === "i_owe");
  const owedToMe = list.filter((d) => d.direction === "owed_to_me");

  const totalIOwe = iOwe
    .filter((d) => !d.settledAt)
    .reduce((s, d) => s + d.remainingAmount, 0);
  const totalOwed = owedToMe
    .filter((d) => !d.settledAt)
    .reduce((s, d) => s + d.remainingAmount, 0);

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
          {t("finance.section.debtsAll", "Borçlar & alacaklar")}
        </h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={showSettled}
              onChange={(e) => setShowSettled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-husrev-sand text-husrev-ember focus:ring-husrev-amber"
            />
            {t("finance.debt.showSettled", "Kapanmış olanları göster")}
          </label>
          <button type="button" onClick={onCreate} className="husrev-btn">
            <BiPlus className="h-4 w-4" />
            {t("finance.newDebt", "Borç ekle")}
          </button>
        </div>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat
          kicker={t("finance.debt.totalIOwe", "Kalan borcum")}
          value={formatTRY(totalIOwe)}
          tone="ember"
        />
        <Stat
          kicker={t("finance.debt.totalOwedToMe", "Kalan alacağım")}
          value={formatTRY(totalOwed)}
          tone="moss"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <DebtColumn
          title={t("finance.debt.iOweTitle", "Borçlarım")}
          items={iOwe}
          onEdit={onEdit}
          tone="ember"
        />
        <DebtColumn
          title={t("finance.debt.owedToMeTitle", "Alacaklarım")}
          items={owedToMe}
          onEdit={onEdit}
          tone="moss"
        />
      </div>
    </section>
  );
}

function Stat({ kicker, value, tone }: { kicker: string; value: string; tone: "ember" | "moss" }) {
  return (
    <div
      className={`rounded-xl p-3 ring-1 ${
        tone === "ember"
          ? "bg-husrev-ember/10 ring-husrev-ember/20"
          : "bg-husrev-moss/10 ring-husrev-moss/20"
      }`}
    >
      <div className="husrev-kicker text-gray-500 dark:text-gray-400">{kicker}</div>
      <div className={`mt-1 tabular-nums text-xl font-semibold ${tone === "ember" ? "text-husrev-ember" : "text-husrev-moss"}`}>
        {value}
      </div>
    </div>
  );
}

function DebtColumn({
  title,
  items,
  onEdit,
  tone,
}: {
  title: string;
  items: DebtResponse[];
  onEdit: (d: DebtResponse) => void;
  tone: "ember" | "moss";
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="husrev-kicker text-gray-500 dark:text-gray-400 mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-xl bg-husrev-cream/40 p-4 text-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          {t("finance.empty.debts.title", "Kayıt yok")}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onEdit(d)}
                className={`w-full rounded-xl bg-white p-3 text-left ring-1 ring-husrev-sand/70 shadow-card-warm husrev-lift focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow dark:ring-white/[0.06] ${
                  d.settledAt ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-husrev-ink dark:text-husrev-cream truncate">
                    {d.counterparty}
                  </span>
                  <span
                    className={`tabular-nums text-sm font-semibold ${
                      tone === "ember" ? "text-husrev-ember" : "text-husrev-moss"
                    }`}
                  >
                    {formatTRY(d.settledAt ? d.principalAmount : d.remainingAmount)}
                  </span>
                </div>
                {!d.settledAt && d.paidAmount > 0 && (
                  <div className="mt-1.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-husrev-sand/60 dark:bg-white/[0.08]">
                      <div
                        className={`h-full ${tone === "ember" ? "bg-husrev-moss" : "bg-husrev-amber"}`}
                        style={{
                          width: `${Math.min((d.paidAmount / d.principalAmount) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-400">
                      {t("finance.debt.pay.paidSoFar", "Ödenen")}{" "}
                      {formatTRY(d.paidAmount)} / {formatTRY(d.principalAmount)}
                    </div>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>
                    {d.dueAt
                      ? new Date(d.dueAt).toLocaleDateString("tr-TR")
                      : t("finance.debt.noDueDate", "Vade yok")}
                  </span>
                  {d.settledAt && (
                    <span className="husrev-pill">
                      {t("finance.debt.settledTag", "Kapandı")}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
