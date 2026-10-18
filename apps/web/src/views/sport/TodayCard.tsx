"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiChevronDown, BiChevronRight, BiMoon } from "react-icons/bi";
import { BsCheckCircleFill, BsDashCircle } from "react-icons/bs";
import { useDeleteSportLog, useQuickLogSession } from "@/hooks/useSport";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { cn } from "@/utils/utils";
import type {
  SportLogResponse,
  SportProgramResponse,
  SportSessionResponse,
} from "@/types/sport/sport";
import QuickLogSheet from "./QuickLogSheet";
import SessionSections from "./SessionSections";
import { sessionSummary } from "./session-description";
import {
  adherence,
  nextPlanned,
  parseLocalISO,
  programPhase,
  programWeek,
  programWindow,
  quickLogBody,
  weekdayIndex,
  type WeekDay,
} from "./sport-schedule";

export interface TodayCardProps {
  program: SportProgramResponse | null;
  /** The day to show (today by default, or the day picked in the week strip). */
  day: WeekDay;
  /** Local today as `YYYY-MM-DD`. */
  today: string;
  /**
   * Logs from the program start to today; only needed for the "program ended"
   * summary. `undefined` means they could not be loaded, so no counts are shown.
   */
  rangeLogs?: SportLogResponse[];
}

const CARD =
  "rounded-2xl ring-1 ring-husrev-sand bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]";
const KICKER = "husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80";
const CHIP =
  "inline-flex min-h-7 items-center rounded-full bg-husrev-sand/60 px-2.5 text-xs font-medium text-husrev-shadow dark:bg-white/5 dark:text-husrev-cream";
const GHOST = "husrev-btn-ghost min-h-10 px-3 text-sm";
const PRIMARY = "husrev-btn min-h-10";
const QUIET =
  "inline-flex min-h-10 items-center rounded-xl px-2.5 text-sm font-medium text-gray-500 transition hover:bg-husrev-cream/70 hover:text-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-husrev-amber";
const STATUS = "text-sm font-medium text-gray-500 dark:text-gray-400";
const LINK_PRIMARY = `${PRIMARY} no-underline`;

/** Optimistic rows carry a temporary id until the server row replaces them. */
const isOptimistic = (log: SportLogResponse) => log.id.startsWith("optimistic-");

function useDateFormat(language: string) {
  return useMemo(
    () => new Intl.DateTimeFormat(language || "tr", { day: "numeric", month: "short" }),
    [language],
  );
}

export default function TodayCard({ program, day, today, rangeLogs }: TodayCardProps) {
  const { t } = useTranslation();

  if (!program) return <NoProgramCard />;

  const phase = programPhase(program, day.date);
  if (phase === "upcoming") return <UpcomingCard program={program} />;
  if (phase === "ended") return <EndedCard program={program} rangeLogs={rangeLogs} today={today} />;

  const dayName = t(`sport.day.${day.weekday}`);
  const week = programWeek(program, day.date);
  const kicker = week
    ? t("sport.today.kicker", "Hafta {{week}} / {{total}} · {{day}}", {
        week: week.week,
        total: week.total,
        day: dayName,
      })
    : dayName;
  const freeLogs = day.logs.filter((l) => l.sessionId === null);

  if (!day.sessions.length) {
    return <RestCard program={program} day={day} kicker={kicker} freeLogs={freeLogs} />;
  }

  return (
    <section className={CARD} aria-label={kicker}>
      <p className={KICKER}>{kicker}</p>
      <div className="mt-3 divide-y divide-husrev-sand/60 dark:divide-white/[0.06]">
        {day.sessions.map((session) => (
          <SessionBlock key={session.id} session={session} day={day} today={today} />
        ))}
      </div>
      <FreeLogList logs={freeLogs} />
    </section>
  );
}

// ─── Session block ──────────────────────────────────────────────────────────

type SessionStatus = "done" | "skipped" | "today" | "missed" | "future";

