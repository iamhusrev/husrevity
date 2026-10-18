"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiPlus } from "react-icons/bi";
import { useSportLogs, useSportPrograms, useSportWeek } from "@/hooks/useSport";
import type { SportProgramResponse } from "@/types/sport/sport";
import { cn } from "@/utils/utils";
import SportErrorRow from "./SportErrorRow";
import SportGlance from "./SportGlance";
import SportLogModal, { type SessionOption } from "./SportLogModal";
import TodayCard from "./TodayCard";
import WeekStrip, { WEEK_PANEL_ID } from "./WeekStrip";
import { buildWeek, localISO, parseLocalISO, programPhase, programWindow } from "./sport-schedule";

const QUIET_LINK =
  "inline-flex min-h-10 items-center rounded-xl px-2 text-sm font-medium text-gray-500 transition hover:bg-husrev-cream/70 hover:text-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-husrev-amber";

const SKELETON_BLOCK =
  "bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50 dark:bg-white/[0.06]";

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("common.loading", "Yükleniyor…")} className="space-y-4">
      <div className={cn("h-6 w-2/3 rounded-xl", SKELETON_BLOCK)} />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("h-16 rounded-2xl", SKELETON_BLOCK)} />
        ))}
      </div>
      <div className={cn("h-16 rounded-2xl", SKELETON_BLOCK)} />
      <div className={cn("h-40 rounded-2xl", SKELETON_BLOCK)} />
    </div>
  );
}

/** Quiet "Program name · 12 Eki – 8 Kas" line. */
function ProgramRow({ program }: { program: SportProgramResponse }) {
  const { t, i18n } = useTranslation();
  const fmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || "tr", { day: "numeric", month: "short" }),
    [i18n.language],
  );
  const { start, end } = programWindow(program);
  const range = end
    ? t("sport.home.programRange", "{{from}} – {{to}}", {
        from: fmt.format(parseLocalISO(start)),
        to: fmt.format(parseLocalISO(end)),
      })
    : fmt.format(parseLocalISO(start));
  return (
    <p className="min-w-0 text-sm text-gray-600 dark:text-gray-300">
      <span className="font-medium text-husrev-ink dark:text-husrev-cream">{program.name}</span>
      <span className="text-gray-400 dark:text-gray-500"> · </span>
      <span className="tabular-nums">{range}</span>
    </p>
  );
}

/**
 * The sport "Today" home: active program row, three numbers, week strip and
 * the card of the selected day (today by default), plus a quiet row to log a
 * free workout. Query errors render an inline Retry row, never an empty state.
 */
/**
 * The current local date, refreshed when the tab is shown or focused again so
 * a page left open past midnight does not keep logging against yesterday.
 */
function useToday(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => {
      const next = new Date();
      setNow((current) => (localISO(current) === localISO(next) ? current : next));
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return now;
}

export default function SportHome() {
  const { t } = useTranslation();
  const now = useToday();
  const today = localISO(now);
  // null = follow today (also after a date change); a string = a day picked in the strip.
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? today;
  const [logModalOpen, setLogModalOpen] = useState(false);

  const programs = useSportPrograms();
  const program = useMemo(
    () => (programs.data ?? []).find((p) => p.isActive) ?? null,
    [programs.data],
  );
  const weekLogs = useSportWeek(now);
  // Logs from the program start to today feed the streak / adherence numbers
  // and the "program ended" summary; disabled (empty range) without a program.
  const rangeFrom = program && program.startDate <= today ? program.startDate : "";
  const rangeLogs = useSportLogs(rangeFrom, rangeFrom ? today : "");

  const week = useMemo(
    () => buildWeek(program, weekLogs.data ?? [], today),
    [program, weekLogs.data, today],
  );
  const selectedDay = week.find((d) => d.date === selected) ?? week[0];

  const sessionOptions: SessionOption[] = useMemo(
    () =>
      (programs.data ?? []).flatMap((p) =>
        p.sessions.map((s) => ({
          id: s.id,
          label: `${p.name} — ${s.name}`,
          plannedDuration: s.plannedDuration,
        })),
      ),
    [programs.data],
  );

  const loading = programs.isLoading || (program !== null && weekLogs.isLoading);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {program ? (
          <ProgramRow program={program} />
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t("sport.kicker", "Antrenman takibi")}
          </span>
        )}
        <div className="-mx-2 flex items-center">
          <Link href="/sport/programs" className={QUIET_LINK}>
            {t("sport.home.openPrograms", "Programlar")}
          </Link>
          <Link href="/sport/history" className={QUIET_LINK}>
            {t("sport.home.history", "Geçmiş")}
          </Link>
        </div>
      </div>

      {programs.isError ? (
        <SportErrorRow
          message={t("sport.home.programsError", "Programlar yüklenemedi.")}
          onRetry={() => programs.refetch()}
        />
      ) : loading ? (
        <Skeleton />
      ) : weekLogs.isError ? (
        // Without the week's logs every past day would read "missed", so the
        // strip, the numbers and the card all wait for the retry.
        <SportErrorRow
          message={t("sport.logs.error", "Antrenmanlar yüklenemedi.")}
          onRetry={() => weekLogs.refetch()}
        />
      ) : (
        <>
          {program &&
            programPhase(program, today) !== "upcoming" &&
            (rangeLogs.isError ? (
              <SportErrorRow
                message={t("sport.logs.error", "Antrenmanlar yüklenemedi.")}
                onRetry={() => rangeLogs.refetch()}
              />
            ) : (
              <SportGlance
                program={program}
                week={week}
                rangeLogs={rangeLogs.data ?? []}
                today={today}
              />
            ))}

          {program && <WeekStrip week={week} selected={selectedDay.date} onSelect={setPicked} />}

          <div
            id={WEEK_PANEL_ID}
            role={program ? "tabpanel" : undefined}
            aria-labelledby={program ? `sport-week-tab-${selectedDay.date}` : undefined}
          >
            <TodayCard
              program={program}
              day={selectedDay}
              today={today}
              rangeLogs={rangeLogs.isError ? undefined : (rangeLogs.data ?? [])}
            />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setLogModalOpen(true)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-gray-500 transition hover:bg-husrev-cream/70 hover:text-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-husrev-amber"
      >
        <BiPlus className="h-4 w-4" aria-hidden />
        {t("sport.home.addFree", "Serbest antrenman ekle")}
      </button>

      {logModalOpen && (
        <SportLogModal
          initial={null}
          sessionOptions={sessionOptions}
          defaultDate={selectedDay.date}
          onClose={() => setLogModalOpen(false)}
        />
      )}
    </div>
  );
}
