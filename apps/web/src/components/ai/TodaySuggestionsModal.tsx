"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BiX } from "react-icons/bi";
import TodaySuggestionsCard from "@/components/dashboard/TodaySuggestionsCard";

interface TodaySuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TodaySuggestionsModal({
  isOpen,
  onClose,
}: TodaySuggestionsModalProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-start justify-center overflow-y-auto bg-husrev-ink/40 backdrop-blur-sm p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("dashboard.today.title", "Bugün ne yapsam?")}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl husrev-settle"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close", "Kapat")}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-500 ring-1 ring-husrev-sand backdrop-blur transition hover:bg-white hover:text-husrev-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow/80 dark:ring-white/10 dark:text-gray-300 dark:hover:text-husrev-cream"
        >
          <BiX size={20} />
        </button>
        <TodaySuggestionsCard />
      </div>
    </div>,
    document.body,
  );
}
