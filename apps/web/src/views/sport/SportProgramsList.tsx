"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import FormFieldText from "@/components/form/FormFieldText";
import FormFieldTextarea from "@/components/form/FormFieldTextarea";
import {
  useActivateSportProgram,
  useCreateSportProgram,
  useDeleteSportProgram,
  useSportPrograms,
} from "@/hooks/useSport";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { PROGRAM_TYPES, ProgramType, SportProgramResponse } from "@/types/sport/sport";
import {
  BiCalendarCheck,
  BiPlus,
  BiSolidMagicWand,
  BiTargetLock,
  BiTrash,
} from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";
import SportAiGeneratorModal from "./SportAiGeneratorModal";

const programSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  weekCount: z.number().min(4).max(52),
  programType: z.enum(PROGRAM_TYPES),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
});

type ProgramFormValues = z.infer<typeof programSchema>;

function NewProgramModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateSportProgram();

  const { control, handleSubmit } = useForm<ProgramFormValues>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      name: "",
      description: "",
      weekCount: 8,
      programType: "WEEKLY",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
    },
  });

  const submit = handleSubmit(async (data) => {
    try {
      await create.mutateAsync({
        name: data.name.trim(),
        description: data.description?.trim() || null,
        weekCount: data.weekCount,
        programType: data.programType,
        startDate: data.startDate,
        endDate: data.endDate || null,
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
            {t("sport.programs.modal.kicker", "Yeni program")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("sport.programs.modal.title", "Antrenman programı oluştur")}
          </h3>
        </div>
        <div className="husrev-rule mt-5" />

        <div className="mt-5 space-y-4">
          <FormFieldText
            control={control}
            name="name"
            label={t("sport.programs.field.name", "Program adı")}
            required
          />
          <FormFieldTextarea
            control={control}
            name="description"
            label={t("sport.programs.field.description", "Açıklama")}
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.programs.field.weekCount", "Hafta sayısı")}
              </label>
              <Controller
                control={control}
                name="weekCount"
                render={({ field }) => (
                  <input
                    type="number"
                    min={4}
                    max={52}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="husrev-input"
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.programs.field.programType", "Tür")}
              </label>
              <Controller
                control={control}
                name="programType"
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value as ProgramType)}
                    className="husrev-input"
                  >
                    {PROGRAM_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {t(`sport.programType.${pt}`)}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.programs.field.startDate", "Başlangıç")}
              </label>
              <Controller
                control={control}
                name="startDate"
                render={({ field }) => (
                  <input type="date" {...field} className="husrev-input" />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.programs.field.endDate", "Bitiş")}
              </label>
              <Controller
                control={control}
                name="endDate"
                render={({ field }) => (
                  <input type="date" {...field} className="husrev-input" />
                )}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={create.isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={create.isPending} className="husrev-btn">
            {create.isPending ? t("common.saving") : t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProgramCard({
  program,
  onOpenDetail,
}: {
  program: SportProgramResponse;
  onOpenDetail: (id: string) => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const activate = useActivateSportProgram();
  const remove = useDeleteSportProgram();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleToggleActive = async () => {
    try {
      await activate.mutateAsync({ id: program.id, isActive: !program.isActive });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(program.id);
      setConfirmingDelete(false);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm husrev-lift dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-husrev-amber via-husrev-ember to-husrev-amber/0 opacity-50 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="flex items-start justify-between gap-2 p-5 pb-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            <BiTargetLock size={18} />
          </span>
          {program.aiGenerated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-husrev-moss/15 px-2 py-0.5 text-[11px] font-medium text-husrev-moss">
              <HiSparkles className="h-3 w-3" />
              {t("sport.programs.aiGenerated", "AI")}
            </span>
          )}
          {program.isActive && (
            <span className="rounded-full bg-husrev-amber/15 px-2 py-0.5 text-[11px] font-medium text-husrev-ember dark:text-husrev-amber">
              {t("sport.programs.active", "Aktif")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          aria-label={t("common.delete")}
          className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        >
          <BiTrash size={16} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onOpenDetail(program.id)}
        className="block w-full cursor-pointer p-5 pt-3 text-left"
      >
        <h3 className="text-lg font-semibold leading-tight tracking-tight text-husrev-ink dark:text-husrev-cream group-hover:text-husrev-ember dark:group-hover:text-husrev-amber transition-colors">
          {program.name}
        </h3>
        {program.description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-gray-500 dark:text-gray-400">
            {program.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <BiCalendarCheck className="h-3.5 w-3.5" />
            {t("sport.programs.card.weeks", "{{count}} hafta", { count: program.weekCount })}
          </span>
          <span>{t(`sport.programType.${program.programType}`)}</span>
          <span>
            {t("sport.programs.card.sessions", "{{count}} seans", {
              count: program.sessions.length,
            })}
          </span>
        </div>
      </button>

      <div className="flex items-center justify-between border-t border-husrev-sand/60 px-5 py-3 dark:border-white/[0.06]">
        <span className="husrev-kicker text-gray-400 dark:text-gray-500">
          {t("sport.programs.openDetail", "Detayı gör")}
        </span>
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={activate.isPending}
          className={
            program.isActive
              ? "rounded-full px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-husrev-sand/80 hover:bg-husrev-sand/40 dark:ring-white/10"
              : "rounded-full bg-husrev-ember px-3 py-1 text-xs font-medium text-husrev-cream hover:bg-husrev-ember/90"
          }
        >
          {program.isActive
            ? t("sport.programs.deactivate", "Pasifleştir")
            : t("sport.programs.activate", "Aktifleştir")}
        </button>
      </div>

      <DeleteConfirmModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        isPending={remove.isPending}
        title={t("sport.programs.confirmDeleteTitle", "Programı sil")}
        message={t(
          "sport.programs.confirmDeleteMessage",
          "Bu programı ve tüm seanslarını silmek istediğine emin misin?",
        )}
      />
    </article>
  );
}

export default function SportProgramsList({
  onOpenDetail,
}: {
  onOpenDetail: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: programs = [], isLoading } = useSportPrograms();
  const [showNewModal, setShowNewModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          {t("sport.programs.intro", "Antrenman programlarını oluştur, yönet ya da AI ile üret.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="husrev-btn-ghost"
          >
            <BiSolidMagicWand size={16} />
            {t("sport.programs.generateAi", "AI ile oluştur")}
          </button>
          <button type="button" onClick={() => setShowNewModal(true)} className="husrev-btn">
            <BiPlus size={16} />
            {t("sport.programs.newProgram", "Yeni program")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]"
            />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl ring-1 ring-dashed ring-husrev-sand bg-husrev-cream/50 grain p-12 text-center dark:bg-husrev-shadow/60 dark:ring-white/[0.06]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            <BiTargetLock size={22} />
          </div>
          <h3 className="mt-5 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("sport.programs.empty.title", "Henüz programın yok")}
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            {t(
              "sport.programs.empty.body",
              "Yeni bir antrenman programı oluştur ya da yapay zekaya bırak.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setShowNewModal(true)} className="husrev-btn">
              <BiPlus size={16} />
              {t("sport.programs.newProgram", "Yeni program")}
            </button>
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="husrev-btn-ghost"
            >
              <BiSolidMagicWand size={16} />
              {t("sport.programs.generateAi", "AI ile oluştur")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 husrev-stagger">
          {programs.map((p) => (
            <ProgramCard key={p.id} program={p} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}

      {showNewModal && <NewProgramModal onClose={() => setShowNewModal(false)} />}
      {showAiModal && (
        <SportAiGeneratorModal
          onClose={() => setShowAiModal(false)}
          onViewProgram={(id) => {
            setShowAiModal(false);
            onOpenDetail(id);
          }}
        />
      )}
    </div>
  );
}
