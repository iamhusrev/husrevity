"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DateTimePicker from "@/components/datetime/DateTimePicker";
import {
  CATEGORY_COLOR_FALLBACK,
  TIME_BLOCK_CATEGORIES,
  TIME_BLOCK_COLOR_TOKENS,
  TimeBlockCategory,
  TimeBlockColorToken,
  TimeBlockRequest,
  TimeBlockResponse,
} from "@/types/time-block/time-block";
import {
  useCreateTimeBlock,
  useDeleteTimeBlock,
  useTimeBlocksForDate,
  useToggleTimeBlockComplete,
  useUpdateTimeBlock,
} from "@/hooks/useTimeBlocks";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { BiPlus, BiTrash, BiChevronLeft, BiChevronRight } from "react-icons/bi";
import { HiOutlineCheck } from "react-icons/hi2";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOUR_PX = 60;
const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

const COLOR_STRIPE_CLASS: Record<TimeBlockColorToken, string> = {
  "husrev-amber": "bg-husrev-amber",
  "husrev-ember": "bg-husrev-ember",
  "husrev-moss": "bg-husrev-moss",
  "husrev-ink": "bg-husrev-ink",
  "husrev-sand": "bg-husrev-sand",
};

const COLOR_RING_CLASS: Record<TimeBlockColorToken, string> = {
  "husrev-amber": "ring-husrev-amber/30",
  "husrev-ember": "ring-husrev-ember/30",
  "husrev-moss": "ring-husrev-moss/30",
  "husrev-ink": "ring-husrev-ink/30",
  "husrev-sand": "ring-husrev-sand/60",
};

function toDateInputString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveColorToken(b: TimeBlockResponse): TimeBlockColorToken {
  if (b.colorToken) return b.colorToken;
  if (b.category) return CATEGORY_COLOR_FALLBACK[b.category];
  return "husrev-amber";
}

interface BlockGeometry {
  block: TimeBlockResponse;
  topPx: number;
  heightPx: number;
  startsBefore: boolean;
  endsAfter: boolean;
}

function geometryFor(b: TimeBlockResponse): BlockGeometry {
  const start = new Date(b.startAt);
  const end = new Date(b.endAt);
  const dayStart = new Date(start);
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);

  const startMs = Math.max(start.getTime(), dayStart.getTime());
  const endMs = Math.min(end.getTime(), dayEnd.getTime());
  const startMinutes = (startMs - dayStart.getTime()) / 60_000;
  const durationMinutes = Math.max(20, (endMs - startMs) / 60_000); // floor at 20min so labels stay readable

  return {
    block: b,
    topPx: (startMinutes / 60) * HOUR_PX,
    heightPx: (durationMinutes / 60) * HOUR_PX,
    startsBefore: start.getTime() < dayStart.getTime(),
    endsAfter: end.getTime() > dayEnd.getTime(),
  };
}

