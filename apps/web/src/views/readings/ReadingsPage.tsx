"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  READING_COLOR_TOKENS,
  ReadingColorToken,
  ReadingLogResponse,
  ReadingTrackRequest,
  ReadingTrackResponse,
} from "@/types/reading/reading";
import {
  useCreateReadingTrack,
  useDeleteReadingTrack,
  useReadingLogs,
  useReadingTracks,
  useUpdateReadingTrack,
  useUpsertReadingLog,
} from "@/hooks/useReading";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import {
  BiChevronLeft,
  BiChevronRight,
  BiHeadphone,
  BiPencil,
  BiPlus,
  BiTrash,
} from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

const COLOR_STRIPE_CLASS: Record<ReadingColorToken, string> = {
  "husrev-amber": "bg-husrev-amber",
  "husrev-ember": "bg-husrev-ember",
  "husrev-moss": "bg-husrev-moss",
  "husrev-ink": "bg-husrev-ink",
  "husrev-sand": "bg-husrev-sand",
};

const COLOR_TEXT_CLASS: Record<ReadingColorToken, string> = {
  "husrev-amber": "text-husrev-amber",
  "husrev-ember": "text-husrev-ember",
  "husrev-moss": "text-husrev-moss",
  "husrev-ink": "text-husrev-ink dark:text-husrev-cream",
  "husrev-sand": "text-husrev-sand",
};

/** The owner's real daily readings, seeded on demand. */
const DEFAULT_TRACKS: ReadingTrackRequest[] = [
  { name: "Kur'an", colorToken: "husrev-amber", tracksListened: false, dailyTarget: "10 sayfa" },
  { name: "Cevşen", colorToken: "husrev-moss", tracksListened: true, dailyTarget: "1 kez" },
  { name: "Risale-i Nur", colorToken: "husrev-ember", tracksListened: false, dailyTarget: "1 ders" },
];

function resolveColor(t: ReadingTrackResponse): ReadingColorToken {
  return t.colorToken ?? "husrev-amber";
}

