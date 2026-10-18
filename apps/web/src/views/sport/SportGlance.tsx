"use client";

import { useTranslation } from "react-i18next";
import type { SportLogResponse, SportProgramResponse } from "@/types/sport/sport";
import { adherence, streak, weekProgress, type WeekDay } from "./sport-schedule";

export interface SportGlanceProps {
  program: SportProgramResponse;
  week: WeekDay[];
  /** Logs from the program start up to today. */
  rangeLogs: SportLogResponse[];
  today: string;
}

/** Three numbers: this week done/planned, the current streak, program adherence. */
export default function SportGlance({ program, week, rangeLogs, today }: SportGlanceProps) {
  const { t } = useTranslation();
  const thisWeek = weekProgress(week);
  const run = streak(program, rangeLogs, today);
  const percent = Math.round(adherence(program, rangeLogs, today).ratio * 100);

  const items: Array<{ label: string; value: string }> = [
    {
      label: t("sport.glance.thisWeek", "Bu hafta"),
      value: `${thisWeek.done}/${thisWeek.planned}`,
    },
    { label: t("sport.glance.streak", "Seri"), value: String(run) },
    {
      label: t("sport.glance.program", "Program"),
      value: t("sport.glance.percent", "%{{value}}", { value: percent }),
    },
  ];

  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl ring-1 ring-husrev-sand/80 bg-white/70 px-3 py-2.5 text-center dark:bg-husrev-shadow/60 dark:ring-white/[0.06]"
        >
          <dt className="husrev-kicker text-gray-500 dark:text-gray-400">{item.label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-husrev-ink dark:text-husrev-cream">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
