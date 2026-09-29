"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import TodaySuggestionsCard from "@/components/dashboard/TodaySuggestionsCard";
import { useAuth } from "@/providers/AuthProvider";
import { useToday } from "@/hooks/useToday";
import { formatTime, formatWeekdayDayMonth } from "@/utils/i18n-date";
import { BiCheckCircle } from "react-icons/bi";
import { HiOutlineClock } from "react-icons/hi2";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { data: today, isLoading } = useToday();

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

  const nextUp = useMemo(() => {
    if (!today) return null;
    const nowMs = Date.now();
    return (
      today.timeline
        .filter((e) => new Date(e.scheduledAt).getTime() > nowMs)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ??
      null
    );
  }, [today]);

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
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t("today.now")}
            </div>
            <div className="mt-1 font-instrument-serif italic text-2xl text-husrev-ember dark:text-husrev-amber">
              {formatTime(now)}
            </div>
          </div>
        </div>

        <div className="husrev-rule husrev-shimmer mt-7" />
      </div>

      <TodaySuggestionsCard activeBlockTitle={today?.currentBlock?.title} />

      {/* Şu an — active block + next up */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
          {t("today.currentBlock.title")}
        </h3>
        {isLoading ? (
          <p className="py-4 text-center text-sm text-gray-400">{t("today.loading")}</p>
        ) : today?.currentBlock ? (
          <div className="flex items-center gap-3">
            <HiOutlineClock size={22} className="shrink-0 text-husrev-ember dark:text-husrev-amber" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {today.currentBlock.title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatTime(today.currentBlock.scheduledAt)}
              </p>
            </div>
          </div>
        ) : (
          <p className="py-2 text-sm text-gray-400">{t("today.currentBlock.empty")}</p>
        )}
        {nextUp && (
          <div className="mt-3 border-t border-husrev-sand/70 pt-3 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
            {t("today.nextUp")}: <span className="font-medium">{nextUp.title}</span> ·{" "}
            {formatTime(nextUp.scheduledAt)}
          </div>
        )}
      </section>

      {/* Tek zaman çizelgesi */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
          {t("today.timeline.title")}
        </h3>
        {!isLoading && (!today || today.timeline.length === 0) ? (
          <p className="py-6 text-center text-sm text-gray-400">{t("today.timeline.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {today?.timeline.map((entry, i) => (
              <li
                key={`${entry.itemId}-${entry.occursOn ?? i}`}
                className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800"
              >
                <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-husrev-amber" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                    {entry.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(entry.scheduledAt)}
                    {entry.durationMin ? ` · ${entry.durationMin} dk` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Gecikmiş / bugün teslim işler */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {t("today.dueToday.title")}
          </h3>
          <Link href="/projects" className="text-xs text-brand-500 hover:underline">
            {t("dashboard.projectsLink")} →
          </Link>
        </div>
        {!isLoading && (!today || today.dueToday.length === 0) ? (
          <p className="py-6 text-center text-sm text-gray-400">{t("today.dueToday.empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {today?.dueToday.map((item) => {
              const overdue = item.dueAt ? new Date(item.dueAt).getTime() < Date.now() : false;
              return (
                <li
                  key={item.itemId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
                >
                  <BiCheckCircle
                    className={`shrink-0 ${overdue ? "text-husrev-ember" : "text-gray-300"}`}
                    size={16}
                  />
                  <span className="flex-1 truncate">{item.title}</span>
                  {item.dueAt && (
                    <span
                      className={`shrink-0 text-[11px] ${
                        overdue ? "text-husrev-ember dark:text-husrev-amber" : "text-gray-400"
                      }`}
                    >
                      {formatTime(item.dueAt)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
