"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useCreateItem, useQuickAddPreview } from "@/hooks/useItems";
import { ItemRequest } from "@/types/item/item";

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Faz 2 quick-add: raw text -> server-side parser preview -> user
 * confirms/edits -> real create. The parser's draft is NEVER auto-applied
 * (per the product principle) — the user always sees it first.
 */
export default function QuickAddDialog({ open, onOpenChange }: QuickAddDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [mounted, setMounted] = useState(false);
  const preview = useQuickAddPreview();
  const create = useCreateItem();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setText("");
      preview.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  const draft = preview.data?.data;

  const handleTextChange = (value: string) => {
    setText(value);
    if (draft) preview.reset();
  };

  const handlePreview = () => {
    if (!text.trim() || preview.isPending) return;
    preview.mutate(text.trim());
  };

  const handleConfirm = () => {
    if (!draft) return;
    const body: ItemRequest = {
      kind: "task",
      title: draft.title,
      scheduledAt: draft.scheduledAt,
      context: draft.context,
      rrule: draft.rrule,
    };
    create.mutate(body, { onSuccess: () => onOpenChange(false) });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-start justify-center bg-husrev-ink/40 p-4 pt-24 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label={t("quickAdd.title")}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-card-warm dark:bg-husrev-shadow husrev-settle"
      >
        <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
          {t("quickAdd.kicker")}
        </span>
        <h3 className="mt-1 text-lg font-semibold text-husrev-ink dark:text-husrev-cream">
          {t("quickAdd.title")}
        </h3>

        <input
          autoFocus
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handlePreview();
          }}
          placeholder={t("quickAdd.placeholder")}
          className="mt-4 w-full rounded-xl border border-husrev-sand bg-transparent px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-husrev-amber dark:border-white/10"
        />

        {!draft && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={!text.trim() || preview.isPending}
            className="husrev-btn mt-3"
          >
            {preview.isPending ? t("quickAdd.previewing") : t("quickAdd.preview")}
          </button>
        )}

        {draft && (
          <div className="mt-4 rounded-xl border border-husrev-sand/70 p-3 text-sm dark:border-white/10">
            <p className="font-medium text-husrev-ink dark:text-husrev-cream">{draft.title}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              {draft.scheduledAt && <span>{new Date(draft.scheduledAt).toLocaleString()}</span>}
              {draft.context && <span>#{draft.context}</span>}
              {draft.rrule && <span>{draft.rrule}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={create.isPending}
                className="husrev-btn"
              >
                {create.isPending ? t("quickAdd.adding") : t("quickAdd.confirm")}
              </button>
              <button
                type="button"
                onClick={() => preview.reset()}
                className="text-sm text-gray-500 hover:underline"
              >
                {t("quickAdd.edit")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
