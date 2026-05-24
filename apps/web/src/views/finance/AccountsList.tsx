"use client";

import { useTranslation } from "react-i18next";
import { BiPlus } from "react-icons/bi";
import { AccountResponse, formatTRY } from "@/types/finance/finance";

const TYPE_LABELS: Record<string, string> = {
  bank: "Banka",
  card: "Kart",
  cash: "Nakit",
  savings: "Birikim",
};

export function AccountsList({
  accounts,
  onEdit,
  onCreate,
}: {
  accounts: AccountResponse[];
  onEdit: (a: AccountResponse) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
          {t("finance.section.accountsAll", "Tüm hesaplar")}
        </h3>
        <button type="button" onClick={onCreate} className="husrev-btn">
          <BiPlus className="h-4 w-4" />
          {t("finance.newAccount", "Hesap ekle")}
        </button>
      </header>
      {accounts.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("finance.empty.accounts.title", "Henüz hesap yok")}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onEdit(a)}
                className={`w-full text-left rounded-2xl bg-white p-4 ring-1 ring-husrev-sand/80 shadow-card-warm husrev-lift focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow dark:ring-white/[0.06] ${
                  a.archived ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="husrev-kicker text-gray-400">
                    {TYPE_LABELS[a.type] ?? a.type}
                  </div>
                  {a.archived && (
                    <span className="husrev-pill">
                      {t("finance.account.archivedTag", "Arşiv")}
                    </span>
                  )}
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
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {t("finance.account.openingShort", "Açılış")}: {formatTRY(a.openingBalance)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
