// Pure date helpers for the sport views (no React).
//
// Weekday convention: the API (`sport_session.planned_day_of_week`) and the
// `sport.day.*` i18n keys count 0 = Monday ... 6 = Sunday, while JS
// `Date#getDay()` counts 0 = Sunday. Always go through `weekdayIndex`.

import type {
  Difficulty,
  SportLogResponse,
  SportProgramResponse,
  SportSessionResponse,
} from "@/types/sport/sport";

/** Weekday of `date` in the app convention: 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * `YYYY-MM-DD` of `date` in LOCAL time. `toISOString().slice(0, 10)` converts
 * to UTC first and lands on the neighbouring day near midnight.
 */
export function localISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Date arithmetic ────────────────────────────────────────────────────────
// Days are handled as local `YYYY-MM-DD` strings (lexicographic order equals
// calendar order) and converted to a local noon `Date` only to add days.

/** Local `Date` (noon, to stay clear of DST edges) for a `YYYY-MM-DD` string. */
export function parseLocalISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** `YYYY-MM-DD` that lies `days` days after `iso` (negative values go back). */
export function addDays(iso: string, days: number): string {
  const date = parseLocalISO(iso);
  date.setDate(date.getDate() + days);
  return localISO(date);
}

function toISO(date: Date | string): string {
  return typeof date === "string" ? date : localISO(date);
}

/** Monday..Sunday (local) of the week that contains `date`, as ISO strings. */
export function weekRange(date: Date): { from: string; to: string } {
  const from = addDays(localISO(date), -weekdayIndex(date));
  return { from, to: addDays(from, 6) };
}

// ─── Program window ─────────────────────────────────────────────────────────

export type ProgramPhase = "upcoming" | "running" | "ended";

/**
 * First and last day of the program. The last day is `weekCount` weeks after
 * the start; an earlier `endDate` shortens it, a later one never extends it.
 * `end` is null only when neither `weekCount` nor `endDate` bounds the program.
 */
export function programWindow(program: SportProgramResponse): {
  start: string;
  end: string | null;
} {
  const start = program.startDate;
  const byWeeks = program.weekCount > 0 ? addDays(start, program.weekCount * 7 - 1) : null;
  const byEndDate = program.endDate ?? null;
  let end: string | null;
  if (byWeeks && byEndDate) end = byEndDate < byWeeks ? byEndDate : byWeeks;
  else end = byWeeks ?? byEndDate;
  return { start, end };
}

function inWindow(program: SportProgramResponse, iso: string): boolean {
  const { start, end } = programWindow(program);
  return iso >= start && (end === null || iso <= end);
}

/** 1-based week index of `date` inside the program, or null outside the window. */
export function programWeek(
  program: SportProgramResponse,
  date: Date | string,
): { week: number; total: number } | null {
  const iso = toISO(date);
  if (!inWindow(program, iso)) return null;
  const days = Math.round(
    (parseLocalISO(iso).getTime() - parseLocalISO(program.startDate).getTime()) / 86_400_000,
  );
  return { week: Math.floor(days / 7) + 1, total: program.weekCount };
}

export function programPhase(program: SportProgramResponse, date: Date | string): ProgramPhase {
  const iso = toISO(date);
  const { start, end } = programWindow(program);
  if (iso < start) return "upcoming";
  if (end !== null && iso > end) return "ended";
  return "running";
}

// ─── Week model ─────────────────────────────────────────────────────────────

/**
 * State of one calendar day of the program. "today" is NOT a state: the
 * current day carries `isToday: true` next to its own state (rest / planned /
 * done / skipped), so the UI can show the ring and the state together.
 *
 * Precedence for a day with planned sessions inside the program window:
 *   1. `done`    every planned session has a log with `completed: true`
 *   2. `skipped` some planned session has a log with `completed: false`
 *   3. `missed`  the day is before today and some session is still unlogged
 *   4. `planned` otherwise (today or the future)
 * Days without planned sessions and days outside the window are `rest`, even
 * when a free workout (sessionId null) was logged; such logs stay in `logs`.
 */
export type DayState = "done" | "skipped" | "missed" | "planned" | "rest";

export interface WeekDay {
  /** `YYYY-MM-DD` (local). */
  date: string;
  /** 0 = Monday ... 6 = Sunday. */
  weekday: number;
  isToday: boolean;
  state: DayState;
  /** Sessions planned on this weekday, sorted by position (empty outside the window). */
  sessions: SportSessionResponse[];
  /** Every log executed on this date, planned-session and free ones alike. */
  logs: SportLogResponse[];
}

