"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import {
  useCreateDebt,
  useDeleteDebt,
  useSettleDebt,
  useUpdateDebt,
} from "@/hooks/useFinance";
import {
  DebtRequest,
  DebtResponse,
  FinanceDebtDirection,
} from "@/types/finance/finance";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const NOTIFY_OPTIONS: [string, string][] = [
  ["", "Kapalı"],
  ["0", "Tam saatinde"],
  ["60", "1 saat önce"],
  ["1440", "1 gün önce"],
  ["10080", "1 hafta önce"],
];

export function DebtModal({
  initial,
  onClose,
}: {
  initial: DebtResponse | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateDebt();
  const update = useUpdateDebt();
  const settle = useSettleDebt();
  const remove = useDeleteDebt();

  const [direction, setDirection] = useState<FinanceDebtDirection>(
    initial?.direction ?? "i_owe",
  );
  const [counterparty, setCounterparty] = useState(initial?.counterparty ?? "");
  const [amount, setAmount] = useState(
    initial ? String(initial.principalAmount) : "",
  );
  const [dueAt, setDueAt] = useState(toLocalInput(initial?.dueAt));
  const [interestRate, setInterestRate] = useState(
    initial?.interestRate != null ? String(initial.interestRate) : "",
  );
  const [notifyMinutesBefore, setNotifyMinutesBefore] = useState<string>(
    initial?.notifyMinutesBefore != null ? String(initial.notifyMinutesBefore) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const body: DebtRequest = {
      direction,
      counterparty: counterparty.trim(),
      principalAmount: amt,
      interestRate: interestRate ? Number(interestRate) : null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      notifyMinutesBefore:
        notifyMinutesBefore === "" ? null : Number(notifyMinutesBefore),
      notes: notes.trim() || null,
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleSettle = async () => {
    if (!initial) return;
    try {
      await settle.mutateAsync(initial.id);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const openDelete = () => {
    if (!initial) return;
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    if (!initial) return;
    try {
      await remove.mutateAsync(initial.id);
      setConfirmingDelete(false);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const pending =
    create.isPending || update.isPending || settle.isPending || remove.isPending;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="space-y-1">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {initial ? t("finance.modal.editKicker", "Düzenle") : t("finance.modal.newKicker", "Yeni")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("finance.debt.title", "Borç")}
            </h3>
          </div>
          {initial && (
            <button
              type="button"
              onClick={openDelete}
              disabled={pending}
              aria-label={t("common.delete", "Sil")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-husrev-sand/50 p-1 dark:bg-white/[0.06]">
            <button
              type="button"
              onClick={() => setDirection("i_owe")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                direction === "i_owe"
                  ? "bg-husrev-ember text-husrev-cream"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {t("finance.debt.iOwe", "Borçluyum")}
            </button>
            <button
              type="button"
              onClick={() => setDirection("owed_to_me")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                direction === "owed_to_me"
                  ? "bg-husrev-moss text-husrev-cream"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {t("finance.debt.owedToMe", "Alacağım")}
            </button>
          </div>

          <Field label={t("finance.debt.counterparty", "Karşı taraf")}>
            <input
              required
              maxLength={160}
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              className="husrev-input"
              autoFocus
              placeholder={direction === "i_owe" ? "Garanti BBVA" : "Ahmet"}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("finance.field.amount", "Tutar (₺)")}>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="husrev-input tabular-nums"
              />
            </Field>
            <Field label={t("finance.debt.interest", "Faiz (%)")}>
              <input
                type="number"
                step="0.01"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="husrev-input tabular-nums"
                placeholder="0,00"
              />
            </Field>
          </div>

          <Field label={t("finance.debt.dueAt", "Vade tarihi")}>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="husrev-input"
            />
          </Field>

          {dueAt && (
            <Field label={t("finance.field.notifyBefore", "Hatırlatma")}>
              <div className="flex flex-wrap gap-1.5">
                {NOTIFY_OPTIONS.map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNotifyMinutesBefore(val)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      notifyMinutesBefore === val
                        ? "bg-husrev-ember text-husrev-cream"
                        : "bg-husrev-sand/50 text-gray-700 hover:bg-husrev-amber/15 dark:bg-white/[0.06] dark:text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label={t("finance.field.notes", "Not")}>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="husrev-input resize-none"
            />
          </Field>

          {initial && (
            <div className="rounded-xl bg-husrev-cream/40 p-3 ring-1 ring-husrev-sand/60 dark:bg-white/[0.03] dark:ring-white/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {initial.settledAt
                    ? t("finance.debt.settledOn", "Kapatıldı: {{date}}", {
                        date: new Date(initial.settledAt).toLocaleDateString("tr-TR"),
                      })
                    : t("finance.debt.openStatus", "Açık borç")}
                </div>
                <button
                  type="button"
                  onClick={handleSettle}
                  disabled={pending}
                  className={initial.settledAt ? "husrev-btn-ghost" : "husrev-btn"}
                >
                  {initial.settledAt
                    ? t("finance.debt.reopen", "Tekrar aç")
                    : t("finance.debt.settle", "Kapattım")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="husrev-btn-ghost">
            {t("common.cancel", "İptal")}
          </button>
          <button type="submit" disabled={pending} className="husrev-btn">
            {pending
              ? t("common.saving", "Kaydediliyor…")
              : initial
                ? t("common.save", "Kaydet")
                : t("common.create", "Oluştur")}
          </button>
        </div>
      </form>

      <DeleteConfirmModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        isPending={remove.isPending}
        title={t("finance.debt.confirmDeleteTitle", "Borcu sil")}
        message={t(
          "finance.debt.confirmDelete",
          "Bu borç kaydını silmek istediğine emin misin?",
        )}
      />
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="husrev-kicker text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}
