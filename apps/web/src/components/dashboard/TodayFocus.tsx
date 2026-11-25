"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiLinkExternal } from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";
import LinkifiedText from "@/components/ui/LinkifiedText";
import { useIstanbulToday } from "@/hooks/useIstanbulToday";
import { useLearningTopics, useToggleLearningItem } from "@/hooks/useLearning";
import { useRoutineSegments } from "@/hooks/useRoutine";
import { formatTime } from "@/utils/i18n-date";
import { linkLabel, toHref } from "@/utils/linkify";
import { formatMinuteRange } from "@/utils/today-board";
import { learningAgendaForDay, segmentFocus } from "@/utils/today-focus";

const CARD =
  "rounded-2xl bg-white p-5 shadow-card-warm ring-1 ring-husrev-sand/90 dark:bg-husrev-shadow dark:ring-white/[0.06]";
const LABEL =
  "text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400";

/** Re-renders once a minute so "now" moves on an idle tab. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The two things the dashboard should answer at a glance: which Evkat block am I in (and what
 * belongs to it), and which learning items are planned for today.
 */
export default function TodayFocus() {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const todayYmd = useIstanbulToday();
  const { data: segments = [] } = useRoutineSegments();
  const { data: topics = [] } = useLearningTopics();
  const toggle = useToggleLearningItem();

  const { current, next } = segmentFocus(segments, now);
  const agenda = learningAgendaForDay(topics, todayYmd);
  const allDay = t("today.board.allDay");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={CARD} aria-labelledby="focus-now">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="focus-now" className={LABEL}>
            {t("dashboard.focus.now")}
          </h2>
          <Link
            href="/evkat"
            className="text-xs text-gray-500 hover:text-husrev-ember dark:text-gray-400 dark:hover:text-husrev-amber"
          >
            {t("dashboard.focus.openEvkat")}
          </Link>
        </div>

        {current ? (
          <div className="mt-2">
            <p className="text-lg font-semibold text-husrev-ink dark:text-husrev-cream">
              {current.name}
              <span className="ml-2 text-sm font-normal tabular-nums text-gray-500 dark:text-gray-400">
                {formatMinuteRange(current.startMinute, current.endMinute, allDay)}
              </span>
            </p>
            {current.activities.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">{t("dashboard.focus.noActivities")}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {[...current.activities]
                  .sort((a, b) => a.position - b.position)
                  .map((a) => (
                    <li
                      key={a.id}
                      className="flex gap-2 text-sm leading-6 text-gray-700 dark:text-gray-200"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[10px] h-1.5 w-1.5 flex-none rounded-full bg-husrev-amber"
                      />
                      <span className="min-w-0 break-words">
                        <LinkifiedText text={a.text} />
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t("dashboard.focus.nothingNow")}
          </p>
        )}

        {next && (
          <p className="mt-4 border-t border-husrev-sand/70 pt-3 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
            {t("dashboard.focus.next")}:{" "}
            <span className="font-medium text-gray-700 dark:text-gray-200">{next.name}</span>{" "}
            <span className="tabular-nums">
              {formatMinuteRange(next.startMinute, next.endMinute, allDay)}
            </span>
          </p>
        )}
      </section>

      <section className={CARD} aria-labelledby="focus-study">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="focus-study" className={LABEL}>
            {t("dashboard.focus.studyToday")}
          </h2>
          <Link
            href="/learning"
            className="text-xs text-gray-500 hover:text-husrev-ember dark:text-gray-400 dark:hover:text-husrev-amber"
          >
            {t("dashboard.focus.openLearning")}
          </Link>
        </div>

        {agenda.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t("dashboard.focus.studyEmpty")}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {agenda.map(({ item, topicTitle }) => {
              const done = Boolean(item.completedAt);
              return (
                <li key={item.id} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggle.mutate(item.id)}
                    disabled={toggle.isPending}
                    aria-label={`${t(done ? "dashboard.focus.markUndone" : "dashboard.focus.markDone")}: ${item.text}`}
                    className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-gray-400 transition hover:text-brand-500 disabled:opacity-50"
                  >
                    {done ? (
                      <BsCheckCircleFill size={18} className="text-brand-500" />
                    ) : (
                      <BsCircle size={18} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm leading-6 ${
                        done
                          ? "text-gray-400 line-through dark:text-gray-500"
                          : "text-gray-800 dark:text-white/90"
                      }`}
                    >
                      {item.text}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      <span className="tabular-nums">{formatTime(item.reviewAt!)}</span>
                      {item.estimatedMinutes !== null && (
                        <span>{t("dashboard.focus.minutes", { count: item.estimatedMinutes })}</span>
                      )}
                      <span className="truncate">{topicTitle}</span>
                      {item.url && (
                        <a
                          href={toHref(item.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-600 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-700 dark:text-brand-400"
                        >
                          <BiLinkExternal aria-hidden="true" />
                          {linkLabel(item.url)}
                        </a>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
