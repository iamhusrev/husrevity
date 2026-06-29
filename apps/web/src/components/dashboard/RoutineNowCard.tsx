"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  RoutineColorToken,
  RoutineSegmentResponse,
} from "@/types/routine/routine";
import { useRoutineSegments } from "@/hooks/useRoutine";

const COLOR_STRIPE_CLASS: Record<RoutineColorToken, string> = {
  "husrev-amber": "bg-husrev-amber",
  "husrev-ember": "bg-husrev-ember",
  "husrev-moss": "bg-husrev-moss",
  "husrev-ink": "bg-husrev-ink",
  "husrev-sand": "bg-husrev-sand",
};

function minutesToTime(m: number | null): string {
  if (m === null || m === undefined) return "";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function rangeLabel(start: number | null, end: number | null): string {
  if (start === null && end === null) return "—";
  if (start === null) return `→ ${minutesToTime(end)}`;
  if (end === null) return `${minutesToTime(start)} →`;
  return `${minutesToTime(start)} – ${minutesToTime(end)}`;
}

function resolveColor(s: RoutineSegmentResponse): RoutineColorToken {
  return s.colorToken ?? "husrev-amber";
}

function containsNow(s: RoutineSegmentResponse, nowMin: number): boolean {
  const startOk = s.startMinute === null || s.startMinute <= nowMin;
  const endOk = s.endMinute === null || nowMin < s.endMinute;
  return startOk && endOk;
}

export default function RoutineNowCard() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useRoutineSegments();
  const segments = useMemo(() => data ?? [], [data]);

  const { active, next } = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const active = segments.find((s) => containsNow(s, nowMin)) ?? null;
    const next =
      segments
        .filter((s) => s.startMinute !== null && s.startMinute > nowMin)
        .sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0))[0] ?? null;
    return { active, next };
  }, [segments]);

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          {t("dashboard.routineNow.title")}
        </h3>
        <Link href="/evkat" className="text-xs text-brand-500 hover:underline">
          {t("dashboard.routineNow.link")} →
        </Link>
      </div>

      {isLoading && (
        <div className="h-24 rounded-xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50" />
      )}

      {isError && !isLoading && (
        <div className="flex items-center justify-between gap-3 py-2 text-sm text-error-500">
          <span>{t("dashboard.routineNow.error")}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded px-2 py-1 text-xs text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!isLoading && !isError && segments.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">{t("dashboard.routineNow.empty")}</p>
          <Link
            href="/evkat"
            className="mt-2 inline-block text-xs text-husrev-ember hover:underline dark:text-husrev-amber"
          >
            {t("dashboard.routineNow.link")} →
          </Link>
        </div>
      )}

      {!isLoading && !isError && segments.length > 0 && (
        <div className="space-y-3">
          {active ? (
            <ActiveSegment segment={active} t={t} />
          ) : (
            <p className="rounded-xl bg-husrev-sand/30 px-3 py-2.5 text-sm text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
              {t("dashboard.routineNow.idle")}
            </p>
          )}

          {next && (
            <div className="flex items-center gap-2 border-t border-husrev-sand/60 pt-2.5 text-sm dark:border-white/[0.06]">
              <span className="husrev-kicker text-gray-400">
                {t("dashboard.routineNow.nextUp")}
              </span>
              <span className="font-medium text-husrev-ink dark:text-husrev-cream">
                {next.name}
              </span>
              <span className="ml-auto text-xs tabular-nums text-husrev-ember dark:text-husrev-amber">
                {rangeLabel(next.startMinute, next.endMinute)}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ActiveSegment({
  segment,
  t,
}: {
  segment: RoutineSegmentResponse;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const color = resolveColor(segment);
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-husrev-cream/40 px-4 py-3 ring-1 ring-husrev-sand/70 dark:bg-white/[0.03] dark:ring-white/[0.06]`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${COLOR_STRIPE_CLASS[color]}`}
      />
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
      <h4 className="mt-1 text-lg font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
        {segment.name}
      </h4>
      {segment.activities.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {segment.activities.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-sm text-husrev-ink dark:text-husrev-cream"
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 flex-none rounded-full ${COLOR_STRIPE_CLASS[color]}`}
              />
              <span className="min-w-0 truncate">{a.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-gray-400">
          {t("dashboard.routineNow.noActivities")}
        </p>
      )}
    </div>
  );
}
