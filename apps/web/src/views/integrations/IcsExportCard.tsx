"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useIstanbulToday } from "@/hooks/useIstanbulToday";
import { exportItemsIcs } from "@/services/item-service";
import { alertStore } from "@/stores/alert-store";
import { downloadBlob } from "@/utils/download";
import { errorMessage } from "@/utils/mutation-error";
import { firstDayOfMonthYmd, isRealYmd, lastDayOfMonthYmd, spanDaysYmd } from "@/utils/ymd";

/** The API refuses ranges longer than 366 days. */
export const ICS_MAX_RANGE_DAYS = 366;

const CARD =
  "rounded-3xl ring-1 ring-husrev-sand/90 bg-white/60 p-5 sm:p-6 dark:bg-husrev-shadow/60 dark:ring-white/[0.06]";
const BTN =
  "rounded-xl px-4 py-2 text-sm font-medium bg-husrev-ink text-husrev-cream hover:bg-husrev-ember disabled:opacity-50 dark:bg-husrev-cream dark:text-husrev-ink";
const INPUT =
  "mt-1 block w-full rounded-xl bg-transparent px-3 py-2 text-sm ring-1 ring-husrev-sand dark:ring-white/10";

type RangeError = "invalid" | "endBeforeStart" | "tooLong";

function validateRange(from: string, to: string): RangeError | null {
  if (!isRealYmd(from) || !isRealYmd(to)) return "invalid";
  const span = spanDaysYmd(from, to);
  if (span < 1) return "endBeforeStart";
  if (span > ICS_MAX_RANGE_DAYS) return "tooLong";
  return null;
}

export default function IcsExportCard() {
  const { t } = useTranslation();
  const todayYmd = useIstanbulToday();
  const year = Number(todayYmd.slice(0, 4));
  const month = Number(todayYmd.slice(5, 7));

  // Until the user edits a field it follows the current Istanbul month.
  const [fromInput, setFromInput] = useState<string | null>(null);
  const [toInput, setToInput] = useState<string | null>(null);
  const [includeTasks, setIncludeTasks] = useState(true);

  const from = fromInput ?? firstDayOfMonthYmd(year, month);
  const to = toInput ?? lastDayOfMonthYmd(year, month);
  const rangeError = validateRange(from, to);

  const exportMutation = useMutation({
    mutationFn: () => exportItemsIcs({ from, to, includeTasks }),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(filename, blob);
      alertStore.getState().show({
        title: t("integrations.ics.success"),
        message: filename,
        type: "success",
        position: "top-center",
      });
    },
    onError: (err) =>
      alertStore.getState().show({
        title: t("integrations.ics.failed"),
        message: errorMessage(err),
        type: "error",
        position: "top-center",
      }),
  });

  const handleDownload = () => {
    if (exportMutation.isPending || rangeError) return;
    exportMutation.mutate();
  };

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold">{t("integrations.ics.title")}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("integrations.ics.desc")}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          {t("integrations.ics.from")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFromInput(e.target.value)}
            className={INPUT}
          />
        </label>
        <label className="block text-xs font-medium">
          {t("integrations.ics.to")}
          <input
            type="date"
            value={to}
            onChange={(e) => setToInput(e.target.value)}
            className={INPUT}
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeTasks}
          onChange={(e) => setIncludeTasks(e.target.checked)}
        />
        {t("integrations.ics.includeTasks")}
      </label>

      {rangeError && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {t(`integrations.ics.errors.${rangeError}`)}
        </p>
      )}

      <button
        type="button"
        className={`${BTN} mt-4`}
        disabled={exportMutation.isPending || rangeError !== null}
        onClick={handleDownload}
      >
        {exportMutation.isPending
          ? t("integrations.ics.downloading")
          : t("integrations.ics.download")}
      </button>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("integrations.ics.note")}</p>
    </section>
  );
}
