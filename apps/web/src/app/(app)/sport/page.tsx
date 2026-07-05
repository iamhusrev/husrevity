"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import { useSportLogs, useSportPrograms } from "@/hooks/useSport";
import { SportLogResponse } from "@/types/sport/sport";
import SportProfileCard from "@/views/sport/SportProfileCard";
import SportProgramsList from "@/views/sport/SportProgramsList";
import SportProgramDetail from "@/views/sport/SportProgramDetail";
import SportStatsView from "@/views/sport/SportStatsView";
import SportLogModal, { SessionOption } from "@/views/sport/SportLogModal";
import {
  BiCalendarCheck,
  BiChevronLeft,
  BiChevronRight,
  BiPlus,
  BiTimeFive,
} from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";

type Tab = "profile" | "programs" | "logs" | "stats";

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function LogsTab() {
  const { t, i18n } = useTranslation();
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [logModal, setLogModal] = useState<{ open: boolean; initial: SportLogResponse | null }>({
    open: false,
    initial: null,
  });

  const from = toISO(startOfMonth(monthAnchor));
  const to = toISO(endOfMonth(monthAnchor));
  const { data: logs = [], isLoading } = useSportLogs(from, to);
  const { data: programs = [] } = useSportPrograms();

  const sessionOptions: SessionOption[] = useMemo(
    () =>
      programs.flatMap((p) =>
        p.sessions.map((s) => ({ id: s.id, label: `${p.name} — ${s.name}` })),
      ),
    [programs],
  );

  const sessionLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of sessionOptions) map.set(opt.id, opt.label);
    return map;
  }, [sessionOptions]);

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || "tr", { month: "long", year: "numeric" }),
    [i18n.language],
  );
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || "tr", { day: "numeric", month: "short" }),
    [i18n.language],
  );

  const sorted = [...logs].sort((a, b) => (a.executedDate < b.executedDate ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
            }
            aria-label={t("sport.logs.prevMonth", "Önceki ay")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-cream hover:text-husrev-ink dark:hover:bg-white/[0.06] dark:hover:text-husrev-cream"
          >
            <BiChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium capitalize tabular-nums text-husrev-ink dark:text-husrev-cream">
            {monthFmt.format(monthAnchor)}
          </span>
          <button
            type="button"
            onClick={() =>
              setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
            }
            aria-label={t("sport.logs.nextMonth", "Sonraki ay")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-cream hover:text-husrev-ink dark:hover:bg-white/[0.06] dark:hover:text-husrev-cream"
          >
            <BiChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setLogModal({ open: true, initial: null })}
          className="husrev-btn"
        >
          <BiPlus size={16} />
          {t("sport.logs.newLog", "Antrenman ekle")}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-dashed ring-husrev-sand bg-husrev-cream/40 p-8 text-center text-sm text-gray-500 dark:bg-white/[0.03] dark:ring-white/[0.06] dark:text-gray-400">
          {t("sport.logs.empty", "Bu ay için henüz antrenman kaydın yok.")}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => setLogModal({ open: true, initial: log })}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 ring-husrev-sand/70 bg-white transition hover:bg-husrev-cream/40 dark:bg-husrev-shadow dark:ring-white/[0.06] dark:hover:bg-white/[0.03]"
            >
              {log.completed ? (
                <BsCheckCircleFill className="h-5 w-5 shrink-0 text-husrev-moss" />
              ) : (
                <BsCircle className="h-5 w-5 shrink-0 text-gray-300 dark:text-gray-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                    {log.sessionId
                      ? sessionLabelById.get(log.sessionId) ?? t("sport.logModal.none", "Serbest antrenman")
                      : t("sport.logModal.none", "Serbest antrenman")}
                  </span>
                  <span className="rounded-full bg-husrev-amber/15 px-2 py-0.5 text-[11px] font-medium text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
                    {log.intensity}/10
                  </span>
                </div>
                {log.notes && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{log.notes}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <BiCalendarCheck className="h-3.5 w-3.5" />
                  {dateFmt.format(new Date(`${log.executedDate}T00:00:00`))}
                </span>
                <span className="inline-flex items-center gap-1">
                  <BiTimeFive className="h-3.5 w-3.5" />
                  {log.actualDuration} {t("sport.profile.minutesShort", "dk")}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {logModal.open && (
        <SportLogModal
          initial={logModal.initial}
          sessionOptions={sessionOptions}
          defaultDate={toISO(new Date())}
          onClose={() => setLogModal({ open: false, initial: null })}
        />
      )}
    </div>
  );
}

export default function SportPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("profile");
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: t("sport.tabs.profile", "Profil") },
    { id: "programs", label: t("sport.tabs.programs", "Programlar") },
    { id: "logs", label: t("sport.tabs.logs", "Antrenman günlüğü") },
    { id: "stats", label: t("sport.tabs.stats", "İstatistikler") },
  ];

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("sport.title", "Spor")}
        kicker={t("sport.kicker", "Antrenman takibi")}
        flourish={t("sport.flourish", "formunda kal")}
      />

      <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        {t(
          "sport.intro",
          "Spor profilini yönet, antrenman programları oluştur, seansları logla ve ilerlemeni takip et.",
        )}
      </p>

      <nav
        role="tablist"
        className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 no-scrollbar"
      >
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => {
              setTab(tb.id);
              if (tb.id !== "programs") setSelectedProgramId(null);
            }}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
              tab === tb.id
                ? "bg-husrev-ember text-husrev-cream"
                : "text-gray-600 hover:bg-husrev-sand/40 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      {tab === "profile" && <SportProfileCard />}

      {tab === "programs" &&
        (selectedProgramId ? (
          <SportProgramDetail
            programId={selectedProgramId}
            onBack={() => setSelectedProgramId(null)}
          />
        ) : (
          <SportProgramsList onOpenDetail={setSelectedProgramId} />
        ))}

      {tab === "logs" && <LogsTab />}

      {tab === "stats" && <SportStatsView />}
    </div>
  );
}
