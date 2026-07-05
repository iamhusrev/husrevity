"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import {
  useActivateSportProgram,
  useCreateSportSession,
  useDeleteSportProgram,
  useDeleteSportSession,
  useGetSportProgram,
  useReorderSportSessions,
  useUpdateSportSession,
} from "@/hooks/useSport";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { cn } from "@/utils/utils";
import {
  ACTIVITY_TYPES,
  ActivityType,
  DIFFICULTIES,
  Difficulty,
  SPORT_LOCATIONS,
  SportLocation,
  SportSessionResponse,
} from "@/types/sport/sport";
import {
  BiArrowBack,
  BiDotsVerticalRounded,
  BiEditAlt,
  BiPlus,
  BiTimeFive,
  BiTrash,
} from "react-icons/bi";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const sessionSchema = z.object({
  activityType: z.enum(ACTIVITY_TYPES),
  location: z.enum(SPORT_LOCATIONS),
  name: z.string().min(1).max(120),
  plannedDayOfWeek: z.number().min(0).max(6),
  plannedDuration: z.number().min(1),
  difficulty: z.enum(DIFFICULTIES),
  description: z.string().min(1),
});

type SessionFormValues = z.infer<typeof sessionSchema>;

const DRAG_TYPE = "SPORT_SESSION";

interface DragItem {
  index: number;
  id: string;
}

