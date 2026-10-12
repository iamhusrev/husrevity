"use client";

import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import Dialog from "@/components/ui/Dialog";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  title,
  message,
  confirmLabel,
}: DeleteConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      panelClassName="w-full max-w-sm rounded-3xl husrev-modal grain p-7 husrev-settle"
      role="alertdialog"
      labelledBy="delete-confirm-title"
      describedBy="delete-confirm-message"
      portal
      closeOnBackdrop={!isPending}
      closeOnEscape={!isPending}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-50 text-error-500 dark:bg-error-500/15">
          <BiTrash className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <span className="husrev-kicker text-error-500/80">
            {t("dataTable.confirmDeleteKicker", "Dikkat")}
          </span>
          <h3
            id="delete-confirm-title"
            className="text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream"
          >
            {title ?? t("dataTable.confirmDeleteTitle")}
          </h3>
          <p id="delete-confirm-message" className="text-sm text-gray-500 dark:text-gray-400">
            {message ?? t("dataTable.confirmDeleteMessage")}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="husrev-btn-ghost disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-error-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-error-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 focus-visible:ring-offset-2 focus-visible:ring-offset-husrev-cream dark:focus-visible:ring-offset-husrev-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <BiTrash className="h-4 w-4" />
          {isPending ? t("common.loading") : (confirmLabel ?? t("dataTable.delete"))}
        </button>
      </div>
    </Dialog>
  );
}
