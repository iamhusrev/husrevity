"use client";

import { useTranslation } from "react-i18next";
import { BiChevronRight } from "react-icons/bi";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import TodaySuggestionsCard from "@/components/dashboard/TodaySuggestionsCard";
import ClaudeActivityStrip from "@/components/dashboard/ClaudeActivityStrip";
import TodayFocus from "@/components/dashboard/TodayFocus";
import TodayBoard from "@/views/today/TodayBoard";
import { useAuth } from "@/providers/AuthProvider";
import { useToday } from "@/hooks/useToday";
import { formatWeekdayDayMonth } from "@/utils/i18n-date";

function greetingKey(hour: number): string {
  if (hour < 5) return "dashboard.greeting.night";
  if (hour < 12) return "dashboard.greeting.morning";
  if (hour < 18) return "dashboard.greeting.afternoon";
  return "dashboard.greeting.evening";
}

/**
 * "Today" reads top to bottom in order of importance: where I am in the day and what to study,
 * then the timeline with due work, then optional helpers. The large greeting hero (which repeated
 * the header clock) and the always-open Claude audit log were removed to keep the page calm.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { data: today } = useToday();

  const now = new Date();
  const greeting = t(greetingKey(now.getHours()));
  const subtitle = `${formatWeekdayDayMonth(now)} · ${greeting}${
    user?.firstName ? `, ${user.firstName}` : ""
  }`;

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle={t("nav.dashboard")} description={subtitle} />

      <TodayFocus />

      <TodayBoard />

      <TodaySuggestionsCard activeBlockTitle={today?.currentBlock?.title} />

      {/* Audit log of changes Claude made through MCP; collapsed because it is rarely needed. */}
      <details className="group rounded-2xl bg-white ring-1 ring-husrev-sand/90 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 [&::-webkit-details-marker]:hidden">
          <BiChevronRight className="transition-transform group-open:rotate-90" aria-hidden="true" />
          {t("dashboard.focus.activity")}
        </summary>
        <div className="px-2 pb-2">
          <ClaudeActivityStrip />
        </div>
      </details>
    </div>
  );
}
