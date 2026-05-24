"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useFinanceCategories,
  useUpdateTransaction,
} from "@/hooks/useFinance";
import {
  AccountResponse,
  TransactionRequest,
  TransactionResponse,
} from "@/types/finance/finance";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

function toLocalInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TransactionModal({
  initial,
  accounts,
  onClose,
}: {
  initial: TransactionResponse | null;
  accounts: AccountResponse[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const { data: categories } = useFinanceCategories();

  const [kind, setKind] = useState<"income" | "expense">(
    (initial?.kind as "income" | "expense") ?? "expense",
  );
  const [accountId, setAccountId] = useState(
    initial?.accountId ?? accounts[0]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState<string>(initial?.categoryId ?? "");
  const [amount, setAmount] = useState<string>(
    initial ? String(initial.amount) : "",
  );
  const [occurredAt, setOccurredAt] = useState<string>(
    toLocalInput(initial?.occurredAt),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const filteredCategories = (categories ?? []).filter((c) => c.kind === kind);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showAlert({
        title: t("common.error"),
        message: t("finance.modal.invalidAmount", "Geçerli bir tutar gir."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    if (!accountId) {
      showAlert({
        title: t("common.error"),
        message: t("finance.modal.noAccount", "Önce bir hesap ekle."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    const body: TransactionRequest = {
      accountId,
      categoryId: categoryId || null,
      kind,
      amount: amt,
      occurredAt: new Date(occurredAt).toISOString(),
      description: description.trim() || null,
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

  const pending = create.isPending || update.isPending || remove.isPending;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="space-y-1">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {initial ? t("finance.modal.editKicker", "Düzenle") : t("finance.modal.newKicker", "Yeni")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {kind === "income"
                ? t("finance.modal.incomeTitle", "Gelir kaydı")
                : t("finance.modal.expenseTitle", "Gider kaydı")}
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
          {/* Kind toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-husrev-sand/50 p-1 dark:bg-white/[0.06]">
            <button
              type="button"
              onClick={() => setKind("expense")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                kind === "expense"
                  ? "bg-husrev-ember text-husrev-cream"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {t("finance.kind.expense", "Gider")}
            </button>
            <button
              type="button"
              onClick={() => setKind("income")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                kind === "income"
                  ? "bg-husrev-moss text-husrev-cream"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {t("finance.kind.income", "Gelir")}
            </button>
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

          <Field label={t("finance.field.account", "Hesap")}>
            <select
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="husrev-input"
            >
              {accounts.length === 0 && <option value="">—</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("finance.field.category", "Kategori")}>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="husrev-input"
            >
              <option value="">{t("finance.uncategorised", "(Kategorisiz)")}</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
              placeholder={t("finance.placeholders.description", "İsteğe bağlı not")}
            />
          </Field>
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
        title={t("finance.transaction.confirmDeleteTitle", "Kaydı sil")}
        message={t(
          "finance.transaction.confirmDelete",
          "Bu işlemi silmek istediğine emin misin?",
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
