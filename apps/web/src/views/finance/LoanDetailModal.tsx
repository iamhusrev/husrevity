"use client";

import { useTranslation } from "react-i18next";
import { BiCheck, BiPencil, BiX } from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";
import { usePayInstallment } from "@/hooks/useFinance";
import { InstallmentResponse, LoanResponse, formatTRY } from "@/types/finance/finance";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

export function LoanDetailModal({
  loan,
  onClose,
  onEdit,
}: {
  loan: LoanResponse;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const pay = usePayInstallment();

  const progress =
    loan.installmentCount > 0
      ? (loan.paidCount / loan.installmentCount) * 100
      : 0;
  const isFree = loan.interestFree || loan.interestRate === 0;

  const togglePay = async (inst: InstallmentResponse) => {
    try {
      await pay.mutateAsync({ loanId: loan.id, installmentId: inst.id });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl husrev-modal grain p-5 sm:p-7 husrev-settle"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isFree && (
                <span className="inline-flex items-center gap-1 rounded-full bg-husrev-moss/15 px-2 py-0.5 text-[11px] font-medium text-husrev-moss">
                  <HiSparkles className="h-3 w-3" />
                  {t("finance.loan.interestFree", "Faizsiz")}
                </span>
              )}
              {loan.lender && (
                <span className="husrev-kicker text-gray-400">{loan.lender}</span>
              )}
            </div>
            <h3 className="truncate text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {loan.name}
            </h3>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label={t("common.edit", "Düzenle")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-sand/50 hover:text-husrev-ink dark:hover:bg-white/5 dark:hover:text-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
            >
              <BiPencil size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.cancel", "Kapat")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-sand/50 hover:text-husrev-ink dark:hover:bg-white/5 dark:hover:text-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
            >
              <BiX size={20} />
            </button>
          </div>
        </div>

        {/* Progress summary */}
        <div className="mt-5 rounded-2xl bg-husrev-cream/40 p-4 ring-1 ring-husrev-sand/60 dark:bg-white/[0.03] dark:ring-white/[0.06]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("finance.loan.remaining", "Kalan")}
              </div>
              <div className="tabular-nums text-2xl font-semibold text-husrev-ember dark:text-husrev-amber">
                {formatTRY(loan.remainingAmount)}
              </div>
            </div>
            <div className="text-right">
              <div className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("finance.loan.paidOf", "Ödenen")}
              </div>
              <div className="tabular-nums text-lg font-semibold text-husrev-moss">
                {loan.paidCount}/{loan.installmentCount}
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-husrev-sand/60 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-husrev-moss transition-[width] duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Schedule */}
        <ul className="mt-5 space-y-1.5">
          {loan.installments.map((inst) => {
            const paid = inst.paidAt !== null;
            return (
              <li key={inst.id}>
                <button
                  type="button"
                  onClick={() => togglePay(inst)}
                  disabled={pay.isPending}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber disabled:opacity-60 ${
                    paid
                      ? "bg-husrev-moss/8 ring-husrev-moss/20"
                      : "bg-white ring-husrev-sand/70 hover:bg-husrev-cream/50 dark:bg-husrev-shadow dark:ring-white/[0.06] dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ring-1 transition ${
                      paid
                        ? "bg-husrev-moss text-white ring-husrev-moss"
                        : "bg-transparent text-transparent ring-husrev-sand dark:ring-white/20"
                    }`}
                  >
                    <BiCheck size={15} />
                  </span>
                  <span className="w-6 flex-none tabular-nums text-xs text-gray-400">
                    {inst.sequence}.
                  </span>
                  <span
                    className={`flex-1 text-sm ${
                      paid
                        ? "text-gray-400 line-through dark:text-gray-500"
                        : "text-husrev-ink dark:text-husrev-cream"
                    }`}
                  >
                    {new Date(inst.dueAt).toLocaleDateString("tr-TR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span
                    className={`tabular-nums text-sm font-semibold ${
                      paid
                        ? "text-husrev-moss"
                        : "text-husrev-ink dark:text-husrev-cream"
                    }`}
                  >
                    {formatTRY(inst.amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
