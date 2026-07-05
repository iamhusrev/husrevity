"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useGenerateSportProgram } from "@/hooks/useSport";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { cn } from "@/utils/utils";
import { ACTIVITY_TYPES, SportProgramResponse } from "@/types/sport/sport";
import { BiCalendarCheck, BiSolidMagicWand, BiTargetLock } from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";

const aiSchema = z.object({
  weekCount: z.number().min(4).max(16),
  activityPreferences: z.array(z.string()).min(1),
  targetWeeklyHours: z.number().min(1).max(168),
});

type AiFormValues = z.infer<typeof aiSchema>;

export default function SportAiGeneratorModal({
  onClose,
  onViewProgram,
}: {
  onClose: () => void;
  onViewProgram: (id: string) => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const generate = useGenerateSportProgram();
  const [result, setResult] = useState<SportProgramResponse | null>(null);

  const { control, handleSubmit } = useForm<AiFormValues>({
    resolver: zodResolver(aiSchema),
    defaultValues: {
      weekCount: 8,
      activityPreferences: [],
      targetWeeklyHours: 5,
    },
  });

  const submit = handleSubmit(async (data) => {
    try {
      const res = await generate.mutateAsync(data);
      setResult(res.data);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  });

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={() => !generate.isPending && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl husrev-modal grain p-5 sm:p-7 husrev-settle"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t("sport.aiModal.kicker", "Yapay zeka")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("sport.aiModal.title", "Program üret")}
            </h3>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-husrev-moss/15 text-husrev-moss">
            <HiSparkles size={18} />
          </div>
        </div>
        <div className="husrev-rule mt-5" />

        {!result ? (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.aiModal.weekCount", "Hafta sayısı (4-16)")}
              </label>
              <Controller
                control={control}
                name="weekCount"
                render={({ field }) => (
                  <input
                    type="number"
                    min={4}
                    max={16}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="husrev-input"
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.aiModal.targetWeeklyHours", "Haftalık hedef saat")}
              </label>
              <Controller
                control={control}
                name="targetWeeklyHours"
                render={({ field }) => (
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="husrev-input"
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.aiModal.activityPreferences", "Tercih edilen aktiviteler")}
              </label>
              <Controller
                control={control}
                name="activityPreferences"
                render={({ field, fieldState }) => (
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {ACTIVITY_TYPES.map((a) => {
                        const active = field.value.includes(a);
                        return (
                          <button
                            key={a}
                            type="button"
                            onClick={() =>
                              field.onChange(
                                active
                                  ? field.value.filter((v) => v !== a)
                                  : [...field.value, a],
                              )
                            }
                            className={cn(
                              "rounded-full px-3 py-1.5 text-sm transition",
                              active
                                ? "bg-husrev-amber text-white"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600",
                            )}
                          >
                            {t(`sport.activity.${a}`)}
                          </button>
                        );
                      })}
                    </div>
                    {fieldState.error && (
                      <p className="mt-1.5 text-xs text-error-500">
                        {t("sport.aiModal.activityRequired", "En az bir aktivite seç.")}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={generate.isPending}
                className="husrev-btn-ghost"
              >
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={generate.isPending} className="husrev-btn">
                <BiSolidMagicWand size={16} />
                {generate.isPending
                  ? t("sport.aiModal.generating", "Üretiliyor…")
                  : t("sport.aiModal.generate", "Üret")}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5">
            <div className="rounded-2xl ring-1 ring-husrev-sand/80 bg-husrev-cream/40 p-4 dark:bg-white/[0.03] dark:ring-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
                  <BiTargetLock size={18} />
                </span>
                <h4 className="font-semibold text-husrev-ink dark:text-husrev-cream">
                  {result.name}
                </h4>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <BiCalendarCheck className="h-3.5 w-3.5" />
                  {t("sport.programs.card.weeks", "{{count}} hafta", {
                    count: result.weekCount,
                  })}
                </span>
                <span>
                  {t("sport.programs.card.sessions", "{{count}} seans", {
                    count: result.sessions.length,
                  })}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                {t(
                  "sport.aiModal.resultBody",
                  "Program oluşturuldu ve programlar listesine eklendi.",
                )}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="husrev-btn-ghost">
                {t("sport.aiModal.close", "Kapat")}
              </button>
              <button
                type="button"
                onClick={() => onViewProgram(result.id)}
                className="husrev-btn"
              >
                {t("sport.aiModal.viewProgram", "Programı gör")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
