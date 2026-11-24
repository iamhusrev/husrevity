"use client";

import React from "react";
import { useTranslation } from "react-i18next";

/** Where a user removes a third-party app's access in their own Google Account. */
const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

interface Props {
  /** `revokeFailed` of the Google status: the API could not revoke the grant after all retries. */
  revokeFailed?: boolean;
  connected: boolean;
}

/**
 * Shown after a disconnect whose Google token revoke never succeeded: the stored
 * token is deleted, but the grant may still be active on Google's side, so the user
 * is told how to remove it themselves. Hidden once the account is connected again.
 */
export default function GoogleRevokeFailedNotice({ revokeFailed, connected }: Props) {
  const { t } = useTranslation();
  if (revokeFailed !== true || connected) return null;
  return (
    <div
      role="alert"
      className="mt-4 space-y-1 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30"
    >
      <p className="font-medium">{t("integrations.googleRevokeFailed.title")}</p>
      <p>{t("integrations.googleRevokeFailed.body")}</p>
      <a
        href={GOOGLE_PERMISSIONS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block font-medium underline"
      >
        {t("integrations.googleRevokeFailed.link")}
      </a>
    </div>
  );
}
