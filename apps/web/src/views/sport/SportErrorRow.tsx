"use client";

import { useTranslation } from "react-i18next";

/** Inline "could not load" row with a Retry button (same shape as the Learning page). */
export default function SportErrorRow({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-2xl ring-1 ring-husrev-sand bg-white px-4 py-3 text-sm text-error-500 dark:bg-husrev-shadow dark:ring-white/[0.06]"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-9 shrink-0 rounded-full px-3 py-1 text-xs font-medium text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-husrev-amber"
      >
        {t("common.retry", "Retry")}
      </button>
    </div>
  );
}