export default function EvkatPage() {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [editing, setEditing] = useState<{
    block: TimeBlockResponse | null;
    seedStart?: Date;
  } | null>(null);

  const dateStr = toDateInputString(selectedDate);
  const { data, isLoading, isError, refetch } = useTimeBlocksForDate(dateStr);

  const blocks = useMemo(() => data ?? [], [data]);
  const geometries = useMemo(() => blocks.map(geometryFor), [blocks]);
  const nowOffsetPx = useMemo(() => {
    const today = new Date();
    if (toDateInputString(today) !== dateStr) return null;
    const dayStart = new Date(today);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(today);
    dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
    if (today < dayStart || today > dayEnd) return null;
    return ((today.getTime() - dayStart.getTime()) / 60_000 / 60) * HOUR_PX;
  }, [dateStr]);

  const onPrev = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };
  const onNext = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };
  const onToday = () => setSelectedDate(new Date());

  const dateLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const onSlotClick = (hour: number) => {
    const seed = new Date(selectedDate);
    seed.setHours(hour, 0, 0, 0);
    setEditing({ block: null, seedStart: seed });
  };

  const hasError = isError;

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("evkat.title", "Evkat")}
        kicker={t("evkat.kicker", "Daily time blocks")}
        flourish={t("evkat.flourish", "blocks")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Önceki gün"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white ring-1 ring-husrev-sand text-husrev-ink hover:bg-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow dark:ring-white/10 dark:text-husrev-cream"
          >
            <BiChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="husrev-pill text-husrev-ember hover:bg-husrev-amber/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
          >
            {t("evkat.today", "Bugün")}
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Sonraki gün"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white ring-1 ring-husrev-sand text-husrev-ink hover:bg-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow dark:ring-white/10 dark:text-husrev-cream"
          >
            <BiChevronRight className="h-5 w-5" />
          </button>
          <span className="ml-2 text-sm text-gray-600 dark:text-gray-300 capitalize">
            {dateLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSlotClick(new Date().getHours() || 9)}
          className="husrev-btn"
        >
          <BiPlus className="h-4 w-4" />
          {t("evkat.newBlock", "Yeni blok")}
        </button>
      </div>

      <div className="rounded-2xl ring-1 ring-husrev-sand bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
        {hasError && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-error-500">
            <span>{t("evkat.error", "Bloklar yüklenemedi.")}</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded px-2 py-1 text-xs text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
            >
              {t("common.retry", "Tekrar dene")}
            </button>
          </div>
        )}

        <div className="relative px-2 pt-4 pb-3 sm:px-3">
          {/* Hour stack */}
          <div
            className="grid"
            style={{
              gridTemplateRows: `repeat(${TOTAL_HOURS}, ${HOUR_PX}px)`,
              gridTemplateColumns: "64px 1fr",
            }}
          >
            {Array.from({ length: TOTAL_HOURS }, (_, i) => {
              const hour = DAY_START_HOUR + i;
              return (
                <div key={`label-${hour}`} className="row-span-1 col-start-1 relative">
                  <span className="absolute -top-2 right-3 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                  <div className="absolute inset-y-0 right-0 w-px bg-husrev-sand/70 dark:bg-white/[0.06]" />
                </div>
              );
            })}
            {Array.from({ length: TOTAL_HOURS }, (_, i) => {
              const hour = DAY_START_HOUR + i;
              return (
                <button
                  key={`slot-${hour}`}
                  type="button"
                  onClick={() => onSlotClick(hour)}
                  className="row-span-1 col-start-2 relative border-b border-husrev-sand/50 last:border-b-0 hover:bg-husrev-cream/60 focus-visible:outline-hidden focus-visible:bg-husrev-amber/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-husrev-amber transition-colors dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                  aria-label={`${String(hour).padStart(2, "0")}:00 — yeni blok`}
                />
              );
            })}

            {/* Loading skeleton */}
            {isLoading && (
              <div className="col-start-2 col-span-1 row-start-1 row-span-full relative pointer-events-none">
                {[0, 3, 7, 11].map((offset) => (
                  <div
                    key={offset}
                    className="absolute left-2 right-2 rounded-xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
                    style={{
                      top: `${offset * HOUR_PX + 8}px`,
                      height: `${HOUR_PX * 1.5 - 16}px`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Now indicator */}
            {nowOffsetPx !== null && (
              <div
                className="col-start-2 col-span-1 row-start-1 row-span-full pointer-events-none relative"
                aria-hidden="true"
              >
                <div
                  className="absolute left-0 right-2 flex items-center"
                  style={{ top: `${nowOffsetPx}px` }}
                >
                  <span className="h-2 w-2 rounded-full bg-husrev-amber" />
                  <span className="ml-0 h-px flex-1 bg-husrev-amber/70" />
                </div>
              </div>
            )}

            {/* Blocks */}
            <div
              className="col-start-2 col-span-1 row-start-1 row-span-full relative pointer-events-none"
              aria-label="Time blocks"
            >
              {geometries.map((g) => (
                <BlockCard key={g.block.id} geom={g} onClick={() => setEditing({ block: g.block })} />
              ))}
            </div>
          </div>

          {/* Empty state */}
          {!isLoading && !hasError && blocks.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
              <div className="husrev-kicker text-husrev-amber">
                {t("evkat.empty.kicker", "Boş bir tuval")}
              </div>
              <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                {t(
                  "evkat.empty.body",
                  "Saatlerden birine tıkla, ilk bloğunu ekle. Her şey buradan başlar.",
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditTimeBlockModal
          initial={editing.block}
          seedStart={editing.seedStart}
          selectedDate={selectedDate}
          onClose={() => setEditing(null)}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}

function BlockCard({
  geom,
  onClick,
}: {
  geom: BlockGeometry;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const toggle = useToggleTimeBlockComplete();
  const color = resolveColorToken(geom.block);
  const completed = Boolean(geom.block.completedAt);
  const start = new Date(geom.block.startAt);
  const end = new Date(geom.block.endAt);
  const hhmm = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="absolute left-1 right-2 pointer-events-auto"
      style={{ top: `${geom.topPx + 2}px`, height: `${geom.heightPx - 4}px` }}
    >
      <button
        type="button"
        onClick={onClick}
        className={`group relative h-full w-full overflow-hidden rounded-xl bg-white text-left shadow-card-warm ring-1 ${COLOR_RING_CLASS[color]} transition hover:-translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber motion-reduce:hover:translate-y-0 dark:bg-husrev-shadow ${
          completed ? "opacity-60" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-[3px] ${COLOR_STRIPE_CLASS[color]}`}
        />
        <div className="flex h-full items-start gap-2 pl-3 pr-2 py-2">
          <div className="min-w-0 flex-1">
            <div
              className={`text-sm font-medium text-husrev-ink dark:text-husrev-cream line-clamp-1 ${
                completed ? "line-through" : ""
              }`}
            >
              {geom.block.title}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
              <span>{hhmm(start)}</span>
              <span aria-hidden="true">–</span>
              <span>{hhmm(end)}</span>
              {geom.block.category && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    {t(`evkat.category.${geom.block.category}`, geom.block.category)}
                  </span>
                </>
              )}
            </div>
            {geom.heightPx > 90 && geom.block.notes && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 whitespace-pre-line">
                {geom.block.notes}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle.mutate(geom.block.id);
            }}
            aria-label={t("evkat.completed", "Tamamlandı")}
            className={`inline-flex h-6 w-6 flex-none items-center justify-center rounded-full transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
              completed
                ? "bg-husrev-moss text-husrev-cream"
                : "bg-husrev-sand/60 text-gray-500 hover:bg-husrev-moss/30"
            }`}
          >
            <HiOutlineCheck className="h-3.5 w-3.5" />
          </button>
        </div>
      </button>
    </div>
  );
}

function EditTimeBlockModal({
  initial,
  seedStart,
  selectedDate,
  onClose,
  showAlert,
}: {
  initial: TimeBlockResponse | null;
  seedStart?: Date;
  selectedDate: Date;
  onClose: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateTimeBlock();
  const update = useUpdateTimeBlock();
  const remove = useDeleteTimeBlock();

  const initStart = initial
    ? new Date(initial.startAt)
    : seedStart ?? (() => {
        const d = new Date(selectedDate);
        d.setHours(new Date().getHours() || 9, 0, 0, 0);
        return d;
      })();
  const initEnd = initial
    ? new Date(initial.endAt)
    : (() => {
        const d = new Date(initStart);
        d.setHours(d.getHours() + 1);
        return d;
      })();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [startAt, setStartAt] = useState(initStart.toISOString());
  const [endAt, setEndAt] = useState(initEnd.toISOString());
  const [category, setCategory] = useState<TimeBlockCategory | "">(
    initial?.category ?? "",
  );
  const [colorToken, setColorToken] = useState<TimeBlockColorToken | "">(
    initial?.colorToken ?? "",
  );
  const [notifyMinutesBefore, setNotifyMinutesBefore] = useState<string>(
    initial?.notifyMinutesBefore === null || initial?.notifyMinutesBefore === undefined
      ? ""
      : String(initial.notifyMinutesBefore),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const body: TimeBlockRequest = {
      title: title.trim(),
      notes: notes.trim() || null,
      startAt: startAt,
      endAt: endAt,
      category: (category || null) as TimeBlockCategory | null,
      colorToken: (colorToken || null) as TimeBlockColorToken | null,
      notifyMinutesBefore:
        notifyMinutesBefore === "" ? null : Number(notifyMinutesBefore),
    };
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, body });
      } else {
        await create.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      const { title: errTitle, message } = parseAxiosError(err);
      showAlert({ title: errTitle, message, type: "error", position: "top-center" });
    }
  };

  const openDelete = () => {
    if (!initial) return;
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    if (!initial) return;
    try {
      await remove.mutateAsync(initial.id);
      setConfirmingDelete(false);
      onClose();
    } catch (err) {
      const { title: errTitle, message } = parseAxiosError(err);
      showAlert({ title: errTitle, message, type: "error", position: "top-center" });
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
              {t("evkat.modal.kicker", initial ? "Düzenle" : "Yeni blok")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {initial
                ? t("evkat.modal.editTitle", "Bloğu düzenle")
                : t("evkat.modal.createTitle", "Yeni zaman bloğu")}
            </h3>
          </div>
          {initial && (
            <button
              type="button"
              onClick={openDelete}
              disabled={isPending}
              aria-label={t("common.delete", "Sil")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <Field label={t("evkat.field.title", "Başlık")}>
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="husrev-input"
              placeholder={t("evkat.placeholders.title", "Odak çalışması")}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("evkat.field.start", "Başlangıç")}>
              <DateTimePicker
                value={startAt}
                onChange={(iso) => iso && setStartAt(iso)}
                clearable={false}
              />
            </Field>
            <Field label={t("evkat.field.end", "Bitiş")}>
              <DateTimePicker
                value={endAt}
                onChange={(iso) => iso && setEndAt(iso)}
                clearable={false}
              />
            </Field>
          </div>

          <Field label={t("evkat.field.category", "Kategori")}>
            <div className="flex flex-wrap gap-1.5">
              <CategoryChip
                active={category === ""}
                onClick={() => setCategory("")}
                label={t("evkat.category.none", "Yok")}
              />
              {TIME_BLOCK_CATEGORIES.map((c) => (
                <CategoryChip
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                  label={t(`evkat.category.${c}`, c)}
                />
              ))}
            </div>
          </Field>

          <Field label={t("evkat.field.color", "Renk")}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setColorToken("")}
                aria-label="Otomatik"
                className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-husrev-cream dark:ring-offset-husrev-ink transition focus-visible:outline-hidden focus-visible:ring-2 ${
                  colorToken === "" ? "ring-husrev-ember" : "ring-transparent"
                } bg-gradient-to-br from-husrev-sand to-husrev-amber/40`}
              />
              {TIME_BLOCK_COLOR_TOKENS.map((tok) => (
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

          <Field label={t("evkat.field.notifyBefore", "Hatırlatma")}>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["", t("evkat.notify.off", "Kapalı")],
                ["0", t("evkat.notify.atStart", "Tam saatinde")],
                ["5", "5 dk"],
                ["15", "15 dk"],
                ["30", "30 dk"],
                ["60", "1 saat"],
              ] as const).map(([val, label]) => (
                <CategoryChip
                  key={String(val)}
                  active={notifyMinutesBefore === val}
                  onClick={() => setNotifyMinutesBefore(val)}
                  label={label}
                />
              ))}
            </div>
          </Field>

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
        title={t("evkat.confirmDeleteTitle", "Bloğu sil")}
        message={t(
          "evkat.confirmDelete",
          "Bu zaman bloğunu silmek istediğine emin misin?",
        )}
      />
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="husrev-kicker text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
        active
          ? "bg-husrev-ember text-husrev-cream"
          : "bg-husrev-sand/50 text-gray-700 hover:bg-husrev-amber/15 dark:bg-white/[0.06] dark:text-gray-300"
      }`}
    >
      {label}
    </button>
  );
}
