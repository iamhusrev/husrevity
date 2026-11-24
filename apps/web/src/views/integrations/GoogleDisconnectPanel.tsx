"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { integrationsService } from "@/services/integrations-service";

const BTN =
  "rounded-xl px-4 py-2 text-sm font-medium bg-husrev-ink text-husrev-cream hover:bg-husrev-ember disabled:opacity-50 dark:bg-husrev-cream dark:text-husrev-ink";
const BTN_GHOST =
  "rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-husrev-sand hover:bg-husrev-sand/40 disabled:opacity-50 dark:ring-white/10";

interface Props {
  pending: boolean;
  onConfirm: (deleteLegacyCopies: boolean) => void;
  onCancel: () => void;
}

/**
 * Confirmation step of the Google disconnect (new model). States what is
 * removed, shows how many legacy Google copies exist and offers deleting them
 * only through an explicit, unchecked-by-default checkbox.
 */
export default function GoogleDisconnectPanel({ pending, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [deleteCopies, setDeleteCopies] = useState(false);
  const preview = useQuery({
    queryKey: ["integrations", "google", "disconnect-preview"],
    queryFn: integrationsService.googleLegacyCopies,
    // Ungated endpoint: works with the new calendar model on or off. A fresh count every time the panel opens.
    gcTime: 0,
  });
  const count = preview.data?.legacyCopyCount ?? 0;

  return (
    <div role="group" aria-label={t("integrations.googleDisconnect.title")} className="w-full space-y-3 text-sm">
      <p className="font-medium">{t("integrations.googleDisconnect.title")}</p>
      <p className="text-gray-500 dark:text-gray-400">{t("integrations.googleDisconnect.explain")}</p>
      {preview.isPending ? (
        <p className="text-gray-500">{t("integrations.googleDisconnect.loading")}</p>
      ) : preview.isError ? (
        <p className="text-amber-600">{t("integrations.googleDisconnect.previewError")}</p>
      ) : count > 0 ? (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={deleteCopies}
            disabled={pending}
            onChange={(e) => setDeleteCopies(e.target.checked)}
          />
          <span>{t("integrations.googleDisconnect.deleteCopies", { count })}</span>
        </label>
      ) : (
        <p className="text-gray-500">{t("integrations.googleDisconnect.noCopies")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={BTN}
          disabled={pending || preview.isPending}
          onClick={() => onConfirm(count > 0 && deleteCopies)}
        >
          {t("integrations.googleDisconnect.confirm")}
        </button>
        <button className={BTN_GHOST} disabled={pending} onClick={onCancel}>
          {t("integrations.googleDisconnect.cancel")}
        </button>
      </div>
    </div>
  );
}
