"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import {
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from "@/hooks/useFinance";
import {
  ACCOUNT_TYPES,
  AccountRequest,
  AccountResponse,
  FinanceAccountType,
} from "@/types/finance/finance";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

const TYPE_LABELS: Record<FinanceAccountType, string> = {
  bank: "Banka",
  card: "Kart",
  cash: "Nakit",
  savings: "Birikim",
};

export function AccountModal({
  initial,
  onClose,
}: {
  initial: AccountResponse | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<FinanceAccountType>(
    (initial?.type as FinanceAccountType) ?? "bank",
  );
  const [openingBalance, setOpeningBalance] = useState(
    initial ? String(initial.openingBalance) : "0",
  );
  const [archived, setArchived] = useState(initial?.archived ?? false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: AccountRequest = {
      name: name.trim(),
      type,
      openingBalance: Number(openingBalance) || 0,
      archived,
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
              {t("finance.account.title", "Hesap")}
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
          <Field label={t("finance.field.name", "İsim")}>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="husrev-input"
              autoFocus
              placeholder={t("finance.placeholders.accountName", "Vakıfbank · Maaş")}
            />
          </Field>
          <Field label={t("finance.field.type", "Tip")}>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_TYPES.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setType(tp)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    type === tp
                      ? "bg-husrev-ember text-husrev-cream"
                      : "bg-husrev-sand/50 text-gray-700 hover:bg-husrev-amber/15 dark:bg-white/[0.06] dark:text-gray-300"
                  }`}
                >
                  {TYPE_LABELS[tp]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("finance.field.openingBalance", "Açılış bakiyesi (₺)")}>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="husrev-input tabular-nums"
            />
          </Field>
          {initial && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
                className="h-4 w-4 rounded border-husrev-sand text-husrev-ember focus:ring-husrev-amber"
              />
              {t("finance.account.archived", "Arşivle (özet hesaplarda gösterilmez)")}
            </label>
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
        title={t("finance.account.confirmDeleteTitle", "Hesabı sil")}
        message={t(
          "finance.account.confirmDelete",
          "Bu hesabı silmek istediğine emin misin?",
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
