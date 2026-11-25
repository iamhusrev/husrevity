"use client";

import React, { ReactNode } from "react";

interface PageHeaderProps {
  pageTitle: string;
  /** @deprecated Kept for call-site compatibility; titles are rendered plainly now. */
  flourish?: string;
  /** @deprecated Kept for call-site compatibility; the eyebrow line was dropped for readability. */
  kicker?: string;
  actions?: ReactNode;
  description?: string;
}

/**
 * Plain page title with optional description and actions. The decorative italic word, the
 * eyebrow line and the "Home · Page" trail were removed: the sidebar already shows where the
 * user is, and the extra lines made every page start with noise.
 */
export default function PageHeader({ pageTitle, actions, description }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-husrev-ink md:text-[28px] dark:text-husrev-cream">
          {pageTitle}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