/** Sessions planned on `weekdayIdx` (0 = Monday), sorted by `position`. */
export function sessionsForDay(
  program: SportProgramResponse | null,
  weekdayIdx: number,
): SportSessionResponse[] {
  if (!program) return [];
  return program.sessions
    .filter((s) => s.plannedDayOfWeek === weekdayIdx)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

function sessionLogsOn(logs: SportLogResponse[], sessionId: string, iso: string) {
  return logs.filter((l) => l.sessionId === sessionId && l.executedDate === iso);
}

function sessionDone(logs: SportLogResponse[], sessionId: string, iso: string): boolean {
  return sessionLogsOn(logs, sessionId, iso).some((l) => l.completed);
}

/** Planned sessions of a calendar day, or none outside the program window. */
function plannedOn(program: SportProgramResponse | null, iso: string): SportSessionResponse[] {
  if (!program || !inWindow(program, iso)) return [];
  return sessionsForDay(program, weekdayIndex(parseLocalISO(iso)));
}

function dayState(
  sessions: SportSessionResponse[],
  logs: SportLogResponse[],
  iso: string,
  todayIso: string,
): DayState {
  if (!sessions.length) return "rest";
  if (sessions.every((s) => sessionDone(logs, s.id, iso))) return "done";
  if (sessions.some((s) => sessionLogsOn(logs, s.id, iso).some((l) => !l.completed))) {
    return "skipped";
  }
  return iso < todayIso ? "missed" : "planned";
}

/** The seven days (Monday..Sunday) of the week that contains `today`. */
export function buildWeek(
  program: SportProgramResponse | null,
  logs: SportLogResponse[],
  today: Date | string,
): WeekDay[] {
  const todayIso = toISO(today);
  const { from } = weekRange(parseLocalISO(todayIso));
  return Array.from({ length: 7 }, (_, weekday) => {
    const date = addDays(from, weekday);
    const sessions = plannedOn(program, date);
    return {
      date,
      weekday,
      isToday: date === todayIso,
      state: dayState(sessions, logs, date, todayIso),
      sessions,
      logs: logs.filter((l) => l.executedDate === date),
    };
  });
}

/** First planned session strictly after `afterIso`, within the program window (one week lookahead). */
export function nextPlanned(
  program: SportProgramResponse | null,
  afterIso: string,
): { date: string; session: SportSessionResponse } | null {
  if (!program) return null;
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDays(afterIso, offset);
    const [session] = plannedOn(program, date);
    if (session) return { date, session };
  }
  return null;
}

/** Every planned (date, session) pair from the start up to and including `untilIso`. */
function plannedUntil(
  program: SportProgramResponse,
  untilIso: string,
): Array<{ date: string; session: SportSessionResponse }> {
  const { start, end } = programWindow(program);
  const last = end !== null && end < untilIso ? end : untilIso;
  const pairs: Array<{ date: string; session: SportSessionResponse }> = [];
  for (let date = start; date <= last; date = addDays(date, 1)) {
    for (const session of plannedOn(program, date)) pairs.push({ date, session });
  }
  return pairs;
}

/** Completed share of the sessions planned from the start up to and including today. */
export function adherence(
  program: SportProgramResponse,
  logs: SportLogResponse[],
  today: Date | string,
): { done: number; planned: number; ratio: number } {
  const pairs = plannedUntil(program, toISO(today));
  const done = pairs.filter((p) => sessionDone(logs, p.session.id, p.date)).length;
  const planned = pairs.length;
  return { done, planned, ratio: planned ? done / planned : 0 };
}

/**
 * Consecutive planned days that were fully done, counted backwards from
 * yesterday. Today is added when it is already done and ignored while it is
 * still open (planned); a skipped today breaks the streak like any other
 * skipped or missed day. Rest days and days outside the window are skipped.
 */
export function streak(
  program: SportProgramResponse,
  logs: SportLogResponse[],
  today: Date | string,
): number {
  const todayIso = toISO(today);
  const { start } = programWindow(program);
  let count = 0;
  for (let date = todayIso; date >= start; date = addDays(date, -1)) {
    const state = dayState(plannedOn(program, date), logs, date, todayIso);
    if (state === "rest") continue;
    if (state === "done") count += 1;
    else if (state === "planned" && date === todayIso) continue;
    else break;
  }
  return count;
}

const DEFAULT_INTENSITY: Record<Difficulty, number> = { EASY: 4, MODERATE: 6, HARD: 8 };

/** Intensity (1-10) pre-filled for a one-tap log of a session of that difficulty. */
export function defaultIntensity(difficulty: Difficulty): number {
  return DEFAULT_INTENSITY[difficulty] ?? 6;
}

export interface QuickLogBody {
  sessionId: string;
  executedDate: string;
  actualDuration: number;
  completed: boolean;
  intensity: number;
}

/** Body of the one-tap log for a planned session: planned duration, default intensity. */
export function quickLogBody(
  session: Pick<SportSessionResponse, "id" | "plannedDuration" | "difficulty">,
  options: { executedDate?: string; completed?: boolean } = {},
): QuickLogBody {
  return {
    sessionId: session.id,
    executedDate: options.executedDate ?? localISO(new Date()),
    actualDuration: session.plannedDuration,
    completed: options.completed ?? true,
    intensity: defaultIntensity(session.difficulty),
  };
}

/** Sessions planned in the week and how many of them already have a completed log. */
export function weekProgress(week: WeekDay[]): { done: number; planned: number } {
  let done = 0;
  let planned = 0;
  for (const day of week) {
    for (const session of day.sessions) {
      planned += 1;
      if (sessionDone(day.logs, session.id, day.date)) done += 1;
    }
  }
  return { done, planned };
}