/** Local-time YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** Monday-anchored start of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (base.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(base, -dow);
}

export default function ReadingsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "tr";
  const showAlert = alertStore((s) => s.show);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [editingTrack, setEditingTrack] = useState<{
    track: ReadingTrackResponse | null;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    track: ReadingTrackResponse;
    date: string;
  } | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const from = toISO(days[0]);
  const to = toISO(days[6]);
  const todayISO = toISO(new Date());

  const { data: tracksData, isLoading, isError, refetch } = useReadingTracks();
  const { data: logsData } = useReadingLogs(from, to);
  const createTrack = useCreateReadingTrack();
  const [seeding, setSeeding] = useState(false);

  const tracks = useMemo(() => tracksData ?? [], [tracksData]);

  const logIndex = useMemo(() => {
    const map = new Map<string, ReadingLogResponse>();
    for (const l of logsData ?? []) map.set(`${l.trackId}|${l.logDate}`, l);
    return map;
  }, [logsData]);

  const weekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(lang, { weekday: "short" }),
    [lang],
  );
  const dayNumFmt = useMemo(
    () => new Intl.DateTimeFormat(lang, { day: "numeric" }),
    [lang],
  );
  const rangeFmt = useMemo(
    () => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }),
    [lang],
  );

  const weekLabel = `${rangeFmt.format(days[0])} – ${rangeFmt.format(days[6])}`;

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      for (const body of DEFAULT_TRACKS) await createTrack.mutateAsync(body);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("readings.title", "Okumalar")}
        kicker={t("readings.kicker", "Günlük okuma")}
        flourish={t("readings.flourish", "takip")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-600 dark:text-gray-300">
          {t(
            "readings.intro",
            "Her günkü okumalarını işaretle — sayfa aralığı, okundu ve dinlenildi.",
          )}
        </p>
        <button
          type="button"
          onClick={() => setEditingTrack({ track: null })}
          className="husrev-btn"
        >
          <BiPlus className="h-4 w-4" />
          {t("readings.newTrack", "Yeni okuma")}
        </button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label={t("readings.prevWeek", "Önceki hafta")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-cream hover:text-husrev-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:hover:bg-white/[0.06] dark:hover:text-husrev-cream"
        >
          <BiChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium tabular-nums text-husrev-ink dark:text-husrev-cream">
            {weekLabel}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-full px-2.5 py-1 text-xs text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-husrev-amber"
          >
            {t("readings.today", "Bugün")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label={t("readings.nextWeek", "Sonraki hafta")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-cream hover:text-husrev-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:hover:bg-white/[0.06] dark:hover:text-husrev-cream"
        >
          <BiChevronRight className="h-5 w-5" />
        </button>
      </div>

      {isError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl ring-1 ring-husrev-sand bg-white px-4 py-3 text-sm text-error-500 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <span>{t("readings.error", "Okumalar yüklenemedi.")}</span>
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
              className="h-16 rounded-2xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
            />
          ))}
        </div>
      )}

      {!isLoading && !isError && tracks.length === 0 && (
        <div className="rounded-2xl ring-1 ring-husrev-sand bg-white px-6 py-12 text-center shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <div className="husrev-kicker text-husrev-amber">
            {t("readings.empty.kicker", "Henüz okuma yok")}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
            {t(
              "readings.empty.body",
              "Takip etmek istediğin okumaları ekle ya da hazır listeyle başla.",
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={seedDefaults}
              disabled={seeding}
              className="husrev-btn"
            >
              {seeding
                ? t("readings.seeding", "Yükleniyor…")
                : t("readings.loadDefault", "Varsayılan okumaları yükle")}
            </button>
            <button
              type="button"
              onClick={() => setEditingTrack({ track: null })}
              className="husrev-btn-ghost"
            >
              {t("readings.newTrack", "Yeni okuma")}
            </button>
          </div>
        </div>
      )}

      {!isLoading && !isError && tracks.length > 0 && (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-husrev-sand bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left dark:bg-husrev-shadow">
                  <span className="husrev-kicker text-gray-500 dark:text-gray-400">
                    {t("readings.trackCol", "Okuma")}
                  </span>
                </th>
                {days.map((d) => {
                  const iso = toISO(d);
                  const isToday = iso === todayISO;
                  return (
                    <th
                      key={iso}
                      className={`px-1 py-3 text-center ${
                        isToday ? "bg-husrev-amber/10" : ""
                      }`}
                    >
                      <div className="flex flex-col items-center leading-tight">
                        <span className="text-[11px] uppercase tracking-wide text-gray-400">
                          {weekdayFmt.format(d)}
                        </span>
                        <span
                          className={`text-sm tabular-nums ${
                            isToday
                              ? "font-semibold text-husrev-ember dark:text-husrev-amber"
                              : "text-husrev-ink dark:text-husrev-cream"
                          }`}
                        >
                          {dayNumFmt.format(d)}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => {
                const color = resolveColor(track);
                return (
                  <tr
                    key={track.id}
                    className="border-t border-husrev-sand/60 dark:border-white/[0.06]"
                  >
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 dark:bg-husrev-shadow">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`h-2.5 w-2.5 flex-none rounded-full ${COLOR_STRIPE_CLASS[color]}`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                              {track.name}
                            </span>
                            {track.tracksListened && (
                              <BiHeadphone
                                className="h-3.5 w-3.5 flex-none text-gray-400"
                                aria-label={t("readings.listenable", "Dinlenebilir")}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingTrack({ track })}
                              aria-label={t("common.edit", "Düzenle")}
                              className="flex-none rounded p-0.5 text-gray-300 opacity-0 transition hover:text-husrev-ember focus-visible:opacity-100 focus-visible:outline-hidden group-hover:opacity-100 hover:opacity-100"
                            >
                              <BiPencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {track.dailyTarget && (
                            <span className="text-[11px] text-gray-400">
                              {track.dailyTarget}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {days.map((d) => {
                      const iso = toISO(d);
                      const isToday = iso === todayISO;
                      const log = logIndex.get(`${track.id}|${iso}`);
                      return (
                        <td
                          key={iso}
                          className={`px-1 py-2 text-center align-middle ${
                            isToday ? "bg-husrev-amber/[0.06]" : ""
                          }`}
                        >
                          <Cell
                            color={color}
                            log={log}
                            listenable={track.tracksListened}
                            onClick={() => setEditingCell({ track, date: iso })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingTrack && (
        <EditTrackModal
          initial={editingTrack.track}
          onClose={() => setEditingTrack(null)}
          showAlert={showAlert}
        />
      )}

      {editingCell && (
        <CellEditorModal
          track={editingCell.track}
          date={editingCell.date}
          log={logIndex.get(`${editingCell.track.id}|${editingCell.date}`)}
          dateLabel={new Intl.DateTimeFormat(lang, {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date(`${editingCell.date}T00:00:00`))}
          onClose={() => setEditingCell(null)}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}

function Cell({
  color,
  log,
  listenable,
  onClick,
}: {
  color: ReadingColorToken;
  log: ReadingLogResponse | undefined;
  listenable: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const read = log?.read ?? false;
  const listened = log?.listened ?? false;
  const active = read || listened || Boolean(log?.pageRange);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("readings.editCell", "Günü düzenle")}
      className="mx-auto flex min-h-[2.75rem] w-full max-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 transition hover:bg-husrev-cream/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:hover:bg-white/[0.05]"
    >
      <span className="flex items-center gap-0.5">
        {read ? (
          <BsCheckCircleFill className={`h-4 w-4 ${COLOR_TEXT_CLASS[color]}`} />
        ) : (
          <BsCircle
            className={`h-4 w-4 ${active ? "text-gray-400" : "text-gray-300 dark:text-gray-600"}`}
          />
        )}
        {listenable && listened && (
          <BiHeadphone className={`h-3.5 w-3.5 ${COLOR_TEXT_CLASS[color]}`} />
        )}
      </span>
      {log?.pageRange && (
        <span className="max-w-full truncate text-[10px] leading-none text-gray-500 dark:text-gray-400">
          {log.pageRange}
        </span>
      )}
    </button>
  );
}

function CellEditorModal({
  track,
  date,
  log,
  dateLabel,
  onClose,
  showAlert,
}: {
  track: ReadingTrackResponse;
  date: string;
  log: ReadingLogResponse | undefined;
  dateLabel: string;
  onClose: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const upsert = useUpsertReadingLog();
  const [read, setRead] = useState(log?.read ?? false);
  const [listened, setListened] = useState(log?.listened ?? false);
  const [pageRange, setPageRange] = useState(log?.pageRange ?? "");

  const save = async (override?: {
    read?: boolean;
    listened?: boolean;
    pageRange?: string;
  }) => {
    try {
      await upsert.mutateAsync({
        trackId: track.id,
        date,
        body: {
          read: override?.read ?? read,
          listened: override?.listened ?? listened,
          pageRange: (override?.pageRange ?? pageRange).trim() || null,
        },
      });
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
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="w-full max-w-sm rounded-3xl husrev-modal grain p-6 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {track.name}
          </span>
          <h3 className="text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {dateLabel}
          </h3>
        </div>

        <div className="mt-5 space-y-3">
          <ToggleRow
            label={t("readings.read", "Okundu")}
            active={read}
            onClick={() => setRead((v) => !v)}
          />
          {track.tracksListened && (
            <ToggleRow
              label={t("readings.listened", "Dinlenildi")}
              active={listened}
              onClick={() => setListened((v) => !v)}
            />
          )}
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("readings.pageRange", "Sayfa aralığı")}
            </span>
            <input
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
              maxLength={120}
              placeholder={t("readings.pagePlaceholder", "örn. 1-10")}
              className="husrev-input"
              autoFocus
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => save({ read: false, listened: false, pageRange: "" })}
            disabled={upsert.isPending}
            className="rounded-full px-3 py-2 text-sm text-gray-500 transition hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
          >
            {t("readings.clear", "Temizle")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={upsert.isPending}
              className="husrev-btn-ghost"
            >
              {t("common.cancel", "İptal")}
            </button>
            <button type="submit" disabled={upsert.isPending} className="husrev-btn">
              {upsert.isPending
                ? t("common.saving", "Kaydediliyor…")
                : t("common.save", "Kaydet")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ToggleRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
        active
          ? "bg-husrev-moss/10 text-husrev-ink dark:bg-husrev-moss/15 dark:text-husrev-cream"
          : "bg-husrev-sand/30 text-gray-600 dark:bg-white/[0.04] dark:text-gray-300"
      }`}
    >
      <span className="font-medium">{label}</span>
      {active ? (
        <BsCheckCircleFill className="h-5 w-5 text-husrev-moss" />
      ) : (
        <BsCircle className="h-5 w-5 text-gray-300 dark:text-gray-600" />
      )}
    </button>
  );
}

function EditTrackModal({
  initial,
  onClose,
  showAlert,
}: {
  initial: ReadingTrackResponse | null;
  onClose: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateReadingTrack();
  const update = useUpdateReadingTrack();
  const remove = useDeleteReadingTrack();

  const [name, setName] = useState(initial?.name ?? "");
  const [colorToken, setColorToken] = useState<ReadingColorToken | "">(
    initial?.colorToken ?? "",
  );
  const [tracksListened, setTracksListened] = useState(
    initial?.tracksListened ?? false,
  );
  const [dailyTarget, setDailyTarget] = useState(initial?.dailyTarget ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const body: ReadingTrackRequest = {
      name: name.trim(),
      colorToken: (colorToken || null) as ReadingColorToken | null,
      tracksListened,
      dailyTarget: dailyTarget.trim() || null,
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, body });
      else await create.mutateAsync(body);
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
                ? t("readings.modal.editKicker", "Düzenle")
                : t("readings.modal.newKicker", "Yeni okuma")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {initial
                ? t("readings.modal.editTitle", "Okumayı düzenle")
                : t("readings.modal.createTitle", "Yeni okuma")}
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
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("readings.field.name", "Okuma adı")}
            </span>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="husrev-input"
              placeholder={t("readings.placeholders.name", "Kur'an")}
              autoFocus
            />
          </label>

          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("readings.field.dailyTarget", "Günlük hedef")}
            </span>
            <input
              maxLength={120}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
              className="husrev-input"
              placeholder={t("readings.placeholders.dailyTarget", "10 sayfa")}
            />
          </label>

          <div className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("readings.field.color", "Renk")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setColorToken("")}
                aria-label={t("readings.colorAuto", "Otomatik")}
                className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-husrev-cream dark:ring-offset-husrev-ink transition focus-visible:outline-hidden focus-visible:ring-2 ${
                  colorToken === "" ? "ring-husrev-ember" : "ring-transparent"
                } bg-gradient-to-br from-husrev-sand to-husrev-amber/40`}
              />
              {READING_COLOR_TOKENS.map((tok) => (
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
          </div>

          <ToggleRow
            label={t("readings.field.tracksListened", "Dinlenildi takibi")}
            active={tracksListened}
            onClick={() => setTracksListened((v) => !v)}
          />
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
        title={t("readings.confirmDeleteTitle", "Okumayı sil")}
        message={t(
          "readings.confirmDelete",
          "Bu okumayı ve tüm günlük kayıtlarını silmek istediğine emin misin?",
        )}
      />
    </div>
  );
}
