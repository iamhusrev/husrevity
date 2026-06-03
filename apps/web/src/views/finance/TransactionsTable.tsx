"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiFilterAlt } from "react-icons/bi";
import { useFinanceTransactions } from "@/hooks/useFinance";
import {
  AccountResponse,
  TransactionResponse,
  formatTRY,
} from "@/types/finance/finance";

export function TransactionsTable({
  accounts,
  onEdit,
}: {
  accounts: AccountResponse[];
  onEdit: (tx: TransactionResponse) => void;
}) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState<"" | "income" | "expense" | "transfer">("");
  const { data, isLoading } = useFinanceTransactions({
    accountId: accountId || undefined,
    kind: kind || undefined,
    limit: 200,
  });

  const txs = data ?? [];

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream inline-flex items-center gap-2">
          <BiFilterAlt /> {t("finance.section.transactions", "İşlemler")}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="husrev-input h-9 w-auto text-xs"
          >
            <option value="">{t("finance.filter.allAccounts", "Tüm hesaplar")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="husrev-input h-9 w-auto text-xs"
          >
            <option value="">{t("finance.filter.allKinds", "Tüm türler")}</option>
            <option value="income">{t("finance.kind.income", "Gelir")}</option>
            <option value="expense">{t("finance.kind.expense", "Gider")}</option>
            <option value="transfer">{t("finance.kind.transfer", "Transfer")}</option>
          </select>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-husrev-sand/40 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : txs.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("finance.empty.tx.title", "Henüz işlem yok")}
        </div>
      ) : (
        <>
          {/* Mobile — card list (table is hard to scan on narrow screens) */}
          <ul className="divide-y divide-husrev-sand/40 dark:divide-white/[0.04] sm:hidden">
            {txs.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => tx.kind !== "transfer" && onEdit(tx)}
                  disabled={tx.kind === "transfer"}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:cursor-default"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                      {tx.description || (
                        <span className="italic text-gray-400">
                          {tx.kind === "transfer"
                            ? t("finance.transfer", "Transfer")
                            : t("finance.untitled", "(Açıklama yok)")}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {new Date(tx.occurredAt).toLocaleDateString("tr-TR")} ·{" "}
                      {accounts.find((a) => a.id === tx.accountId)?.name ?? "—"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 tabular-nums text-sm font-semibold ${
                      tx.kind === "income"
                        ? "text-husrev-moss"
                        : tx.kind === "expense"
                          ? "text-husrev-ember"
                          : "text-gray-500"
                    }`}
                  >
                    {tx.kind === "expense" ? "−" : tx.kind === "income" ? "+" : ""}
                    {formatTRY(tx.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* ≥sm — full table */}
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400">
              <tr className="border-b border-husrev-sand/50">
                <th className="py-2 pr-3">{t("finance.column.date", "Tarih")}</th>
                <th className="py-2 pr-3">{t("finance.column.account", "Hesap")}</th>
                <th className="py-2 pr-3">{t("finance.column.description", "Açıklama")}</th>
                <th className="py-2 pl-3 text-right">{t("finance.column.amount", "Tutar")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-husrev-sand/40 dark:divide-white/[0.04]">
              {txs.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => tx.kind !== "transfer" && onEdit(tx)}
                  className={`${
                    tx.kind === "transfer" ? "" : "cursor-pointer hover:bg-husrev-cream/40 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <td className="py-2 pr-3 tabular-nums text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(tx.occurredAt).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-300 truncate max-w-[160px]">
                    {accounts.find((a) => a.id === tx.accountId)?.name ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-sm text-husrev-ink dark:text-husrev-cream">
                    {tx.description || (
                      <span className="text-gray-400 italic">
                        {tx.kind === "transfer" ? t("finance.transfer", "Transfer") : "—"}
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 pl-3 text-right tabular-nums font-semibold ${
                      tx.kind === "income"
                        ? "text-husrev-moss"
                        : tx.kind === "expense"
                          ? "text-husrev-ember"
                          : "text-gray-500"
                    }`}
                  >
                    {tx.kind === "expense" ? "−" : tx.kind === "income" ? "+" : ""}
                    {formatTRY(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </section>
  );
}
