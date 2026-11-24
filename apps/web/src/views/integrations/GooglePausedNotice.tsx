"use client";

import React from "react";
import { useTranslation } from "react-i18next";

interface Props {
  /** `paused` of the Google status: the old sync engine cannot run with the narrowed permission. */
  paused?: boolean;
  connected: boolean;
}

/** Explains why legacy Google sync is not running while cached data stays visible. */
export default function GooglePausedNotice({ paused, connected }: Props) {
  const { t } = useTranslation();
  if (paused !== true || !connected) return null;
  return (
    <div
      role="status"
      className="mt-4 space-y-1 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30"
    >
      <p className="font-medium">{t("integrations.googlePaused.title")}</p>
      <p>{t("integrations.googlePaused.body")}</p>
    </div>
  );
}
