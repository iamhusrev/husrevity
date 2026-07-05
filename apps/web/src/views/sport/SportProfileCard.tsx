"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useSportProfile, useUpdateSportProfile } from "@/hooks/useSport";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { cn } from "@/utils/utils";
import { ACTIVITY_TYPES, ActivityType, FITNESS_LEVELS, FitnessLevel } from "@/types/sport/sport";
import { BiEditAlt, BiRun, BiTargetLock } from "react-icons/bi";

const profileSchema = z.object({
  fitnessLevel: z.enum(FITNESS_LEVELS),
  weeklyHours: z.number().min(1).max(168),
  preferredActivities: z.array(z.string()),
  goals: z.string().optional(),
  notes: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function EditProfileModal({
  initial,
  onClose,
}: {
  initial: ProfileFormValues;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const update = useUpdateSportProfile();

  const { control, handleSubmit } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial,
  });

  const submit = handleSubmit(async (data) => {
    try {
      await update.mutateAsync({
        fitnessLevel: data.fitnessLevel,
        weeklyHours: data.weeklyHours,
        preferredActivities: data.preferredActivities,
        goals: data.goals?.trim() || null,
        notes: data.notes?.trim() || null,
      });
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  });

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
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("sport.profile.editKicker", "Profil")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("sport.profile.editTitle", "Spor profilini düzenle")}
          </h3>
        </div>
        <div className="husrev-rule mt-5" />

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.profile.fitnessLevel", "Seviye")}
            </label>
            <Controller
              control={control}
              name="fitnessLevel"
              render={({ field }) => (
                <div className="flex gap-2">
                  {FITNESS_LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => field.onChange(lvl)}
                      className={cn(
                        "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition",
                        field.value === lvl
                          ? "bg-husrev-ember text-husrev-cream"
                          : "bg-husrev-sand/40 text-gray-600 hover:bg-husrev-sand/70 dark:bg-white/[0.04] dark:text-gray-300",
                      )}
                    >
                      {t(`sport.fitnessLevel.${lvl}`)}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.profile.weeklyHours", "Haftalık hedef saat")}
            </label>
            <Controller
              control={control}
              name="weeklyHours"
              render={({ field, fieldState }) => (
                <div>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="husrev-input"
                  />
                  {fieldState.error && (
                    <p className="mt-1.5 text-xs text-error-500">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.profile.activities", "Tercih edilen aktiviteler")}
            </label>
            <Controller
              control={control}
              name="preferredActivities"
              render={({ field }) => (
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
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.profile.goals", "Hedefler")}
            </label>
            <Controller
              control={control}
              name="goals"
              render={({ field }) => (
                <textarea
                  {...field}
                  rows={2}
                  className="husrev-input resize-none"
                  placeholder={t("sport.profile.goalsPlaceholder", "Örn. 10km koşu, esneklik…")}
                />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.profile.notes", "Notlar")}
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
            disabled={update.isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={update.isPending} className="husrev-btn">
            {update.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SportProfileCard() {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useSportProfile();
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="h-48 rounded-2xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]" />
    );
  }

  if (!profile) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <span className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-husrev-amber/8 blur-2xl" />
      <div className="relative p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
              <BiRun size={20} />
            </span>
            <div>
              <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
                {t(`sport.fitnessLevel.${profile.fitnessLevel}`)}
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
                {t("sport.profile.title", "Spor profilim")}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={t("sport.profile.editCta", "Profili düzenle")}
            className="shrink-0 rounded-full p-2 text-gray-500 ring-1 ring-husrev-sand/80 bg-white/60 hover:bg-husrev-cream hover:text-husrev-ember dark:bg-husrev-shadow/50 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-husrev-amber transition-colors"
          >
            <BiEditAlt size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <span className="husrev-kicker text-gray-400 dark:text-gray-500">
              {t("sport.profile.weeklyHours", "Haftalık hedef")}
            </span>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-husrev-ink dark:text-husrev-cream">
              {profile.weeklyHours}
              <span className="ml-1 text-sm font-normal text-gray-400">
                {t("sport.profile.hoursShort", "sa")}
              </span>
            </p>
          </div>
        </div>

        {profile.preferredActivities.length > 0 && (
          <div className="mt-5">
            <span className="husrev-kicker text-gray-400 dark:text-gray-500">
              {t("sport.profile.activities", "Tercih edilen aktiviteler")}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {profile.preferredActivities.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-husrev-sand/60 px-2.5 py-1 text-xs font-medium text-husrev-shadow dark:bg-white/5 dark:text-husrev-cream"
                >
                  {t(`sport.activity.${a}`, a)}
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.goals && (
          <div className="mt-5 flex items-start gap-2">
            <BiTargetLock className="mt-0.5 h-4 w-4 shrink-0 text-husrev-ember dark:text-husrev-amber" />
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {profile.goals}
            </p>
          </div>
        )}

        {profile.notes && (
          <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {profile.notes}
          </p>
        )}
      </div>

      {editing && (
        <EditProfileModal
          initial={{
            fitnessLevel: profile.fitnessLevel as FitnessLevel,
            weeklyHours: profile.weeklyHours,
            preferredActivities: profile.preferredActivities as ActivityType[],
            goals: profile.goals ?? "",
            notes: profile.notes ?? "",
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