function SessionBlock({
  session,
  day,
  today,
}: {
  session: SportSessionResponse;
  day: WeekDay;
  today: string;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const quickLog = useQuickLogSession();
  const remove = useDeleteSportLog();
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  const sessionLogs = day.logs.filter((l) => l.sessionId === session.id);
  const log = sessionLogs.find((l) => l.completed) ?? sessionLogs[0] ?? null;
  const status: SessionStatus = log
    ? log.completed
      ? "done"
      : "skipped"
    : day.date === today
      ? "today"
      : day.date < today
        ? "missed"
        : "future";
  const summary = sessionSummary(session.description);
  const busy = quickLog.isPending || remove.isPending;
  const settled = log !== null && !isOptimistic(log);

  const onMutationError = (err: unknown) => {
    const { title, message } = parseAxiosError(err);
    showAlert({ title, message, type: "error", position: "top-center" });
  };

  // The pressed button unmounts when the state flips (optimistically), so keep
  // keyboard focus on the session block instead of letting it fall to the body.
  const keepFocus = () => blockRef.current?.focus({ preventScroll: true });

  const logSession = (completed: boolean) =>
    quickLog.mutate(quickLogBody(session, { executedDate: day.date, completed }), {
      onSuccess: keepFocus,
      onError: onMutationError,
    });

  const undo = () => {
    if (!log) return;
    remove.mutate(log.id, { onSuccess: keepFocus, onError: onMutationError });
  };

  const toggleDetails = () => {
    setExpanded((open) => {
      if (!open) {
        // Bring the full session into view once it renders (no-op in jsdom).
        requestAnimationFrame(() =>
          detailsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }),
        );
      }
      return !open;
    });
  };

  const detailsId = `sport-session-details-${session.id}`;
  const detailsLabel =
    status === "today"
      ? expanded
        ? t("sport.today.hide", "Antrenmanı gizle")
        : t("sport.today.start", "Antrenmanı başlat")
      : t("sport.today.details", "Detaylar");

  return (
    <div
      ref={blockRef}
      tabIndex={-1}
      className="py-4 outline-none first:pt-0 last:pb-0 focus-visible:ring-2 focus-visible:ring-husrev-amber rounded-xl"
    >
      <h3 className="text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
        {session.name}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={CHIP}>
          {t("sport.today.minutes", "{{minutes}} dk", { minutes: session.plannedDuration })}
        </span>
        <span className={CHIP}>{t(`sport.location.${session.location}`)}</span>
        <span
          className={cn(
            CHIP,
            "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber",
          )}
        >
          {t(`sport.difficulty.${session.difficulty}`)}
        </span>
      </div>
      {summary && !expanded && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {summary}
        </p>
      )}

      {/* Live region: announces "Tamamlandı" / "Atlandı" after a tap without moving focus. */}
      <p role="status" className={cn("mt-3 flex min-h-5 items-center gap-1.5", STATUS)}>
        {status === "done" && log && (
          <>
            <BsCheckCircleFill className="h-4 w-4 text-husrev-moss" aria-hidden />
            <span className="text-husrev-moss dark:text-husrev-moss">
              {t("sport.today.completed", "Tamamlandı · {{minutes}} dk", {
                minutes: log.actualDuration,
              })}
            </span>
          </>
        )}
        {status === "skipped" && (
          <>
            <BsDashCircle className="h-4 w-4" aria-hidden />
            {t("sport.today.skipped", "Atlandı")}
          </>
        )}
        {status === "missed" && t("sport.today.missed", "Kaçırıldı")}
        {status === "future" && t("sport.today.planned", "Planlandı")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "today" && (
          <button
            type="button"
            onClick={() => logSession(true)}
            disabled={busy}
            className={PRIMARY}
          >
            {t("sport.today.done", "Yaptım ✓")}
          </button>
        )}
        {(status === "missed" || status === "skipped") && (
          <button
            type="button"
            onClick={() => logSession(true)}
            disabled={busy}
            className={PRIMARY}
          >
            {t("sport.today.didAnyway", "Yine de yaptım")}
          </button>
        )}
        {status === "missed" && (
          <button type="button" onClick={() => logSession(false)} disabled={busy} className={GHOST}>
            {t("sport.today.skip", "Atla")}
          </button>
        )}
        {status === "done" && log && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            disabled={!settled || busy}
            className={GHOST}
          >
            {t("sport.today.howWasIt", "Nasıldı?")}
          </button>
        )}
        {(status === "done" || status === "skipped") && (
          <button type="button" onClick={undo} disabled={!settled || busy} className={QUIET}>
            {t("sport.today.undo", "Geri al")}
          </button>
        )}
        {session.description.trim() && (
          <button
            type="button"
            onClick={toggleDetails}
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            className={status === "today" ? GHOST : QUIET}
          >
            {expanded ? (
              <BiChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <BiChevronRight className="h-4 w-4" aria-hidden />
            )}
            {detailsLabel}
          </button>
        )}
      </div>

      {expanded && (
        <div id={detailsId} ref={detailsRef} className="mt-4">
          <SessionSections text={session.description} />
        </div>
      )}

      {sheetOpen && log && (
        <QuickLogSheet log={log} sessionName={session.name} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}

// ─── Secondary states ───────────────────────────────────────────────────────

function FreeLogList({ logs }: { logs: SportLogResponse[] }) {
  const { t } = useTranslation();
  if (!logs.length) return null;
  return (
    <ul className="mt-4 space-y-1 border-t border-husrev-sand/60 pt-3 dark:border-white/[0.06]">
      {logs.map((log) => (
        <li
          key={log.id}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300"
        >
          {log.completed ? (
            <BsCheckCircleFill className="h-3.5 w-3.5 text-husrev-moss" aria-hidden />
          ) : (
            <BsDashCircle className="h-3.5 w-3.5 text-gray-400" aria-hidden />
          )}
          {t("sport.today.freeWorkout", "Serbest antrenman · {{minutes}} dk", {
            minutes: log.actualDuration,
          })}
        </li>
      ))}
    </ul>
  );
}

function RestCard({
  program,
  day,
  kicker,
  freeLogs,
}: {
  program: SportProgramResponse;
  day: WeekDay;
  kicker: string;
  freeLogs: SportLogResponse[];
}) {
  const { t } = useTranslation();
  const next = nextPlanned(program, day.date);
  return (
    <section className={CARD} aria-label={kicker}>
      <p className={KICKER}>{kicker}</p>
      <h3 className="mt-3 inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
        <BiMoon className="h-5 w-5 text-husrev-amber" aria-hidden />
        {day.isToday
          ? t("sport.today.rest", "Bugün dinlenme günü")
          : t("sport.today.restDay", "Dinlenme günü")}
      </h3>
      {next && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("sport.today.nextUp", "Sırada: {{name}} · {{day}}", {
            name: next.session.name,
            day: t(`sport.day.${weekdayIndex(parseLocalISO(next.date))}`),
          })}
        </p>
      )}
      <FreeLogList logs={freeLogs} />
    </section>
  );
}

