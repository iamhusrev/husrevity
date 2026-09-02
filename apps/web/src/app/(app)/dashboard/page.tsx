"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import StatCard from "@/components/dashboard/StatCard";
import TodaySuggestionsCard from "@/components/dashboard/TodaySuggestionsCard";
import RoutineNowCard from "@/components/dashboard/RoutineNowCard";
import { useAuth } from "@/providers/AuthProvider";
import { useNotes } from "@/hooks/useNotes";
import { useReminderLists } from "@/hooks/useReminders";
import { useProjects } from "@/hooks/useProjects";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useVaultEntities } from "@/hooks/useVault";
import { useRoutineSegments } from "@/hooks/useRoutine";
import { reminderService } from "@/services/reminder-service";
import { projectService } from "@/services/project-service";
import { ReminderResponse } from "@/types/reminder/reminder";
import { TaskResponse, TaskStatus } from "@/types/project/project";
import { formatDate, formatDateTime, formatTime, formatWeekdayDayMonth } from "@/utils/i18n-date";
import {
  BiNote,
  BiBell,
  BiTask,
  BiCalendar,
  BiLockAlt,
  BiPin,
} from "react-icons/bi";
import { HiOutlineClock } from "react-icons/hi2";

const TASK_STATUS_TONES: Record<TaskStatus, string> = {
  TODO: "bg-gray-400",
  IN_PROGRESS: "bg-husrev-amber",
  DONE: "bg-husrev-moss",
  CANCELLED: "bg-red-400",
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function endOfWeek(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 7);
  return d;
}

