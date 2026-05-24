"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateTransfer } from "@/hooks/useFinance";
import { AccountResponse, TransferRequest } from "@/types/finance/finance";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TransferModal({
  accounts,
  onClose,
}: {
  accounts: AccountResponse[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateTransfer();
  const eligible = accounts.filter((a) => !a.archived);
  const [fromId, setFromId] = useState(eligible[0]?.id ?? "");
  const [toId, setToId] = useState(eligible[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date()));
  const [description, setDescription] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (fromId === toId) {
      showAlert({
        title: t("common.error"),
        message: t("finance.transfer.sameAccount", "Kaynak ve hedef hesap aynı olamaz."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    const body: TransferRequest = {
      fromAccountId: fromId,
      toAccountId: toId,
      amount: amt,
      occurredAt: new Date(occurredAt).toISOString(),
      description: description.trim() || null,
    };
    try {
      await create.mutateAsync(body);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1 mb-5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("finance.transfer.kicker", "Hesaplar arası")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("finance.transfer.title", "Transfer")}
          </h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("finance.transfer.from", "Kaynak")}>
              <select required value={fromId} onChange={(e) => setFromId(e.target.value)} className="husrev-input">
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t("finance.transfer.to", "Hedef")}>
              <select required value={toId} onChange={(e) => setToId(e.target.value)} className="husrev-input">
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t("finance.field.amount", "Tutar (₺)")}>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="husrev-input tabular-nums text-lg font-semibold"
              autoFocus
              placeholder="0,00"
            />
          </Field>

          <Field label={t("finance.field.occurredAt", "Tarih")}>
            <input
              type="datetime-local"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="husrev-input"
            />
          </Field>

          <Field label={t("finance.field.description", "Açıklama")}>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="husrev-input"
              placeholder={t("finance.placeholders.transferDescription", "Örn. Maaş transferi")}
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={create.isPending} className="husrev-btn-ghost">
            {t("common.cancel", "İptal")}
          </button>
          <button type="submit" disabled={create.isPending} className="husrev-btn">
            {create.isPending ? t("common.saving", "Kaydediliyor…") : t("finance.transfer.submit", "Aktar")}
          </button>
        </div>
      </form>
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
