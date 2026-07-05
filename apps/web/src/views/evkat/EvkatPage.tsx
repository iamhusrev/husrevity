"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  ALL_DAYS_MASK,
  ROUTINE_COLOR_TOKENS,
  RoutineActivityResponse,
  RoutineColorToken,
  RoutineSegmentRequest,
  RoutineSegmentResponse,
} from "@/types/routine/routine";
import {
  useCreateRoutineActivity,
  useCreateRoutineSegment,
  useDeleteRoutineActivity,
  useDeleteRoutineSegment,
  useReorderRoutineSegments,
  useRoutineSegments,
  useUpdateRoutineSegment,
} from "@/hooks/useRoutine";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { cn } from "@/utils/utils";
import {
  BiPlus,
  BiTrash,
  BiPencil,
  BiChevronUp,
  BiChevronDown,
  BiX,
} from "react-icons/bi";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const COLOR_STRIPE_CLASS: Record<RoutineColorToken, string> = {
  "husrev-amber": "bg-husrev-amber",
  "husrev-ember": "bg-husrev-ember",
  "husrev-moss": "bg-husrev-moss",
  "husrev-ink": "bg-husrev-ink",
  "husrev-sand": "bg-husrev-sand",
};

const COLOR_RING_CLASS: Record<RoutineColorToken, string> = {
  "husrev-amber": "ring-husrev-amber/30",
  "husrev-ember": "ring-husrev-ember/30",
  "husrev-moss": "ring-husrev-moss/30",
  "husrev-ink": "ring-husrev-ink/30",
  "husrev-sand": "ring-husrev-sand/60",
};

