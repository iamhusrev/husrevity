"use client";

/**
 * Dashboard's "Bugün ne yapsam?" focal widget.
 *
 * Design intent (one strong idea): an actionable counterpart to the hero
 * — warm amber surface with ember accents, a small but expressive type
 * scale (instrument-serif for the question, sans for content), and 1–3
 * suggestion cards keyed to a Mode (Görev/Hobi) + Count (1·3) toggle.
 *
 * Cost discipline: nothing is fetched on mount. The user triggers each call
 * explicitly; the last result is kept for the browser session, keyed by
 * user, mode, count and active block, so revisiting the dashboard does not
 * re-spend. The backend also caches identical context for 5 min.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiRefresh } from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";
import { useAiSuggestions } from "@/hooks/useAi";
import { useAuth } from "@/providers/AuthProvider";
import type {
  SuggestionItem,
  SuggestionKind,
  SuggestionMode,
  SuggestionSourceRef,
} from "@/types/ai/suggestion";

type Count = 1 | 3;

const KIND_BADGE: Record<SuggestionKind, { dot: string; text: string; tone: string }> = {
  task: {
    dot: "bg-husrev-ember",
    text: "text-husrev-ember dark:text-husrev-amber",
    tone: "ring-husrev-amber/40 bg-husrev-amber/10",
  },
  hobby: {
    dot: "bg-husrev-moss",
    text: "text-husrev-moss",
    tone: "ring-husrev-moss/30 bg-husrev-moss/10",
  },
  mixed: {
    dot: "bg-husrev-ink dark:bg-husrev-cream",
    text: "text-husrev-ink dark:text-husrev-cream",
    tone: "ring-husrev-ink/15 dark:ring-white/15 bg-husrev-sand/40 dark:bg-white/5",
  },
};

function sourceHref(ref: SuggestionSourceRef): string {
  switch (ref.type) {
    case "note":
      return `/notes/${ref.id}`;
    case "reminder":
      return `/reminders`;
    case "task":
    case "project":
      return `/projects`;
  }
}

const SESSION_CACHE_KEY = "husrevity:today_suggestions_cache";

type SuggestionContext = {
  mode: SuggestionMode;
  count: Count;
  activeBlockTitle: string | null;
};

type SuggestionCacheEntry = SuggestionContext & { items: SuggestionItem[] };

/** Scoped per user so a second account in the same tab never sees another user's suggestions. */
function cacheKeyFor(userId: unknown): string {
  return `${SESSION_CACHE_KEY}:${userId ?? "anon"}`;
}

function sameContext(a: SuggestionContext, b: SuggestionContext): boolean {
  return a.mode === b.mode && a.count === b.count && a.activeBlockTitle === b.activeBlockTitle;
}

function readSessionCache(key: string): SuggestionCacheEntry | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.items) &&
      typeof parsed.mode === "string" &&
      typeof parsed.count === "number"
    ) {
      return {
        mode: parsed.mode,
        count: parsed.count,
        activeBlockTitle: parsed.activeBlockTitle ?? null,
        items: parsed.items,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, entry: SuggestionCacheEntry): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore quota or private browsing access restrictions.
  }
}

