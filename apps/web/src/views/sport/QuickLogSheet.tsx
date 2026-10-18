"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiMinus, BiPlus } from "react-icons/bi";
import Dialog from "@/components/ui/Dialog";
import { useUpdateSportLog } from "@/hooks/useSport";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { cn } from "@/utils/utils";
import type { SportLogResponse } from "@/types/sport/sport";

export interface QuickLogSheetProps {
  /** The log written by the one-tap "done" button; the sheet refines it in place. */
  log: SportLogResponse;
  sessionName: string;
  onClose: () => void;
}

const INTENSITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const STEP = 5;
const MIN_DURATION = 5;
const LABEL = "husrev-kicker text-gray-500 dark:text-gray-400";
const STEPPER_BUTTON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-husrev-sand/80 text-husrev-ink transition hover:bg-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber disabled:opacity-40 dark:text-husrev-cream dark:ring-white/10 dark:hover:bg-white/[0.06]";

/**
 * "How was it?" bottom sheet: intensity chips (1-10), a ±5 minute duration
 * stepper and a note, saved with `PUT /sport/logs/:id`. Sits at the bottom on
 * phones and centres on larger screens; same dialog contract as the modals.
 */
export default function QuickLogSheet({ log, sessionName, onClose }: QuickLogSheetProps) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const update = useUpdateSportLog();
  const [intensity, setIntensity] = useState(log.intensity);
  const [duration, setDuration] = useState(log.actualDuration);
  const [notes, setNotes] = useState(log.notes ?? "");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await update.mutateAsync({
        id: log.id,
        body: {
          intensity,
          // Typing may go below the stepper floor; never save less than five minutes.
          actualDuration: Math.max(MIN_DURATION, duration),
          notes: notes.trim() || null,
        },
      });
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <Dialog
      open={true}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[100000] flex items-end justify-center bg-husrev-ink/40 backdrop-blur-sm sm:items-center sm:p-4"
      panelClassName="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl husrev-modal grain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-7 husrev-settle"
      panelAs="form"
      // The clamp in `save` is the one duration rule; no native validation bubble.
      panelProps={{ onSubmit: save, noValidate: true }}
      labelledBy="sport-quick-log-title"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-husrev-sand sm:hidden dark:bg-white/10" />
      <div className="space-y-1.5">
        <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
          {t("sport.quickLog.kicker", "Nasıldı?")}
        </span>
        <h3
          id="sport-quick-log-title"
          className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream"
        >
          {t("sport.quickLog.title", "Antrenmanı değerlendir")}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{sessionName}</p>
      </div>
      <div className="husrev-rule mt-5" />

      <div className="mt-5 space-y-5">
        <div className="space-y-2">
          <div className={LABEL}>
            {t("sport.quickLog.intensity", "Yoğunluk")} —{" "}
            <span aria-live="polite">
              {t("sport.quickLog.intensityValue", "{{value}}/10", { value: intensity })}
            </span>
          </div>
          {/* Toggle buttons rather than a radiogroup: every chip stays in the Tab order,
              which is what the dialog's focus trap expects (no roving tabindex needed). */}
          <div
            role="group"
            aria-label={t("sport.quickLog.intensity", "Yoğunluk")}
            className="grid grid-cols-5 gap-2 sm:grid-cols-10"
          >
            {INTENSITIES.map((value) => {
              const checked = value === intensity;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => setIntensity(value)}
                  className={cn(
                    "min-h-10 rounded-xl text-sm font-medium tabular-nums ring-1 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber",
                    checked
                      ? "bg-husrev-ember text-husrev-cream ring-husrev-ember dark:bg-husrev-amber dark:text-husrev-ink dark:ring-husrev-amber"
                      : "bg-white text-husrev-ink ring-husrev-sand/80 hover:bg-husrev-cream dark:bg-white/[0.03] dark:text-husrev-cream dark:ring-white/10 dark:hover:bg-white/[0.06]",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sport-quick-log-duration" className={LABEL}>
            {t("sport.quickLog.duration", "Süre (dk)")}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDuration((d) => Math.max(MIN_DURATION, d - STEP))}
              disabled={duration <= MIN_DURATION}
              aria-label={t("sport.quickLog.less", "5 dakika azalt")}
              className={STEPPER_BUTTON}
            >
              <BiMinus className="h-4 w-4" aria-hidden />
            </button>
            <input
              id="sport-quick-log-duration"
              type="number"
              min={MIN_DURATION}
              step={STEP}
              value={duration}
              onChange={(e) => setDuration(Math.max(0, Number(e.target.value) || 0))}
              className="husrev-input w-24 text-center tabular-nums"
            />
            <button
              type="button"
              onClick={() => setDuration((d) => d + STEP)}
              aria-label={t("sport.quickLog.more", "5 dakika artır")}
              className={STEPPER_BUTTON}
            >
              <BiPlus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sport-quick-log-notes" className={LABEL}>
            {t("sport.quickLog.notes", "Not")}
          </label>
          <textarea
            id="sport-quick-log-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("sport.quickLog.notesPlaceholder", "Nasıl geçti?")}
            className="husrev-input resize-none"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={update.isPending}
          className="husrev-btn-ghost min-h-10"
        >
          {t("common.cancel")}
        </button>
        <button type="submit" disabled={update.isPending} className="husrev-btn min-h-10">
          {update.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Dialog>
  );
}
