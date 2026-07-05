"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useCreateSportLog, useDeleteSportLog, useUpdateSportLog } from "@/hooks/useSport";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { cn } from "@/utils/utils";
import { SportLogResponse } from "@/types/sport/sport";
import { BiTrash } from "react-icons/bi";

export interface SessionOption {
  id: string;
  label: string;
}

const logSchema = z.object({
  sessionId: z.string().optional(),
  executedDate: z.string().min(1),
  actualDuration: z.number().min(0),
  completed: z.boolean(),
  intensity: z.number().min(1).max(10),
  notes: z.string().optional(),
  caloriesBurned: z.number().optional(),
});

type LogFormValues = z.infer<typeof logSchema>;

export default function SportLogModal({
  initial,
  sessionOptions,
  defaultDate,
  onClose,
}: {
  initial: SportLogResponse | null;
  sessionOptions: SessionOption[];
  defaultDate?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateSportLog();
  const update = useUpdateSportLog();
  const remove = useDeleteSportLog();

  const { control, handleSubmit } = useForm<LogFormValues>({
    resolver: zodResolver(logSchema),
    defaultValues: {
      sessionId: initial?.sessionId ?? "",
      executedDate:
        initial?.executedDate ?? defaultDate ?? new Date().toISOString().slice(0, 10),
      actualDuration: initial?.actualDuration ?? 30,
      completed: initial?.completed ?? true,
      intensity: initial?.intensity ?? 5,
      notes: initial?.notes ?? "",
      caloriesBurned: initial?.caloriesBurned ?? undefined,
    },
  });

  const isPending = create.isPending || update.isPending || remove.isPending;

  const submit = handleSubmit(async (data) => {
    const body = {
      sessionId: data.sessionId || null,
      executedDate: data.executedDate,
      actualDuration: data.actualDuration,
      completed: data.completed,
      intensity: data.intensity,
      notes: data.notes?.trim() || null,
      caloriesBurned: data.caloriesBurned ?? null,
    };
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, body });
      } else {
        await create.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  });

  const handleDelete = async () => {
    if (!initial) return;
    try {
      await remove.mutateAsync(initial.id);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl husrev-modal grain p-5 sm:p-7 husrev-settle"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {initial
                ? t("sport.logModal.editKicker", "Antrenmanı düzenle")
                : t("sport.logModal.newKicker", "Antrenman kaydı")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {initial
                ? t("sport.logModal.editTitle", "Kaydı düzenle")
                : t("sport.logModal.createTitle", "Antrenman logla")}
            </h3>
          </div>
          {initial && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              aria-label={t("common.delete")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="husrev-rule mt-5" />

        <div className="mt-5 space-y-4">
          {sessionOptions.length > 0 && (
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.logModal.session", "Seans")}
              </label>
              <Controller
                control={control}
                name="sessionId"
                render={({ field }) => (
                  <select {...field} className="husrev-input">
                    <option value="">{t("sport.logModal.none", "Serbest antrenman")}</option>
                    {sessionOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.logModal.date", "Tarih")}
              </label>
              <Controller
                control={control}
                name="executedDate"
                render={({ field }) => (
                  <input type="date" {...field} className="husrev-input" />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.logModal.duration", "Süre (dk)")}
              </label>
              <Controller
                control={control}
                name="actualDuration"
                render={({ field }) => (
                  <input
                    type="number"
                    min={0}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="husrev-input"
                  />
                )}
              />
            </div>
          </div>

          <Controller
            control={control}
            name="intensity"
            render={({ field }) => (
              <div className="space-y-1.5">
                <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                  {t("sport.logModal.intensity", "Yoğunluk")} — {field.value}/10
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  className="w-full accent-husrev-ember"
                />
              </div>
            )}
          />

          <Controller
            control={control}
            name="completed"
            render={({ field }) => (
              <button
                type="button"
                onClick={() => field.onChange(!field.value)}
                aria-pressed={field.value}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left ring-1 transition",
                  field.value
                    ? "bg-husrev-moss/10 ring-husrev-moss/30 dark:bg-husrev-moss/15"
                    : "bg-husrev-sand/40 ring-husrev-sand/70 dark:bg-white/[0.04] dark:ring-white/[0.06]",
                )}
              >
                <span className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                  {t("sport.logModal.completed", "Tamamlandı")}
                </span>
                <span
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition",
                    field.value ? "bg-husrev-moss" : "bg-gray-300 dark:bg-white/20",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition",
                      field.value ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </span>
              </button>
            )}
          />

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.logModal.calories", "Yakılan kalori (opsiyonel)")}
            </label>
            <Controller
              control={control}
              name="caloriesBurned"
              render={({ field }) => (
                <input
                  type="number"
                  min={0}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  className="husrev-input"
                />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.logModal.notes", "Not")}
            </label>
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <textarea {...field} rows={2} className="husrev-input resize-none" />
              )}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={isPending} className="husrev-btn">
            {isPending ? t("common.saving") : initial ? t("common.save") : t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