function minutesToTimeInput(m: number | null): string {
  if (m === null || m === undefined) return "";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeInputToMinutes(v: string): number | null {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function rangeLabel(start: number | null, end: number | null): string {
  const fmt = minutesToTimeInput;
  if (start === null && end === null) return "Tüm gün";
  if (start === null) return `→ ${fmt(end)}`;
  if (end === null) return `${fmt(start)} →`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function resolveColor(s: RoutineSegmentResponse): RoutineColorToken {
  return s.colorToken ?? "husrev-amber";
}

export default function EvkatPage() {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const { data, isLoading, isError, refetch } = useRoutineSegments();
  const reorder = useReorderRoutineSegments();
  const [editing, setEditing] = useState<{
    segment: RoutineSegmentResponse | null;
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const todayIdx = (new Date().getDay() + 6) % 7; // Monday=0, Sunday=6

  const segments = useMemo(() => data ?? [], [data]);

  const visibleSegments = useMemo(
    () =>
      selectedDay === null
        ? segments
        : segments.filter((s) => (s.daysOfWeek & (1 << selectedDay)) !== 0),
    [segments, selectedDay],
  );

  const moveSegment = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    try {
      await reorder.mutateAsync(
        next.map((s, i) => ({ id: s.id, position: i })),
      );
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("evkat.title", "Evkat")}
        kicker={t("evkat.kicker", "Günlük rutin")}
        flourish={t("evkat.flourish", "vakitler")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-600 dark:text-gray-300">
          {t(
            "evkat.intro",
            "Gününü bölen sabit vakitler ve her vakte bağlı işler. Her gün tekrar eden şablonun.",
          )}
        </p>
        <button
          type="button"
          onClick={() => setEditing({ segment: null })}
          className="husrev-btn"
        >
          <BiPlus className="h-4 w-4" />
          {t("evkat.newSegment", "Yeni vakit")}
        </button>
      </div>

      {isError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl ring-1 ring-husrev-sand bg-white px-4 py-3 text-sm text-error-500 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <span>{t("evkat.error", "Vakitler yüklenemedi.")}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded px-2 py-1 text-xs text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
          >
            {t("common.retry", "Tekrar dene")}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
            />
          ))}
        </div>
      )}

      {!isLoading && !isError && segments.length === 0 && (
        <div className="rounded-2xl ring-1 ring-husrev-sand bg-white px-6 py-12 text-center shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <div className="husrev-kicker text-husrev-amber">
            {t("evkat.empty.kicker", "Vakitlerin hazır değil")}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
            {t(
              "evkat.empty.body",
              "Kendi vakitlerini ekleyerek Evkat'ını oluşturmaya başla.",
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setEditing({ segment: null })}
              className="husrev-btn"
            >
              {t("evkat.newSegment", "Yeni vakit")}
            </button>
          </div>
        </div>
      )}

      {!isLoading && !isError && segments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition",
              selectedDay === null
                ? "bg-husrev-amber text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300",
            )}
          >
            {t("evkat.allWeek", "Tüm hafta")}
          </button>
          {DAY_NAMES.map((name, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedDay(idx)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition",
                selectedDay === idx
                  ? "bg-husrev-amber text-white"
                  : idx === todayIdx
                    ? "bg-husrev-amber/10 text-husrev-amber hover:bg-husrev-amber/20"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {visibleSegments.map((segment) => {
          const realIndex = segments.findIndex((s) => s.id === segment.id);
          return (
            <SegmentCard
              key={segment.id}
              segment={segment}
              isFirst={realIndex === 0}
              isLast={realIndex === segments.length - 1}
              onEdit={() => setEditing({ segment })}
              onMoveUp={() => moveSegment(realIndex, -1)}
              onMoveDown={() => moveSegment(realIndex, 1)}
              showAlert={showAlert}
            />
          );
        })}
      </div>

      {editing && (
        <EditSegmentModal
          initial={editing.segment}
          onClose={() => setEditing(null)}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}

function SegmentCard({
  segment,
  isFirst,
  isLast,
  onEdit,
  onMoveUp,
  onMoveDown,
  showAlert,
}: {
  segment: RoutineSegmentResponse;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const color = resolveColor(segment);
  const createActivity = useCreateRoutineActivity();
  const deleteActivity = useDeleteRoutineActivity();
  const [newActivity, setNewActivity] = useState("");

  const addActivity = async () => {
    const text = newActivity.trim();
    if (!text) return;
    try {
      await createActivity.mutateAsync({
        segmentId: segment.id,
        body: { text },
      });
      setNewActivity("");
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const removeActivity = async (a: RoutineActivityResponse) => {
    try {
      await deleteActivity.mutateAsync(a.id);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-white shadow-card-warm ring-1 ${COLOR_RING_CLASS[color]} dark:bg-husrev-shadow`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[4px] ${COLOR_STRIPE_CLASS[color]}`}
      />
      <div className="pl-5 pr-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium tabular-nums text-husrev-ember dark:text-husrev-amber">
                {rangeLabel(segment.startMinute, segment.endMinute)}
              </span>
              {segment.theme && (
                <span className="rounded-full bg-husrev-sand/50 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                  {segment.theme}
                </span>
              )}
            </div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {segment.name}
            </h3>
          </div>
          <div className="flex flex-none items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <IconBtn
              onClick={onMoveUp}
              disabled={isFirst}
              label={t("evkat.moveUp", "Yukarı taşı")}
            >
              <BiChevronUp className="h-4 w-4" />
            </IconBtn>
            <IconBtn
              onClick={onMoveDown}
              disabled={isLast}
              label={t("evkat.moveDown", "Aşağı taşı")}
            >
              <BiChevronDown className="h-4 w-4" />
            </IconBtn>
            <IconBtn onClick={onEdit} label={t("common.edit", "Düzenle")}>
              <BiPencil className="h-4 w-4" />
            </IconBtn>
          </div>
        </div>

        {segment.notes && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
            {segment.notes}
          </p>
        )}

        <ul className="mt-3 space-y-1">
          {segment.activities.map((a) => (
            <li
              key={a.id}
              className="group/act flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-husrev-ink hover:bg-husrev-cream/60 dark:text-husrev-cream dark:hover:bg-white/[0.04]"
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 flex-none rounded-full ${COLOR_STRIPE_CLASS[color]}`}
              />
              <span className="min-w-0 flex-1 truncate">{a.text}</span>
              <button
                type="button"
                onClick={() => removeActivity(a)}
                aria-label={t("common.delete", "Sil")}
                className="flex-none rounded p-0.5 text-gray-400 opacity-0 transition hover:text-error-500 group-hover/act:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500"
              >
                <BiX className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center gap-2 pl-2">
          <input
            value={newActivity}
            onChange={(e) => setNewActivity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addActivity();
              }
            }}
            maxLength={300}
            placeholder={t("evkat.addActivity", "İş ekle…")}
            className="husrev-input h-9 flex-1 text-sm"
          />
          <button
            type="button"
            onClick={addActivity}
            disabled={!newActivity.trim() || createActivity.isPending}
            className="husrev-btn-ghost h-9 px-3 text-sm"
          >
            <BiPlus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-cream hover:text-husrev-ink disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:hover:bg-white/[0.06] dark:hover:text-husrev-cream"
    >
      {children}
    </button>
  );
}

function EditSegmentModal({
  initial,
  onClose,
  showAlert,
}: {
  initial: RoutineSegmentResponse | null;
  onClose: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateRoutineSegment();
  const update = useUpdateRoutineSegment();
  const remove = useDeleteRoutineSegment();

  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(minutesToTimeInput(initial?.startMinute ?? null));
  const [end, setEnd] = useState(minutesToTimeInput(initial?.endMinute ?? null));
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [colorToken, setColorToken] = useState<RoutineColorToken | "">(
    initial?.colorToken ?? "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [daysOfWeek, setDaysOfWeek] = useState<number>(
    initial?.daysOfWeek ?? ALL_DAYS_MASK,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const body: RoutineSegmentRequest = {
      name: name.trim(),
      startMinute: timeInputToMinutes(start),
      endMinute: timeInputToMinutes(end),
      theme: theme.trim() || null,
      colorToken: (colorToken || null) as RoutineColorToken | null,
      notes: notes.trim() || null,
      daysOfWeek,
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
  };

  const confirmDelete = async () => {
    if (!initial) return;
    try {
      await remove.mutateAsync(initial.id);
      setConfirmingDelete(false);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const isPending = create.isPending || update.isPending || remove.isPending;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl husrev-modal grain p-5 sm:p-7 husrev-settle"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {initial
                ? t("evkat.modal.editKicker", "Düzenle")
                : t("evkat.modal.newKicker", "Yeni vakit")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {initial
                ? t("evkat.modal.editTitle", "Vakti düzenle")
                : t("evkat.modal.createTitle", "Yeni vakit")}
            </h3>
          </div>
          {initial && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              aria-label={t("common.delete", "Sil")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <Field label={t("evkat.field.name", "Vakit adı")}>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="husrev-input"
              placeholder={t("evkat.placeholders.name", "Güne Hazırlık")}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("evkat.field.start", "Başlangıç")}>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="husrev-input"
              />
            </Field>
            <Field label={t("evkat.field.end", "Bitiş")}>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="husrev-input"
              />
            </Field>
          </div>
          <p className="-mt-2 text-[11px] text-gray-400">
            {t(
              "evkat.timeHint",
              "Saat boş bırakılırsa vakit açık uçlu olur (örn. yalnızca bitiş = ‘öncesi’).",
            )}
          </p>

          <Field label={t("evkat.field.theme", "Tema")}>
            <input
              maxLength={60}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="husrev-input"
              placeholder={t("evkat.placeholders.theme", "Gelişim")}
            />
          </Field>

          <Field label={t("evkat.field.color", "Renk")}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setColorToken("")}
                aria-label={t("evkat.colorAuto", "Otomatik")}
                className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-husrev-cream dark:ring-offset-husrev-ink transition focus-visible:outline-hidden focus-visible:ring-2 ${
                  colorToken === "" ? "ring-husrev-ember" : "ring-transparent"
                } bg-gradient-to-br from-husrev-sand to-husrev-amber/40`}
              />
              {ROUTINE_COLOR_TOKENS.map((tok) => (
                <button
                  key={tok}
                  type="button"
                  onClick={() => setColorToken(tok)}
                  aria-label={tok}
                  className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-husrev-cream dark:ring-offset-husrev-ink transition focus-visible:outline-hidden focus-visible:ring-2 ${
                    colorToken === tok ? "ring-husrev-ember" : "ring-transparent"
                  } ${COLOR_STRIPE_CLASS[tok]}`}
                />
              ))}
            </div>
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="husrev-kicker text-gray-600 dark:text-gray-300">
                {t("evkat.field.daysOfWeek", "Günler")}
              </span>
              <button
                type="button"
                onClick={() => setDaysOfWeek(ALL_DAYS_MASK)}
                className="text-xs text-husrev-ember hover:underline dark:text-husrev-amber"
              >
                {t("evkat.allWeek", "Tüm hafta")}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {DAY_NAMES.map((name, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    const isOnlyDaySet = daysOfWeek === 1 << idx;
                    if (isOnlyDaySet) return; // keep at least one day selected
                    setDaysOfWeek((m) => m ^ (1 << idx));
                  }}
                  className={cn(
                    "rounded-full px-2 py-1 text-xs font-medium transition",
                    (daysOfWeek & (1 << idx)) !== 0
                      ? "bg-husrev-amber text-white"
                      : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t(
                "evkat.daysHint",
                "Varsayılan olarak her gün gösterilir; belirli günler için sadece onları işaretle.",
              )}
            </p>
          </div>

          <Field label={t("evkat.field.notes", "Notlar")}>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="husrev-input resize-none"
              placeholder={t("evkat.placeholders.notes", "İsteğe bağlı not…")}
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel", "İptal")}
          </button>
          <button type="submit" disabled={isPending} className="husrev-btn">
            {isPending
              ? t("common.saving", "Kaydediliyor…")
              : initial
                ? t("common.save", "Kaydet")
                : t("common.create", "Oluştur")}
          </button>
        </div>
      </form>

      <DeleteConfirmModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        isPending={remove.isPending}
        title={t("evkat.confirmDeleteTitle", "Vakti sil")}
        message={t(
          "evkat.confirmDelete",
          "Bu vakti ve içindeki işleri silmek istediğine emin misin?",
        )}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="husrev-kicker text-gray-600 dark:text-gray-300">
        {label}
      </span>
      {children}
    </label>
  );
}