function bucketReminder(r: ReminderResponse): "overdue" | "today" | "week" | "later" | "none" {
  if (!r.dueAt || r.completedAt) return "none";
  const due = new Date(r.dueAt).getTime();
  const now = Date.now();
  const today = endOfToday().getTime();
  const week = endOfWeek().getTime();
  if (due < now) return "overdue";
  if (due <= today) return "today";
  if (due <= week) return "week";
  return "later";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const weekRange = useMemo(
    () => ({ from: startOfToday().toISOString(), to: endOfWeek().toISOString() }),
    [],
  );

  const { data: notes = [] } = useNotes();
  const { data: reminderLists = [] } = useReminderLists();
  const { data: projects = [] } = useProjects();
  const { data: events = [] } = useCalendarEvents(weekRange);
  const { data: vaultEntries = [] } = useVaultEntities();
  const { data: routineSegments = [] } = useRoutineSegments();

  // Parallel: reminders for every list
  const reminderQueries = useQueries({
    queries: reminderLists.map((l) => ({
      queryKey: ["reminders", l.id] as const,
      queryFn: () => reminderService.listReminders(l.id),
      select: (d: { data: ReminderResponse[] }) => d.data,
      enabled: l.id > 0,
    })),
  });
  const allReminders: ReminderResponse[] = reminderQueries.flatMap(
    (q) => (q.data as ReminderResponse[] | undefined) ?? [],
  );

  // Parallel: tasks for every project
  const taskQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["project-tasks", p.id] as const,
      queryFn: () => projectService.listTasks(p.id),
      select: (d: { data: TaskResponse[] }) => d.data,
      enabled: p.id > 0,
    })),
  });
  const allTasks: TaskResponse[] = taskQueries.flatMap(
    (q) => (q.data as TaskResponse[] | undefined) ?? [],
  );

  // Derived
  const pinnedCount = notes.filter((n) => n.pinned && !n.archived).length;
  const dueTodayOrOverdueCount = allReminders.filter((r) => {
    const b = bucketReminder(r);
    return b === "overdue" || b === "today";
  }).length;
  const activeTaskCount = allTasks.filter(
    (t) => t.status === "TODO" || t.status === "IN_PROGRESS",
  ).length;
  const eventsThisWeek = events.length;
  const todaysEvents = useMemo(() => {
    const start = startOfToday().getTime();
    const end = endOfToday().getTime();
    return events
      .filter((e) => {
        const t = new Date(e.startAt).getTime();
        return t >= start && t <= end;
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [events]);

  const groupedReminders = useMemo(() => {
    const groups: Record<"overdue" | "today" | "week", ReminderResponse[]> = {
      overdue: [],
      today: [],
      week: [],
    };
    for (const r of allReminders) {
      const b = bucketReminder(r);
      if (b === "overdue" || b === "today" || b === "week") {
        groups[b].push(r);
      }
    }
    const sortByDue = (a: ReminderResponse, b: ReminderResponse) =>
      new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime();
    groups.overdue.sort(sortByDue);
    groups.today.sort(sortByDue);
    groups.week.sort(sortByDue);
    return groups;
  }, [allReminders]);

  const tasksByStatus = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      DONE: 0,
      CANCELLED: 0,
    };
    for (const t of allTasks) counts[t.status]++;
    return counts;
  }, [allTasks]);
  const totalTasks = allTasks.length;

  const recentNotes = useMemo(
    () =>
      [...notes]
        .filter((n) => !n.archived)
        .sort((a, b) => {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        })
        .slice(0, 5),
    [notes],
  );

  const now = new Date();
  const hour = now.getHours();
  const greetingKey =
    hour < 5
      ? "dashboard.greeting.night"
      : hour < 12
        ? "dashboard.greeting.morning"
        : hour < 18
          ? "dashboard.greeting.afternoon"
          : "dashboard.greeting.evening";
  const dayLabel = formatWeekdayDayMonth(now);

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("nav.dashboard")}
        kicker={t("dashboard.kicker")}
        flourish={t("dashboard.flourish")}
      />

      <div className="relative overflow-hidden rounded-3xl ring-1 ring-husrev-sand/90 bg-gradient-to-br from-white via-husrev-cream/60 to-husrev-sand/40 p-5 sm:p-7 md:p-9 grain dark:from-husrev-shadow dark:via-husrev-ink dark:to-husrev-shadow dark:ring-white/[0.06] husrev-settle">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-husrev-amber/10 blur-3xl dark:bg-husrev-amber/15" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-husrev-moss/10 blur-3xl dark:bg-husrev-moss/15" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {dayLabel}
            </span>
            <h2 className="text-[26px] xsm:text-[32px] md:text-[44px] leading-[1.05] tracking-tight font-semibold text-husrev-ink dark:text-husrev-cream">
              <span className="font-instrument-serif italic font-normal word-underline">
                {t(greetingKey)}
              </span>
              {user?.firstName ? `, ${user.firstName}` : ""}.
            </h2>
            <p className="max-w-xl text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">
              {t("dashboard.hero.subtitleBefore")}{" "}
              <span className="font-instrument-serif italic text-husrev-ember dark:text-husrev-amber">
                {t("dashboard.hero.subtitleEm")}
              </span>{" "}
              {t("dashboard.hero.subtitleAfter")}
            </p>
          </div>

          <div className="flex items-center gap-5 md:flex-col md:items-end md:gap-2">
            <div className="text-right">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {todaysEvents.length > 0
                  ? t("dashboard.hero.eventsToday", {
                      count: todaysEvents.length,
                    })
                  : t("dashboard.hero.noEventsToday")}
              </div>
              <div className="mt-1 font-instrument-serif italic text-2xl text-husrev-ember dark:text-husrev-amber">
                {formatTime(now)}
              </div>
            </div>
            <div className="hidden md:block h-12 w-px bg-husrev-sand dark:bg-white/10" />
          </div>
        </div>

        <div className="husrev-rule husrev-shimmer mt-7" />
      </div>

      {/* Today's AI suggestion — the dashboard's actionable focal widget */}
      <TodaySuggestionsCard />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6 husrev-stagger">
        <StatCard
          icon={<BiNote size={22} />}
          label={t("dashboard.stat.notes")}
          value={notes.filter((n) => !n.archived).length}
          hint={
            pinnedCount > 0 ? t("dashboard.stat.pinnedHint", { count: pinnedCount }) : undefined
          }
          href="/notes"
          tone="brand"
        />
        <StatCard
          icon={<BiBell size={22} />}
          label={t("dashboard.stat.reminders")}
          value={dueTodayOrOverdueCount}
          hint={t("dashboard.stat.dueHint")}
          href="/reminders"
          tone={dueTodayOrOverdueCount > 0 ? "ember" : "moss"}
        />
        <StatCard
          icon={<BiTask size={22} />}
          label={t("dashboard.stat.activeTasks")}
          value={activeTaskCount}
          hint={totalTasks > 0 ? t("dashboard.stat.totalHint", { count: totalTasks }) : undefined}
          href="/projects"
          tone="moss"
        />
        <StatCard
          icon={<BiCalendar size={22} />}
          label={t("dashboard.stat.thisWeek")}
          value={eventsThisWeek}
          hint={t("dashboard.stat.events")}
          href="/calendar"
          tone="amber"
        />
        {/* Vault is stat-only by design — never preview vault contents on the dashboard */}
        <StatCard
          icon={<BiLockAlt size={22} />}
          label={t("dashboard.stat.vault")}
          value={vaultEntries.length}
          hint={t("dashboard.stat.vaultHint")}
          href="/vault"
          tone="ink"
        />
        <StatCard
          icon={<HiOutlineClock size={22} />}
          label={t("dashboard.stat.routineSegments")}
          value={routineSegments.length}
          href="/evkat"
          tone="moss"
        />
      </div>

      {/* Row A: RoutineNowCard | Today's Agenda */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RoutineNowCard />
        <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {t("dashboard.todayAgenda")}
            </h3>
            <Link href="/calendar" className="text-xs text-brand-500 hover:underline">
              {t("dashboard.calendarLink")} →
            </Link>
          </div>
          {todaysEvents.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{t("dashboard.noEvents")}</p>
          ) : (
            <ul className="space-y-2">
              {todaysEvents.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800"
                >
                  <span
                    className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: e.colorHex ?? "#3b82f6" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {e.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {e.allDay ? t("dashboard.allDay") : formatTime(e.startAt)}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Row B: Upcoming Reminders | Recent Notes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {t("dashboard.upcomingReminders")}
            </h3>
            <Link href="/reminders" className="text-xs text-brand-500 hover:underline">
              {t("dashboard.remindersLink")} →
            </Link>
          </div>
          {groupedReminders.overdue.length === 0 &&
          groupedReminders.today.length === 0 &&
          groupedReminders.week.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{t("dashboard.noUpcoming")}</p>
          ) : (
            <div className="space-y-3">
              {groupedReminders.overdue.length > 0 && (
                <ReminderGroup
                  title={t("dashboard.reminderGroup.overdue")}
                  tone="ember"
                  items={groupedReminders.overdue}
                  moreLabel={(n) => t("dashboard.reminderGroup.more", { count: n })}
                />
              )}
              {groupedReminders.today.length > 0 && (
                <ReminderGroup
                  title={t("dashboard.reminderGroup.today")}
                  tone="amber"
                  items={groupedReminders.today}
                  moreLabel={(n) => t("dashboard.reminderGroup.more", { count: n })}
                />
              )}
              {groupedReminders.week.length > 0 && (
                <ReminderGroup
                  title={t("dashboard.reminderGroup.thisWeek")}
                  tone="ink"
                  items={groupedReminders.week}
                  moreLabel={(n) => t("dashboard.reminderGroup.more", { count: n })}
                />
              )}
            </div>
          )}
        </section>
        
        <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {t("dashboard.recentNotes")}
            </h3>
            <Link href="/notes" className="text-xs text-brand-500 hover:underline">
              {t("dashboard.notesLink")} →
            </Link>
          </div>
          {recentNotes.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{t("dashboard.noNotes")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.id}`}
                    className="flex items-center gap-3 py-2.5 transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    {n.pinned ? (
                      <BiPin className="shrink-0 text-brand-500" size={14} />
                    ) : (
                      <BiNote className="shrink-0 text-gray-300" size={14} />
                    )}
                    <span className="flex-1 truncate text-sm text-gray-800 dark:text-white/90">
                      {n.title}
                    </span>
                    {n.updatedAt && (
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {formatDate(n.updatedAt)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Row C: Tasks by status */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {t("dashboard.tasksTitle")}
          </h3>
          <Link href="/projects" className="text-xs text-brand-500 hover:underline">
            {t("dashboard.projectsLink")} →
          </Link>
        </div>
        {totalTasks === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t("dashboard.noTasks")}</p>
        ) : (
          <div className="space-y-3">
            {(Object.keys(TASK_STATUS_TONES) as TaskStatus[]).map((s) => {
              const count = tasksByStatus[s];
              const pct = totalTasks > 0 ? (count / totalTasks) * 100 : 0;
              return (
                <div key={s}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-600 dark:text-gray-400">
                      {t(`dashboard.taskStatus.${s}`)}
                    </span>
                    <span className="text-gray-500">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className={`h-full transition-all ${TASK_STATUS_TONES[s]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ReminderGroup({
  title,
  tone,
  items,
  moreLabel,
}: {
  title: string;
  tone: "ember" | "amber" | "ink";
  items: ReminderResponse[];
  moreLabel: (count: number) => string;
}) {
  const dotClass =
    tone === "ember" ? "bg-husrev-ember" : tone === "amber" ? "bg-husrev-amber" : "bg-husrev-ink";
  const titleClass =
    tone === "ember"
      ? "text-husrev-ember dark:text-husrev-amber"
      : tone === "amber"
        ? "text-husrev-ember dark:text-husrev-amber"
        : "text-gray-500 dark:text-gray-400";

  return (
    <div>
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${titleClass}`}>
        {title} ({items.length})
      </p>
      <ul className="space-y-1.5">
        {items.slice(0, 4).map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            <span className="flex-1 truncate">{r.title}</span>
            {r.dueAt && (
              <span className="shrink-0 text-[11px] text-gray-400">{formatDateTime(r.dueAt)}</span>
            )}
          </li>
        ))}
        {items.length > 4 && (
          <li className="px-2 text-[11px] text-gray-400">{moreLabel(items.length - 4)}</li>
        )}
      </ul>
    </div>
  );
}
