"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  useVaultEntities,
  useCreateVaultEntity,
  useUpdateVaultEntity,
  useDeleteVaultEntity,
  useVaultItems,
  useCreateVaultItem,
  useUpdateVaultItem,
  useDeleteVaultItem,
} from "@/hooks/useVault";
import { vaultService } from "@/services/vault-service";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import { VaultEntityResponse, VaultItemResponse } from "@/types/vault/vault";
import {
  BiShow,
  BiHide,
  BiTrash,
  BiEdit,
  BiDownload,
  BiImport,
  BiPlus,
  BiCopy,
} from "react-icons/bi";

const PRESET_COLORS = [
  "#6366F1",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#6B7280",
];

// ─── Entity modal (create / edit) ─────────────────────────────────────────────

function EntityModal({ initial, onClose }: { initial?: VaultEntityResponse; onClose: () => void }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const createEntity = useCreateVaultEntity();
  const updateEntity = useUpdateVaultEntity();

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6366F1");
  const isPending = createEntity.isPending || updateEntity.isPending;
  const isEdit = !!initial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (isEdit) {
        await updateEntity.mutateAsync({
          id: initial!.id,
          body: { name: name.trim(), category: category || null, color },
        });
      } else {
        await createEntity.mutateAsync({ name: name.trim(), category: category || null, color });
      }
      onClose();
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
      <form
        autoComplete="off"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {isEdit
              ? t("vault.modal.kickerEditEntity", "Düzenle")
              : t("vault.modal.kickerNewEntity", "Yeni vault")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {isEdit ? t("vault.editEntity") : t("vault.newEntity")}
          </h3>
        </div>

        <div className="mt-6 space-y-4">
          <VaultField label={t("vault.field.name", "İsim")}>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("vault.namePlaceholder")}
              className="husrev-input"
            />
          </VaultField>
          <VaultField label={t("vault.field.category", "Kategori")}>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("vault.categoryPlaceholder")}
              className="husrev-input"
            />
          </VaultField>
          <div className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("vault.field.color", "Renk")}
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-8 w-8 rounded-full transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
                    color === c
                      ? "ring-2 ring-offset-2 ring-offset-husrev-cream ring-husrev-ember dark:ring-offset-husrev-ink"
                      : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || isPending}
            className="husrev-btn"
          >
            {isPending
              ? t("common.saving", "Kaydediliyor…")
              : isEdit
                ? t("vault.submit.edit")
                : t("vault.submit.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

function VaultField({
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

// ─── Item modal (create / edit) ───────────────────────────────────────────────

function ItemModal({
  entityId,
  initial,
  onClose,
}: {
  entityId: number;
  initial?: VaultItemResponse;
  onClose: () => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const createItem = useCreateVaultItem();
  const updateItem = useUpdateVaultItem();

  const [label, setLabel] = useState(initial?.label ?? "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [showValue, setShowValue] = useState(false);
  const isEdit = !!initial;
  const isPending = createItem.isPending || updateItem.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await updateItem.mutateAsync({
          itemId: initial!.id,
          entityId,
          body: {
            label: label.trim(),
            value: value || undefined,
            description: description || null,
          },
        });
      } else {
        await createItem.mutateAsync({
          entityId,
          body: { label: label.trim(), value, description: description || null },
        });
      }
      onClose();
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
      <form
        autoComplete="off"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {isEdit
              ? t("vault.modal.kickerEditItem", "Düzenle")
              : t("vault.modal.kickerNewItem", "Yeni kayıt")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {isEdit ? t("vault.editItem") : t("vault.newItem")}
          </h3>
        </div>

        <div className="mt-6 space-y-4">
          <VaultField label={t("vault.field.keyLabel")}>
            <input
              autoFocus
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("vault.field.keyPlaceholder")}
              className="husrev-input font-mono"
            />
          </VaultField>
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("vault.field.valueLabel")}{" "}
              <span className="ml-1 text-[10px] tracking-normal normal-case text-gray-400">
                {isEdit
                  ? t("vault.field.valueHintEdit")
                  : t("vault.field.valueHintRequired")}
              </span>
            </span>
            <div className="relative">
              <input
                type={showValue ? "text" : "password"}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-form-type="other"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  isEdit
                    ? t("vault.field.valuePlaceholderEdit")
                    : t("vault.field.valuePlaceholderNew")
                }
                className="husrev-input pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                aria-label={showValue ? t("vault.action.hide") : t("vault.action.show")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-husrev-sand/40 hover:text-husrev-ink dark:hover:bg-white/5 dark:hover:text-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
              >
                {showValue ? <BiHide size={16} /> : <BiShow size={16} />}
              </button>
            </div>
          </label>
          <VaultField label={t("vault.field.description", "Açıklama")}>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("vault.field.descriptionPlaceholder")}
              className="husrev-input"
            />
          </VaultField>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!label.trim() || (!isEdit && !value) || isPending}
            className="husrev-btn"
          >
            {isPending
              ? t("common.saving", "Kaydediliyor…")
              : isEdit
                ? t("vault.submit.edit")
                : t("vault.submit.addItem")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({ entityId, onClose }: { entityId: number; onClose: () => void }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!raw.trim()) return;
    setLoading(true);
    try {
      await vaultService.importEnv(entityId, raw);
      showAlert({
        title: t("vault.import_modal.successTitle"),
        message: t("vault.import_modal.successMessage"),
        type: "success",
        position: "top-center",
      });
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("vault.modal.kickerImport", ".env içe aktar")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("vault.import_modal.title")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("vault.import_modal.hint")}
          </p>
        </div>

        <div className="mt-6">
          <textarea
            autoFocus
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={10}
            placeholder={t("vault.import_modal.placeholder")}
            className="husrev-input font-mono text-xs resize-none"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!raw.trim() || loading}
            className="husrev-btn"
          >
            {loading ? t("vault.import_modal.submitting") : t("vault.import_modal.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  entityId,
  onEdit,
}: {
  item: VaultItemResponse;
  entityId: number;
  onEdit: (item: VaultItemResponse) => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const deleteItem = useDeleteVaultItem();
  const [revealed, setRevealed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.value);
      showAlert({
        title: t("vault.copy.successTitle"),
        message: t("vault.copy.successMessage", { label: item.label }),
        type: "success",
        position: "top-center",
      });
    } catch {
      showAlert({
        title: t("vault.copy.errorTitle"),
        message: t("vault.copy.errorMessage"),
        type: "error",
        position: "top-center",
      });
    }
  };

  const openDelete = () => setConfirmingDelete(true);

  const confirmDelete = async () => {
    try {
      await deleteItem.mutateAsync({ itemId: item.id, entityId });
      setConfirmingDelete(false);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <tr className="border-t border-gray-100 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3 font-mono text-sm font-medium text-gray-800 dark:text-white/90">
        {item.label}
      </td>
      <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-400">
        {item.description ?? <span className="text-gray-200 dark:text-gray-700">—</span>}
      </td>
      <td className="px-4 py-3 font-mono text-sm">
        <span
          className={
            revealed
              ? "break-all text-gray-700 dark:text-gray-300"
              : "select-none text-gray-300 dark:text-gray-700"
          }
        >
          {revealed ? item.value : "••••••••"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            aria-label={revealed ? t("vault.action.hide") : t("vault.action.show")}
          >
            {revealed ? <BiHide size={15} /> : <BiShow size={15} />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            aria-label={t("vault.action.copy")}
          >
            <BiCopy size={15} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            aria-label={t("vault.action.edit")}
          >
            <BiEdit size={15} />
          </button>
          <button
            type="button"
            onClick={openDelete}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
            aria-label={t("vault.action.delete")}
          >
            <BiTrash size={15} />
          </button>
        </div>
      </td>
      <DeleteConfirmModalPortal>
        <DeleteConfirmModal
          isOpen={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={confirmDelete}
          isPending={deleteItem.isPending}
          title={t("vault.confirmDeleteItemTitle", "Kaydı sil")}
          message={t("vault.confirmDeleteItem", { label: item.label })}
        />
      </DeleteConfirmModalPortal>
    </tr>
  );
}

function DeleteConfirmModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ─── Items panel ──────────────────────────────────────────────────────────────

function ItemsPanel({ entity }: { entity: VaultEntityResponse }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const { data: items = [], isLoading } = useVaultItems(entity.id);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItemResponse | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const content = await vaultService.exportEnv(entity.id);
      try {
        await navigator.clipboard.writeText(content);
        showAlert({
          title: t("vault.copy.successTitle"),
          message: t("vault.copy.envSuccessMessage"),
          type: "success",
          position: "top-center",
        });
      } catch {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = ".env";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: entity.color }} />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">{entity.name}</h2>
        {entity.category && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
            {entity.category}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <BiImport size={15} /> {t("vault.import")}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || items.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <BiDownload size={15} /> {t("vault.export")}
          </button>
          <button
            type="button"
            onClick={() => setShowItemModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
          >
            <BiPlus size={15} /> {t("vault.addField")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-gray-400">{t("common.loading")}</p>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400">{t("vault.noItems")}</p>
            <p className="mt-1 text-sm text-gray-300">{t("vault.noItemsHint")}</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {t("vault.table.key")}
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {t("vault.table.description")}
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {t("vault.table.value")}
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {t("vault.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow key={item.id} item={item} entityId={entity.id} onEdit={setEditingItem} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showItemModal && <ItemModal entityId={entity.id} onClose={() => setShowItemModal(false)} />}
      {editingItem && (
        <ItemModal
          entityId={entity.id}
          initial={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
      {showImportModal && (
        <ImportModal entityId={entity.id} onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const { data: entities = [], isLoading } = useVaultEntities();
  const deleteEntity = useDeleteVaultEntity();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [editingEntity, setEditingEntity] = useState<VaultEntityResponse | null>(null);
  const [entityToDelete, setEntityToDelete] = useState<VaultEntityResponse | null>(null);

  useEffect(() => {
    if (entities.length > 0 && selectedId === null) {
      setSelectedId(entities[0].id);
    }
  }, [entities, selectedId]);

  const selectedEntity = entities.find((e) => e.id === selectedId) ?? null;

  const requestDeleteEntity = (entity: VaultEntityResponse) => {
    setEntityToDelete(entity);
  };

  const confirmDeleteEntity = async () => {
    if (!entityToDelete) return;
    const id = entityToDelete.id;
    try {
      await deleteEntity.mutateAsync(id);
      if (selectedId === id) setSelectedId(entities.find((e) => e.id !== id)?.id ?? null);
      setEntityToDelete(null);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageBreadcrumb pageTitle={t("vault.title")} />
        <button
          type="button"
          onClick={() => setShowEntityModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-600"
        >
          <BiPlus size={16} /> {t("vault.newEntity")}
        </button>
      </div>

      <div
        className="flex gap-0 rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06] overflow-hidden"
        style={{ minHeight: "calc(100vh - 160px)" }}
      >
        {/* Left sidebar */}
        <div className="w-56 shrink-0 border-r border-gray-200 p-3 dark:border-gray-700">
          {isLoading ? (
            <p className="py-4 text-center text-xs text-gray-400">{t("common.loading")}</p>
          ) : (
            <ul className="space-y-0.5">
              {entities.map((entity) => (
                <li key={entity.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(entity.id)}
                    className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition ${
                      selectedId === entity.id
                        ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: entity.color }}
                    />
                    <span className="flex-1 truncate">{entity.name}</span>
                    <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {entity.itemCount}
                    </span>
                    <div className="ml-auto flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEntity(entity);
                        }}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                        aria-label={t("vault.action.edit")}
                      >
                        <BiEdit size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteEntity(entity);
                        }}
                        className="rounded p-0.5 text-gray-400 hover:text-red-500"
                        aria-label={t("vault.action.delete")}
                      >
                        <BiTrash size={12} />
                      </button>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {entities.length === 0 && !isLoading && (
            <p className="py-4 text-center text-xs text-gray-400">{t("vault.noEntities")}</p>
          )}
        </div>

        {/* Right panel */}
        <div className="flex-1 p-5 overflow-hidden">
          {selectedEntity ? (
            <ItemsPanel entity={selectedEntity} />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              {entities.length === 0 ? t("vault.startNew") : t("vault.selectEntity")}
            </div>
          )}
        </div>
      </div>

      {showEntityModal && <EntityModal onClose={() => setShowEntityModal(false)} />}
      {editingEntity && (
        <EntityModal initial={editingEntity} onClose={() => setEditingEntity(null)} />
      )}

      <DeleteConfirmModal
        isOpen={!!entityToDelete}
        onClose={() => setEntityToDelete(null)}
        onConfirm={confirmDeleteEntity}
        isPending={deleteEntity.isPending}
        title={t("vault.confirmDeleteEntityTitle", "Vault'u sil")}
        message={
          entityToDelete
            ? t("vault.confirmDeleteEntityWithName", {
                name: entityToDelete.name,
                defaultValue: `"${entityToDelete.name}" vault'unu ve içindeki tüm kayıtları silmek istediğine emin misin?`,
              })
            : t("vault.confirmDeleteEntity")
        }
      />
    </div>
  );
}