function SessionModal({
  programId,
  initial,
  onClose,
}: {
  programId: string;
  initial: SportSessionResponse | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateSportSession();
  const update = useUpdateSportSession();

  const { control, handleSubmit } = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      activityType: initial?.activityType ?? "RUNNING",
      location: initial?.location ?? "EV",
      name: initial?.name ?? "",
      plannedDayOfWeek: initial?.plannedDayOfWeek ?? 0,
      plannedDuration: initial?.plannedDuration ?? 30,
      difficulty: initial?.difficulty ?? "MODERATE",
      description: initial?.description ?? "",
    },
  });

  const isPending = create.isPending || update.isPending;

  const submit = handleSubmit(async (data) => {
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, body: data, programId });
      } else {
        await create.mutateAsync({ ...data, programId });
      }
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
            {initial
              ? t("sport.sessionModal.editKicker", "Seansı düzenle")
              : t("sport.sessionModal.newKicker", "Yeni seans")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {initial
              ? t("sport.sessionModal.editTitle", "Seansı düzenle")
              : t("sport.sessionModal.createTitle", "Yeni seans")}
          </h3>
        </div>
        <div className="husrev-rule mt-5" />

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.sessionModal.name", "Seans adı")}
            </label>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <div>
                  <input {...field} autoFocus className="husrev-input" />
                  {fieldState.error && (
                    <p className="mt-1.5 text-xs text-error-500">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.sessionModal.activityType", "Aktivite")}
              </label>
              <Controller
                control={control}
                name="activityType"
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value as ActivityType)}
                    className="husrev-input"
                  >
                    {ACTIVITY_TYPES.map((a) => (
                      <option key={a} value={a}>
                        {t(`sport.activity.${a}`)}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.sessionModal.location", "Konum")}
              </label>
              <Controller
                control={control}
                name="location"
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value as SportLocation)}
                    className="husrev-input"
                  >
                    {SPORT_LOCATIONS.map((l) => (
                      <option key={l} value={l}>
                        {t(`sport.location.${l}`)}
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
                {t("sport.sessionModal.plannedDayOfWeek", "Gün")}
              </label>
              <Controller
                control={control}
                name="plannedDayOfWeek"
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="husrev-input"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {t(`sport.day.${d}`)}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("sport.sessionModal.plannedDuration", "Süre (dk)")}
              </label>
              <Controller
                control={control}
                name="plannedDuration"
                render={({ field }) => (
                  <input
                    type="number"
                    min={1}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="husrev-input"
                  />
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.sessionModal.difficulty", "Zorluk")}
            </label>
            <Controller
              control={control}
              name="difficulty"
              render={({ field }) => (
                <div className="flex gap-2">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => field.onChange(d)}
                      className={cn(
                        "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition",
                        field.value === d
                          ? "bg-husrev-ember text-husrev-cream"
                          : "bg-husrev-sand/40 text-gray-600 hover:bg-husrev-sand/70 dark:bg-white/[0.04] dark:text-gray-300",
                      )}
                    >
                      {t(`sport.difficulty.${d}`)}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("sport.sessionModal.description", "Açıklama")}
            </label>
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <div>
                  <textarea {...field} rows={3} className="husrev-input resize-none" />
                  {fieldState.error && (
                    <p className="mt-1.5 text-xs text-error-500">{fieldState.error.message}</p>
                  )}
                </div>
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

function SessionRow({
  session,
  index,
  programId,
  moveItem,
  onDrop,
  onEdit,
}: {
  session: SportSessionResponse;
  index: number;
  programId: string;
  moveItem: (drag: number, hover: number) => void;
  onDrop: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const remove = useDeleteSportSession();
  const ref = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { index, id: session.id },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(item) {
      if (item.index === index) return;
      moveItem(item.index, index);
      item.index = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  const handleDelete = async () => {
    try {
      await remove.mutateAsync({ id: session.id, programId });
      setConfirmingDelete(false);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="group flex items-center gap-3 rounded-xl px-3 py-3 ring-1 ring-husrev-sand/70 bg-white transition hover:bg-husrev-cream/40 dark:bg-husrev-shadow dark:ring-white/[0.06] dark:hover:bg-white/[0.03]"
    >
      <span className="cursor-grab text-gray-300 dark:text-gray-600">
        <BiDotsVerticalRounded size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
            {session.name}
          </span>
          <span className="rounded-full bg-husrev-amber/15 px-2 py-0.5 text-[11px] font-medium text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            {t(`sport.activity.${session.activityType}`)}
          </span>
          <span className="rounded-full bg-husrev-sand/60 px-2 py-0.5 text-[11px] font-medium text-husrev-shadow dark:bg-white/5 dark:text-husrev-cream">
            {t(`sport.difficulty.${session.difficulty}`)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
          <span>{t(`sport.day.${session.plannedDayOfWeek}`)}</span>
          <span className="inline-flex items-center gap-1">
            <BiTimeFive className="h-3 w-3" />
            {session.plannedDuration} {t("sport.profile.minutesShort", "dk")}
          </span>
          <span>{t(`sport.location.${session.location}`)}</span>
        </div>
        {session.description && (
          <p className="mt-1 line-clamp-1 text-xs text-gray-400 dark:text-gray-500">
            {session.description}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("common.edit")}
          className="rounded-full p-2 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-husrev-amber/10 hover:text-husrev-ember"
        >
          <BiEditAlt size={14} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          aria-label={t("common.delete")}
          className="rounded-full p-2 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        >
          <BiTrash size={14} />
        </button>
      </div>

      <DeleteConfirmModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
        isPending={remove.isPending}
        title={t("sport.sessionModal.confirmDeleteTitle", "Seansı sil")}
        message={t("sport.sessionModal.confirmDeleteMessage", "Bu seansı silmek istediğine emin misin?")}
      />
    </div>
  );
}

export default function SportProgramDetail({
  programId,
  onBack,
}: {
  programId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const { data: program, isLoading } = useGetSportProgram(programId);
  const activate = useActivateSportProgram();
  const deleteProgram = useDeleteSportProgram();
  const reorderSessions = useReorderSportSessions();

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState<SportSessionResponse | null>(null);
  const [confirmingProgramDelete, setConfirmingProgramDelete] = useState(false);

  const [ordered, setOrdered] = useState<SportSessionResponse[]>([]);
  const orderedRef = useRef<SportSessionResponse[]>([]);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current && program) {
      const sorted = [...program.sessions].sort((a, b) => a.position - b.position);
      setOrdered(sorted);
      orderedRef.current = sorted;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  const moveItem = useCallback((dragIdx: number, hoverIdx: number) => {
    dragging.current = true;
    setOrdered((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIdx, 1);
      next.splice(hoverIdx, 0, item);
      orderedRef.current = next;
      return next;
    });
  }, []);

  const onDrop = useCallback(() => {
    dragging.current = false;
    const items = orderedRef.current.map((s, i) => ({ id: s.id, position: i }));
    reorderSessions.mutate({ items, programId });
  }, [reorderSessions, programId]);

  const handleToggleActive = async () => {
    if (!program) return;
    try {
      await activate.mutateAsync({ id: program.id, isActive: !program.isActive });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleDeleteProgram = async () => {
    try {
      await deleteProgram.mutateAsync(programId);
      setConfirmingProgramDelete(false);
      onBack();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  if (isLoading) {
    return (
      <div className="h-64 rounded-2xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]" />
    );
  }

  if (!program) {
    return <p className="text-gray-500">{t("sport.programDetail.notFound", "Program bulunamadı.")}</p>;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="shrink-0 rounded-full p-2 text-gray-500 ring-1 ring-husrev-sand/80 bg-white/60 hover:bg-husrev-cream hover:text-husrev-ember dark:bg-husrev-shadow/50 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-husrev-amber transition-colors"
            aria-label={t("sport.programDetail.back", "Geri")}
          >
            <BiArrowBack size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t(`sport.programType.${program.programType}`)}
            </span>
            <h2 className="truncate text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {program.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={activate.isPending}
            className={
              program.isActive
                ? "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 ring-1 ring-husrev-sand/80 hover:bg-husrev-sand/40 dark:ring-white/10"
                : "shrink-0 rounded-full bg-husrev-ember px-3 py-1.5 text-sm font-medium text-husrev-cream hover:bg-husrev-ember/90"
            }
          >
            {program.isActive
              ? t("sport.programs.deactivate", "Pasifleştir")
              : t("sport.programs.activate", "Aktifleştir")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingProgramDelete(true)}
            aria-label={t("common.delete")}
            className="shrink-0 rounded-full p-2 text-gray-500 ring-1 ring-husrev-sand/80 bg-white/60 hover:bg-red-50 hover:text-red-500 dark:bg-husrev-shadow/50 dark:ring-white/10 dark:hover:bg-red-500/10"
          >
            <BiTrash size={18} />
          </button>
        </div>

        {program.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300">{program.description}</p>
        )}

        <div className="flex items-center justify-between">
          <h3 className="husrev-kicker text-gray-500 dark:text-gray-400">
            {t("sport.programDetail.sessions", "Seanslar")}
          </h3>
          <button
            type="button"
            onClick={() => {
              setEditingSession(null);
              setShowSessionModal(true);
            }}
            className="husrev-btn"
          >
            <BiPlus size={16} />
            {t("sport.programDetail.newSession", "Yeni seans")}
          </button>
        </div>

        {ordered.length === 0 ? (
          <div className="rounded-2xl ring-1 ring-dashed ring-husrev-sand bg-husrev-cream/40 p-8 text-center text-sm text-gray-500 dark:bg-white/[0.03] dark:ring-white/[0.06] dark:text-gray-400">
            {t("sport.programDetail.noSessions", "Bu programda henüz seans yok.")}
          </div>
        ) : (
          <div className="space-y-2">
            {ordered.map((session, index) => (
              <SessionRow
                key={session.id}
                session={session}
                index={index}
                programId={programId}
                moveItem={moveItem}
                onDrop={onDrop}
                onEdit={() => {
                  setEditingSession(session);
                  setShowSessionModal(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showSessionModal && (
        <SessionModal
          programId={programId}
          initial={editingSession}
          onClose={() => setShowSessionModal(false)}
        />
      )}

      <DeleteConfirmModal
        isOpen={confirmingProgramDelete}
        onClose={() => setConfirmingProgramDelete(false)}
        onConfirm={handleDeleteProgram}
        isPending={deleteProgram.isPending}
        title={t("sport.programs.confirmDeleteTitle", "Programı sil")}
        message={t(
          "sport.programs.confirmDeleteMessage",
          "Bu programı ve tüm seanslarını silmek istediğine emin misin?",
        )}
      />
    </DndProvider>
  );
}
