"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { BiLinkExternal, BiX } from "react-icons/bi";
import { Modal } from "@/components/modal";

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, renders a ↗ button that opens the full dedicated page. */
  onExpand?: () => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Shared shell for "open detail in a modal". Owns its own header (title +
 * optional ↗ open-full + close) and disables the base Modal's built-in X so
 * the buttons never overlap.
 */
export default function DetailModal({
  isOpen,
  onClose,
  onExpand,
  title,
  className,
  children,
}: DetailModalProps) {
  const { t } = useTranslation();

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-sand/50 hover:text-husrev-ink dark:hover:bg-white/5 dark:hover:text-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      className={className ?? "max-h-[90vh] w-full max-w-3xl overflow-y-auto p-7"}
    >
      <div className="mb-4 flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
          {title ?? ""}
        </h2>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            aria-label={t("common.openFull")}
            title={t("common.openFull")}
            className={`${iconBtn} shrink-0`}
          >
            <BiLinkExternal size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.cancel")}
          className={`${iconBtn} shrink-0`}
        >
          <BiX size={20} />
        </button>
      </div>
      {children}
    </Modal>
  );
}