function UpcomingCard({ program }: { program: SportProgramResponse }) {
  const { t, i18n } = useTranslation();
  const fmt = useDateFormat(i18n.language);
  const { start } = programWindow(program);
  return (
    <section className={CARD}>
      <p className={KICKER}>{program.name}</p>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
        {t("sport.today.upcoming", "Program {{date}} tarihinde başlıyor", {
          date: fmt.format(parseLocalISO(start)),
        })}
      </h3>
      <Link href="/sport/programs" className={`${GHOST} mt-4 inline-flex no-underline`}>
        {t("sport.today.viewPrograms", "Programlara git")}
      </Link>
    </section>
  );
}

function EndedCard({
  program,
  rangeLogs,
  today,
}: {
  program: SportProgramResponse;
  rangeLogs?: SportLogResponse[];
  today: string;
}) {
  const { t } = useTranslation();
  const summary = rangeLogs ? adherence(program, rangeLogs, today) : null;
  return (
    <section className={CARD}>
      <p className={KICKER}>{program.name}</p>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
        {summary
          ? t("sport.today.ended", "Program bitti: {{done}}/{{planned}}", {
              done: summary.done,
              planned: summary.planned,
            })
          : t("sport.today.endedShort", "Program bitti")}
      </h3>
      <Link href="/sport/programs" className={`${GHOST} mt-4 inline-flex no-underline`}>
        {t("sport.today.viewPrograms", "Programlara git")}
      </Link>
    </section>
  );
}

function NoProgramCard() {
  const { t } = useTranslation();
  return (
    <section className={cn(CARD, "text-center")}>
      <p className={KICKER}>{t("sport.home.noProgram.title", "Aktif bir programın yok")}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-gray-300">
        {t("sport.home.noProgram.body", "Yeni bir program oluştur ya da yapay zekâya bıraktır.")}
      </p>
      <Link href="/sport/programs" className={`${LINK_PRIMARY} mt-4 inline-flex`}>
        {t("sport.home.noProgram.cta", "Program oluştur")}
      </Link>
    </section>
  );
}
