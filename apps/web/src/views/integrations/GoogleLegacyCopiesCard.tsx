"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsService } from "@/services/integrations-service";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

const CARD =
  "rounded-3xl ring-1 ring-husrev-sand/90 bg-white/60 p-5 sm:p-6 dark:bg-husrev-shadow/60 dark:ring-white/[0.06]";
const BTN =
  "rounded-xl px-4 py-2 text-sm font-medium bg-husrev-ink text-husrev-cream hover:bg-husrev-ember disabled:opacity-50 dark:bg-husrev-cream dark:text-husrev-ink";
const BTN_GHOST =
  "rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-husrev-sand hover:bg-husrev-sand/40 disabled:opacity-50 dark:ring-white/10";

const COUNT_KEY = ["integrations", "google", "legacy-copies"];

/**
 * Always-available removal of the copies the old Google sync stored as Husrevity
 * items, independent of the connection state. Needs an explicit confirmation step.
 * While the legacy engine is active (connected, legacy mode, not paused) the next sync would
 * import the copies again, so the purge is disabled and the user is told to disconnect first.
 */
export default function GoogleLegacyCopiesCard({ legacyEngineActive = false }: { legacyEngineActive?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const show = alertStore((s) => s.show);
  const [confirming, setConfirming] = useState(false);
  const { data } = useQuery({
    queryKey: COUNT_KEY,
    queryFn: integrationsService.googleLegacyCopies,
    gcTime: 0,
  });
  const count = data?.legacyCopyCount ?? 0;
  const purge = useMutation({
    mutationFn: integrationsService.googleLegacyCopiesPurge,
    onSuccess: (r) => {
      setConfirming(false);
      show({
        title: t("integrations.googleLegacyCopies.deleted", { count: r.deleted }),
        message: "",
        type: "success",
        position: "top-center",
      });
      qc.invalidateQueries({ queryKey: COUNT_KEY });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err) => {
      const { title, message } = parseAxiosError(err);
      show({ title, message, type: "error", position: "top-center" });
    },
  });

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold">{t("integrations.googleLegacyCopies.title")}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("integrations.googleLegacyCopies.explain")}
      </p>
      <p className="mt-3 text-sm">
        {count > 0
          ? t("integrations.googleLegacyCopies.count", { count })
          : t("integrations.googleLegacyCopies.none")}
      </p>
      {confirming ? (
        <div role="group" aria-label={t("integrations.googleLegacyCopies.title")} className="mt-3 space-y-3 text-sm">
          <p className="font-medium">{t("integrations.googleLegacyCopies.confirmText", { count })}</p>
          <p className="text-gray-500 dark:text-gray-400">{t("integrations.googleLegacyCopies.confirmNote")}</p>
          <div className="flex flex-wrap gap-2">
            <button className={BTN} disabled={purge.isPending} onClick={() => purge.mutate()}>
              {t("integrations.googleLegacyCopies.confirm")}
            </button>
            <button className={BTN_GHOST} disabled={purge.isPending} onClick={() => setConfirming(false)}>
              {t("integrations.googleLegacyCopies.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className={`${BTN} mt-3`}
            disabled={count === 0 || legacyEngineActive}
            onClick={() => setConfirming(true)}
          >
            {t("integrations.googleLegacyCopies.action")}
          </button>
          {legacyEngineActive && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t("integrations.googleLegacyCopies.disconnectFirst")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
