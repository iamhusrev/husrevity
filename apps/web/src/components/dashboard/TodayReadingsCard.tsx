"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ReadingColorToken,
  ReadingLogResponse,
  ReadingTrackResponse,
} from "@/types/reading/reading";
import {
  useReadingLogs,
  useReadingTracks,
  useUpsertReadingLog,
} from "@/hooks/useReading";
import { BiHeadphone } from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";

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

/** Local-time YYYY-MM-DD (avoids the UTC off-by-one from toISOString). */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveColor(t: ReadingTrackResponse): ReadingColorToken {
  return t.colorToken ?? "husrev-amber";
}

export default function TodayReadingsCard() {
  const { t } = useTranslation();
  const todayISO = useMemo(() => toISO(new Date()), []);
  const {
    data: tracksData,
    isLoading,
    isError,
    refetch,
  } = useReadingTracks();
  const { data: logsData } = useReadingLogs(todayISO, todayISO);
  const upsert = useUpsertReadingLog();

  const tracks = useMemo(() => tracksData ?? [], [tracksData]);
  const logByTrack = useMemo(() => {
    const map = new Map<string, ReadingLogResponse>();
    for (const l of logsData ?? []) map.set(l.trackId, l);
    return map;
  }, [logsData]);

  const toggleRead = (track: ReadingTrackResponse) => {
    const log = logByTrack.get(track.id);
    upsert.mutate({
      trackId: track.id,
      date: todayISO,
      body: {
        read: !(log?.read ?? false),
        listened: log?.listened ?? false,
        pageRange: log?.pageRange ?? null,
      },
    });
  };

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          {t("dashboard.todayReadings.title")}
        </h3>
        <Link href="/readings" className="text-xs text-brand-500 hover:underline">
          {t("dashboard.todayReadings.link")} →
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded-xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
            />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex items-center justify-between gap-3 py-2 text-sm text-error-500">
          <span>{t("dashboard.todayReadings.error")}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded px-2 py-1 text-xs text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!isLoading && !isError && tracks.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">{t("dashboard.todayReadings.empty")}</p>
          <Link
            href="/readings"
            className="mt-2 inline-block text-xs text-husrev-ember hover:underline dark:text-husrev-amber"
          >
            {t("dashboard.todayReadings.link")} →
          </Link>
        </div>
      )}

      {!isLoading && !isError && tracks.length > 0 && (
        <ul className="space-y-1">
          {tracks.map((track) => {
            const color = resolveColor(track);
            const log = logByTrack.get(track.id);
            const read = log?.read ?? false;
            const listened = log?.listened ?? false;
            return (
              <li
                key={track.id}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 flex-none rounded-full ${COLOR_STRIPE_CLASS[color]}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                      {track.name}
                    </span>
                    {track.tracksListened && listened && (
                      <BiHeadphone
                        className={`h-3.5 w-3.5 flex-none ${COLOR_TEXT_CLASS[color]}`}
                        aria-label={t("dashboard.todayReadings.listened")}
                      />
                    )}
                  </div>
                  {(log?.pageRange || track.dailyTarget) && (
                    <span className="text-[11px] text-gray-400">
                      {log?.pageRange || track.dailyTarget}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleRead(track)}
                  disabled={upsert.isPending}
                  aria-label={t("dashboard.todayReadings.markRead")}
                  aria-pressed={read}
                  className="flex-none rounded-full p-1 transition hover:bg-husrev-cream/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber disabled:opacity-50 dark:hover:bg-white/[0.05]"
                >
                  {read ? (
                    <BsCheckCircleFill className={`h-5 w-5 ${COLOR_TEXT_CLASS[color]}`} />
                  ) : (
                    <BsCircle className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
