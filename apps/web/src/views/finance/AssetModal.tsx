"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import { useCreateAsset, useDeleteAsset, useUpdateAsset } from "@/hooks/useFinance";
import {
  ASSET_TYPES,
  AssetRequest,
  AssetResponse,
  FinanceAssetType,
} from "@/types/finance/finance";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

export const ASSET_TYPE_LABELS_TR: Record<string, string> = {
  cash: "Nakit",
  property: "Gayrimenkul",
  vehicle: "Araç",
  gold: "Altın",
  investment: "Yatırım",
  other: "Diğer",
};

function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function AssetModal({
  initial,
  onClose,
}: {
  initial: AssetResponse | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateAsset();
  const update = useUpdateAsset();
  const remove = useDeleteAsset();

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<FinanceAssetType>(
    (initial?.type as FinanceAssetType) ?? "cash",
  );
  const [value, setValue] = useState(initial ? String(initial.value) : "");
  const [acquiredAt, setAcquiredAt] = useState(toDateInput(initial?.acquiredAt));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(value);
    if (!name.trim() || !Number.isFinite(val) || val < 0) return;
    const body: AssetRequest = {
      name: name.trim(),
      type,
      value: val,
      acquiredAt: acquiredAt ? new Date(acquiredAt).toISOString() : null,
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
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="space-y-1">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {initial
                ? t("finance.modal.editKicker", "Düzenle")
                : t("finance.modal.newKicker", "Yeni")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("finance.asset.title", "Varlık")}
            </h3>
          </div>
          {initial && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
              aria-label={t("common.delete", "Sil")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <Field label={t("finance.asset.name", "Ad")}>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="husrev-input"
              autoFocus
              placeholder={t("finance.asset.namePlaceholder", "Ev, araba, altın…")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("finance.asset.type", "Tür")}>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FinanceAssetType)}
                className="husrev-input"
              >
                {ASSET_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {t(`finance.assetType.${tp}`, ASSET_TYPE_LABELS_TR[tp])}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("finance.asset.value", "Değer (₺)")}>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="husrev-input tabular-nums"
              />
            </Field>
          </div>

          <Field label={t("finance.asset.acquiredAt", "Edinim tarihi")}>
            <input
              type="date"
              value={acquiredAt}
              onChange={(e) => setAcquiredAt(e.target.value)}
              className="husrev-input"
            />
          </Field>

          <Field label={t("finance.field.notes", "Not")}>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="husrev-input resize-none"
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="husrev-btn-ghost"
          >
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
        title={t("finance.asset.confirmDeleteTitle", "Varlığı sil")}
        message={t(
          "finance.asset.confirmDelete",
          "Bu varlık kaydını silmek istediğine emin misin?",
        )}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="husrev-kicker text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}
