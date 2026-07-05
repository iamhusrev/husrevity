"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSportStats } from "@/hooks/useSport";
import { cn } from "@/utils/utils";
import { BiCalendarCheck, BiTimeFive, BiTrendingUp } from "react-icons/bi";

type Period = "30d" | "90d" | "all";

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeFor(period: Period): { from?: string; to?: string } {
  if (period === "all") return {};
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (period === "30d" ? 30 : 90));
  return { from: toISO(from), to: toISO(to) };
}

function HeroStat({
  kicker,
  value,
  icon,
}: {
  kicker: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-4 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
        {icon}
      </span>
      <div className="min-w-0">
        <span className="husrev-kicker text-gray-400 dark:text-gray-500">{kicker}</span>
        <p className="text-xl font-semibold tabular-nums text-husrev-ink dark:text-husrev-cream">
          {value}
        </p>
      </div>
    </div>
  );
}

function BarList({
  entries,
  labelFor,
  colorClass,
}: {
  entries: [string, number][];
  labelFor: (key: string) => string;
  colorClass: string;
}) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => (
        <div key={key} className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-husrev-ink dark:text-husrev-cream">
              {labelFor(key)}
            </span>
            <span className="tabular-nums">{value}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-husrev-sand/40 dark:bg-white/[0.06]">
            <div
              className={cn("h-full rounded-full", colorClass)}
              style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SportStatsView() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("30d");
  const { from, to } = rangeFor(period);
  const { data: stats, isLoading } = useSportStats(from, to);

  const activityEntries = useMemo(
    () => Object.entries(stats?.activityBreakdown ?? {}).sort((a, b) => b[1] - a[1]),
    [stats],
  );
  const intensityEntries = useMemo(
    () =>
      Object.entries(stats?.intensityDist ?? {}).sort(
        (a, b) => Number(a[0]) - Number(b[0]),
      ),
    [stats],
  );
  const weeklyTrend = stats?.weeklyTrend ?? [];
  const maxTrend = Math.max(1, ...weeklyTrend.map((w) => w.hoursCompleted));

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-1.5">
        {(["30d", "90d", "all"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              period === p
                ? "bg-husrev-ember text-husrev-cream"
                : "text-gray-600 hover:bg-husrev-sand/40 dark:text-gray-300 dark:hover:bg-white/[0.04]",
            )}
          >
            {t(`sport.stats.period.${p}`, p)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <HeroStat
          kicker={t("sport.stats.totalCompleted", "Tamamlanan antrenman")}
          value={String(stats?.totalCompleted ?? 0)}
          icon={<BiCalendarCheck size={18} />}
        />
        <HeroStat
          kicker={t("sport.stats.avgDuration", "Ortalama süre (dk)")}
          value={stats ? Math.round(stats.avgDuration).toString() : "0"}
          icon={<BiTimeFive size={18} />}
        />
        <HeroStat
          kicker={t("sport.stats.totalHours", "Toplam saat")}
          value={stats ? stats.totalHours.toFixed(1) : "0"}
          icon={<BiTrendingUp size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <h3 className="husrev-kicker text-gray-500 dark:text-gray-400 mb-3">
            {t("sport.stats.activityBreakdown", "Aktivite dağılımı")}
          </h3>
          {activityEntries.length === 0 ? (
            <p className="text-sm text-gray-400">{t("sport.stats.empty", "Henüz veri yok.")}</p>
          ) : (
            <BarList
              entries={activityEntries}
              labelFor={(k) => t(`sport.activity.${k}`, k)}
              colorClass="bg-husrev-ember"
            />
          )}
        </div>

        <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <h3 className="husrev-kicker text-gray-500 dark:text-gray-400 mb-3">
            {t("sport.stats.intensityDistribution", "Yoğunluk dağılımı")}
          </h3>
          {intensityEntries.length === 0 ? (
            <p className="text-sm text-gray-400">{t("sport.stats.empty", "Henüz veri yok.")}</p>
          ) : (
            <BarList
              entries={intensityEntries}
              labelFor={(k) => `${k}/10`}
              colorClass="bg-husrev-amber"
            />
          )}
        </div>
      </div>

      <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <h3 className="husrev-kicker text-gray-500 dark:text-gray-400 mb-4">
          {t("sport.stats.weeklyTrend", "Haftalık trend")}
        </h3>
        {weeklyTrend.length === 0 ? (
          <p className="text-sm text-gray-400">{t("sport.stats.empty", "Henüz veri yok.")}</p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-1">
            {weeklyTrend.map((w) => (
              <div key={w.weekStart} className="flex w-12 shrink-0 flex-col items-center gap-1.5">
                <div className="flex h-24 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-husrev-moss"
                    style={{
                      height: `${Math.max(4, (w.hoursCompleted / maxTrend) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-gray-400">
                  {w.weekStart.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
