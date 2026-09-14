"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BiLoaderAlt, BiPlus, BiTrash, BiX } from "react-icons/bi";
import { useDictateItems } from "@/hooks/useAi";

export interface DictateQuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onConfirm: (items: string[]) => Promise<void> | void;
}

type DictateStage = "input" | "review";

export default function DictateQuickAddModal({
  isOpen,
  onClose,
  title,
  onConfirm,
}: DictateQuickAddModalProps) {
  const { t } = useTranslation();
  const dictateItems = useDictateItems();
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<DictateStage>("input");
  const [text, setText] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const itemInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const isOpenRef = useRef(isOpen);

  const resetState = useCallback(() => {
    setStage("input");
    setText("");
    setItems([]);
    setError("");
    setIsConfirming(false);
    itemInputRefs.current = [];
  }, []);

  const handleClose = useCallback(() => {
    if (isConfirming) return;
    isOpenRef.current = false;
    resetState();
    onClose();
  }, [isConfirming, onClose, resetState]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
    resetState();
  }, [isOpen, resetState]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    document.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [handleClose, isOpen]);

  const handleSplit = async () => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      setError(t("dictate.error.empty"));
      return;
    }

    setError("");

    try {
      const response = await dictateItems.mutateAsync(trimmedText);
      const splitItems = response.data.items;

      if (!isOpenRef.current) return;

      if (splitItems.length === 0) {
        setError(t("dictate.error.failed"));
        return;
      }

      setItems(splitItems);
      setStage("review");
    } catch {
      if (isOpenRef.current) setError(t("dictate.error.failed"));
    }
  };

  const updateItem = (index: number, value: string) => {
    setItems((currentItems) =>
      currentItems.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  };

  const removeItem = (index: number) => {
    setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index));
  };

  const addLine = () => {
    setItems((currentItems) => {
      const nextItems = [...currentItems, ""];
      requestAnimationFrame(() => {
        itemInputRefs.current[nextItems.length - 1]?.focus();
      });
      return nextItems;
    });
  };

  const finalItems = items.map((item) => item.trim()).filter(Boolean);

  const handleConfirm = async () => {
    if (finalItems.length === 0 || isConfirming) return;

    setIsConfirming(true);
    try {
      await onConfirm(finalItems);
      resetState();
      onClose();
    } finally {
      if (isOpenRef.current) setIsConfirming(false);
    }
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-start justify-center overflow-y-auto bg-husrev-ink/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dictate-quick-add-title"
    >
      <div
        className="relative w-full max-w-2xl husrev-settle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="husrev-modal rounded-2xl p-5 sm:p-6">
          <button
            type="button"
            onClick={handleClose}
            disabled={isConfirming}
            aria-label={t("common.close", "Kapat")}
            className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-500 ring-1 ring-husrev-sand backdrop-blur transition hover:bg-white hover:text-husrev-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber disabled:cursor-not-allowed disabled:opacity-60 dark:bg-husrev-shadow/80 dark:text-gray-300 dark:ring-white/10 dark:hover:text-husrev-cream"
          >
            <BiX size={20} />
          </button>

          <h2 id="dictate-quick-add-title" className="pr-10 text-xl font-semibold text-husrev-ink dark:text-husrev-cream">
            {title}
          </h2>

          {stage === "input" ? (
            <div className="mt-5 space-y-4">
              <textarea
                autoFocus
                rows={7}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={dictateItems.isPending}
                placeholder={t("dictate.placeholder")}
                className="husrev-input min-h-40 resize-y px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />

              {error && (
                <p role="alert" className="text-sm text-error-500">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSplit}
                  disabled={!text.trim() || dictateItems.isPending}
                  className="husrev-btn inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {dictateItems.isPending && (
                    <BiLoaderAlt className="animate-spin motion-reduce:animate-none" size={18} />
                  )}
                  {t("dictate.splitButton")}
                  {dictateItems.isPending ? "..." : ""}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
                {t("dictate.review.title")}
              </h3>

              <div className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <div key={`dictate-item-${index}`} className="flex items-center gap-2">
                    <input
                      ref={(element) => {
                        itemInputRefs.current[index] = element;
                      }}
                      type="text"
                      value={item}
                      onChange={(event) => updateItem(index, event.target.value)}
                      disabled={isConfirming}
                      className="husrev-input min-w-0 flex-1 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={isConfirming}
                      aria-label={t("dictate.review.removeLine")}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-husrev-sand text-gray-500 transition hover:border-husrev-amber hover:text-husrev-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-gray-300 dark:hover:text-husrev-cream"
                    >
                      <BiTrash size={18} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addLine}
                disabled={isConfirming}
                className="husrev-btn-ghost mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed"
              >
                <BiPlus size={18} />
                {t("dictate.review.addLine")}
              </button>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStage("input")}
                  disabled={isConfirming}
                  className="husrev-btn-ghost disabled:cursor-not-allowed"
                >
                  {t("dictate.backButton")}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={finalItems.length === 0 || isConfirming}
                  className="husrev-btn inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isConfirming && (
                    <BiLoaderAlt className="animate-spin motion-reduce:animate-none" size={18} />
                  )}
                  {t("dictate.confirmButton", { count: finalItems.length })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
