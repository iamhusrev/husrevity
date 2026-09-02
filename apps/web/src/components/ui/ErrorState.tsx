"use client";

import React from "react";
import { useTranslation } from "react-i18next";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message,
  onRetry,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const errorMessage = message || t("common.error");

  return (
    <div className="flex flex-col items-center justify-center text-center py-10">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-300 mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-husrev-ink dark:text-husrev-cream">
        {errorMessage}
      </h3>
      {onRetry && (
        <div className="mt-6">
          <button type="button" onClick={onRetry} className="husrev-btn-ghost">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