export default function TodaySuggestionsCard({
  activeBlockTitle,
}: {
  /** Title of the currently-active Evkat block (from useToday()), if any — nudges task-mode suggestions toward that context. */
  activeBlockTitle?: string;
} = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mode, setMode] = useState<SuggestionMode>("task");
  const [count, setCount] = useState<Count>(3);
  const storageKey = cacheKeyFor(user?.id);
  const [cache, setCache] = useState<SuggestionCacheEntry | null>(() =>
    readSessionCache(storageKey),
  );

  const suggest = useAiSuggestions();
  const requested: SuggestionContext = { mode, count, activeBlockTitle: activeBlockTitle ?? null };
  const suggestNow = () => {
    suggest.mutate(
      { mode, count, activeBlockTitle },
      {
        onSuccess: (res) => {
          const entry: SuggestionCacheEntry = { ...requested, items: res?.data ?? [] };
          setCache(entry);
          writeSessionCache(storageKey, entry);
        },
      },
    );
  };

  // A cached result is only shown for the mode/count/block it was generated for.
  const items: SuggestionItem[] = cache && sameContext(cache, requested) ? cache.items : [];
  const isLoading = suggest.isPending;
  const isError = suggest.isError;

  // Skeleton placeholders match the requested count for a stable layout.
  const skeletonKeys = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  const errorMessage = suggest.error
    ? (() => {
        const e = suggest.error as Error & { response?: { data?: { message?: string } } };
        return e.response?.data?.message ?? e.message ?? "";
      })()
    : "";
  const looksUnconfigured = /not configured|GOOGLE_GEMINI_API_KEY/i.test(errorMessage);

  return (
    <section
      aria-labelledby="today-suggestions-title"
      className="relative overflow-hidden rounded-3xl ring-1 ring-husrev-amber/30 bg-gradient-to-br from-husrev-cream via-white to-husrev-amber/10 p-6 md:p-7 shadow-card-warm dark:from-husrev-shadow dark:via-husrev-shadow dark:to-husrev-amber/[0.06] dark:ring-husrev-amber/20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-husrev-amber/15 blur-3xl dark:bg-husrev-amber/10"
      />

      {/* Header row */}
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80 inline-flex items-center gap-1.5">
            <HiSparkles size={12} aria-hidden /> {t("dashboard.today.kicker")}
          </span>
          <h3
            id="today-suggestions-title"
            className="text-[22px] md:text-2xl leading-tight tracking-tight text-husrev-ink dark:text-husrev-cream"
          >
            <span className="font-instrument-serif italic font-normal">
              {t("dashboard.today.title")}
            </span>
          </h3>
          <p className="max-w-md text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            {t("dashboard.today.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode segmented control */}
          <div
            role="tablist"
            aria-label={t("dashboard.today.modeAria")}
            className="inline-flex rounded-full bg-white/70 p-1 ring-1 ring-husrev-sand backdrop-blur dark:bg-white/5 dark:ring-white/10"
          >
            {(["task", "hobby"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                    active
                      ? "bg-husrev-ember text-white shadow-sm dark:bg-husrev-amber dark:text-husrev-ink"
                      : "text-gray-600 hover:text-husrev-ember dark:text-gray-300 dark:hover:text-husrev-amber"
                  }`}
                >
                  {t(m === "task" ? "dashboard.today.modeTask" : "dashboard.today.modeHobby")}
                </button>
              );
            })}
          </div>

          {/* Count chips */}
          <div
            role="group"
            aria-label={t("dashboard.today.countAria")}
            className="inline-flex rounded-full bg-white/70 p-1 ring-1 ring-husrev-sand backdrop-blur dark:bg-white/5 dark:ring-white/10"
          >
            {([1, 3] as const).map((n) => {
              const active = count === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  aria-pressed={active}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                    active
                      ? "bg-husrev-ink text-husrev-cream dark:bg-husrev-cream dark:text-husrev-ink"
                      : "text-gray-600 hover:text-husrev-ink dark:text-gray-300 dark:hover:text-husrev-cream"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => suggestNow()}
            disabled={isLoading}
            aria-label={t("dashboard.today.refreshAria")}
            className="inline-flex items-center justify-center rounded-full bg-white/70 p-2 text-gray-600 ring-1 ring-husrev-sand backdrop-blur transition-colors duration-200 hover:text-husrev-ember hover:ring-husrev-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10 dark:hover:text-husrev-amber"
          >
            <BiRefresh
              size={16}
              className={isLoading ? "animate-spin motion-reduce:animate-none" : ""}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <div className="husrev-rule mt-5" />

      {/* Body */}
      <div className="relative mt-5">
        {isError ? (
          looksUnconfigured ? (
            <div className="rounded-2xl border border-dashed border-husrev-sand bg-white/50 p-5 text-center text-sm text-gray-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
              <p>{t("dashboard.today.unconfigured")}</p>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-husrev-ember/5 p-4 ring-1 ring-husrev-ember/20 dark:bg-husrev-amber/5 dark:ring-husrev-amber/20">
              <p className="text-sm text-husrev-ember dark:text-husrev-amber">
                {t("dashboard.today.error")}
              </p>
              <button
                type="button"
                onClick={() => suggestNow()}
                className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-husrev-ember underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-husrev-amber"
              >
                {t("dashboard.today.retry")}
              </button>
            </div>
          )
        ) : isLoading && items.length === 0 ? (
          <div
            className={`grid gap-3 ${count === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}
          >
            {skeletonKeys.map((k) => (
              <div
                key={k}
                className="animate-pulse rounded-2xl bg-white/60 p-4 ring-1 ring-husrev-sand motion-reduce:animate-none dark:bg-white/[0.03] dark:ring-white/10"
              >
                <div className="h-3 w-16 rounded-full bg-husrev-sand/80 dark:bg-white/10" />
                <div className="mt-3 h-4 w-4/5 rounded bg-husrev-sand/80 dark:bg-white/10" />
                <div className="mt-2 h-3 w-3/4 rounded bg-husrev-sand/60 dark:bg-white/[0.08]" />
                <div className="mt-1.5 h-3 w-2/3 rounded bg-husrev-sand/60 dark:bg-white/[0.08]" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-husrev-sand bg-white/50 p-6 text-center text-sm text-gray-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
            <p>{t("dashboard.today.empty")}</p>
            <button
              type="button"
              onClick={() => suggestNow()}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-husrev-ember underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-husrev-amber"
            >
              <BiRefresh size={12} aria-hidden /> {t("dashboard.today.retry")}
            </button>
          </div>
        ) : (
          <ul
            className={`grid gap-3 ${count === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}
          >
            {items.map((s, i) => {
              const badge = KIND_BADGE[s.kind] ?? KIND_BADGE.mixed;
              return (
                <li
                  key={`${i}-${s.title}`}
                  className="group relative flex flex-col rounded-2xl bg-white/80 p-4 ring-1 ring-husrev-sand transition-shadow duration-200 hover:shadow-card-warm dark:bg-white/[0.03] dark:ring-white/10"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ring-1 ${badge.tone} ${badge.text}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden />
                      {s.sourceRef
                        ? t(`dashboard.today.source.${s.sourceRef.type}`)
                        : t(`dashboard.today.kind.${s.kind}`)}
                    </span>
                    {s.sourceRef && (
                      <Link
                        href={sourceHref(s.sourceRef)}
                        aria-label={t("dashboard.today.openSource")}
                        className="text-[10px] text-gray-400 underline-offset-2 transition-colors hover:text-husrev-ember hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:text-husrev-amber"
                      >
                        ↗
                      </Link>
                    )}
                  </div>

                  <p className="text-sm font-medium leading-snug text-husrev-ink dark:text-husrev-cream">
                    {s.title}
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                    {s.description}
                  </p>

                  {s.reasonShort && (
                    <p className="mt-3 border-t border-husrev-sand/70 pt-2 text-[11px] italic text-gray-500 dark:border-white/10 dark:text-gray-500">
                      — {s.reasonShort}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
