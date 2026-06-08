"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

// Layout effect on the client, plain effect on the server (avoids the SSR
// "useLayoutEffect does nothing on the server" warning for this client tree).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { useTranslation } from "react-i18next";
import {
  BiCalendar,
  BiChevronLeft,
  BiChevronRight,
  BiX,
} from "react-icons/bi";
import { getDateLocale } from "@/utils/i18n-date";

export type DateTimePickerMode = "datetime" | "date";

interface DateTimePickerProps {
  /** ISO string or null. */
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  mode?: DateTimePickerMode;
  /** ISO lower bound — days before this are disabled. */
  min?: string | null;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Show a clear (×) affordance and a "Temizle" footer action. */
  clearable?: boolean;
  className?: string;
}

const MINUTE_STEP = 5;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Monday-start weekday index (0=Mon … 6=Sun) for a date. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Build the 42-cell (6-week) grid for the month containing `cursor`. */
function buildMonthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = mondayIndex(first);
  const start = new Date(first);
  start.setDate(1 - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Localized short weekday names, Monday-first. */
function weekdayLabels(locale: string): string[] {
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i);
    return d.toLocaleDateString(locale, { weekday: "short" });
  });
}

export default function DateTimePicker({
  value,
  onChange,
  mode = "datetime",
  min,
  id,
  placeholder,
  disabled,
  clearable = true,
  className,
}: DateTimePickerProps) {
  const { t } = useTranslation();
  const reactId = useId();
  const fieldId = id ?? reactId;
  const locale = getDateLocale();

  const selected = useMemo(() => (value ? new Date(value) : null), [value]);
  const minDay = useMemo(() => (min ? startOfDay(new Date(min)) : null), [min]);

  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [cursor, setCursor] = useState<Date>(() =>
    selected ? new Date(selected) : new Date(),
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  // Track viewport size → popover (desktop) vs bottom-sheet (mobile).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // When opening, sync the month cursor to the current value.
  useEffect(() => {
    if (open) setCursor(selected ? new Date(selected) : new Date());
  }, [open, selected]);

  // Anchor the popover to the trigger (it must open *at the click point*, not
  // wherever the viewport has room). Open directly below by default, flip above
  // only when below can't fit the panel and above has more room. When the
  // chosen side is shorter than the panel, cap its height to that side and let
  // it scroll internally — so it always hugs the trigger and never overflows.
  const place = useCallback(() => {
    if (isMobile || !triggerRef.current) return;
    const gap = 6; // breathing room between trigger and panel
    const margin = 8; // min distance from the viewport edges
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = triggerRef.current.getBoundingClientRect();
    const width = 320;

    // Natural (unclamped) panel height, so we know if it fits.
    const panelH = popoverRef.current?.scrollHeight ?? 380;
    const roomBelow = vh - r.bottom - gap - margin;
    const roomAbove = r.top - gap - margin;

    const openAbove = panelH > roomBelow && roomAbove > roomBelow;
    const maxHeight = Math.min(panelH, openAbove ? roomAbove : roomBelow);
    const top = openAbove ? r.top - gap - maxHeight : r.bottom + gap;

    let left = r.left;
    if (left + width > vw - margin) left = vw - width - margin;
    if (left < margin) left = margin;

    setCoords({ top, left, width, maxHeight });
  }, [isMobile]);

  // Measure + position BEFORE paint so the popover never flashes at a stale /
  // unmeasured spot on first open (it used to drop to the bottom of the screen).
  // Reset coords on close so every open re-measures from a clean, hidden state.
  useIsoLayoutEffect(() => {
    if (!open || isMobile) {
      setCoords(null);
      return;
    }
    place();
  }, [open, isMobile, place, cursor]);

  useEffect(() => {
    if (!open || isMobile) return;
    const handler = () => place();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, isMobile, place]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isDayDisabled = (d: Date) => (minDay ? startOfDay(d) < minDay : false);

  const commitDay = (day: Date) => {
    if (isDayDisabled(day)) return;
    const base = selected ?? new Date();
    const next =
      mode === "date"
        ? startOfDay(day)
        : new Date(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
            selected ? base.getHours() : 9,
            selected ? base.getMinutes() : 0,
            0,
            0,
          );
    onChange(next.toISOString());
    if (mode === "date") setOpen(false);
  };

  const commitTime = (hours: number, minutes: number) => {
    const base = selected ?? cursor;
    const next = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      hours,
      minutes,
      0,
      0,
    );
    onChange(next.toISOString());
  };

  const triggerLabel = selected
    ? selected.toLocaleString(
        locale,
        mode === "date"
          ? { day: "2-digit", month: "short", year: "numeric" }
          : {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            },
      )
    : null;

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
  const today = new Date();

  const onDayKeyDown = (e: React.KeyboardEvent, day: Date) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in deltas) {
      e.preventDefault();
      const next = new Date(day);
      next.setDate(day.getDate() + deltas[e.key]);
      setCursor(next);
      // Focus the matching cell after re-render.
      requestAnimationFrame(() => {
        popoverRef.current
          ?.querySelector<HTMLButtonElement>(`[data-day="${next.toDateString()}"]`)
          ?.focus();
      });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commitDay(day);
    }
  };

  const panel = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal={isMobile ? "true" : undefined}
      aria-label={t("datepicker.label", "Tarih seç")}
      className={
        isMobile
          ? "fixed inset-x-0 bottom-0 z-[100002] mx-auto w-full max-w-md rounded-t-3xl husrev-modal grain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] motion-safe:animate-[husrev-sheet_.2s_ease-out]"
          : "fixed z-[100002] rounded-2xl husrev-modal grain p-3"
      }
      style={
        isMobile
          ? undefined
          : {
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              width: 320,
              // Cap to the room on the chosen side so it hugs the trigger and
              // scrolls internally instead of overflowing. While measuring
              // (coords null) leave it unclamped so scrollHeight is the natural height.
              maxHeight: coords ? coords.maxHeight : undefined,
              overflowY: "auto",
              // Laid out (measurable) but invisible until placed — no first-open flash.
              visibility: coords ? undefined : "hidden",
            }
      }
    >
      {isMobile && (
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-husrev-sand dark:bg-white/15" />
      )}

      {/* Month navigation */}
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          aria-label={t("datepicker.prevMonth", "Önceki ay")}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-husrev-ink transition hover:bg-husrev-sand/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-husrev-cream dark:hover:bg-white/[0.06]"
        >
          <BiChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold capitalize text-husrev-ink dark:text-husrev-cream">
          {cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          aria-label={t("datepicker.nextMonth", "Sonraki ay")}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-husrev-ink transition hover:bg-husrev-sand/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-husrev-cream dark:hover:bg-white/[0.06]"
        >
          <BiChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 px-1">
        {weekdays.map((w) => (
          <div
            key={w}
            className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5 px-1">
        {grid.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isSel = selected ? sameDay(day, selected) : false;
          const isToday = sameDay(day, today);
          const dis = isDayDisabled(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              data-day={day.toDateString()}
              tabIndex={isSel || (!selected && isToday) ? 0 : -1}
              disabled={dis}
              onClick={() => commitDay(day)}
              onKeyDown={(e) => onDayKeyDown(e, day)}
              className={[
                "relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber",
                dis
                  ? "cursor-not-allowed text-gray-300 dark:text-white/20"
                  : isSel
                    ? "bg-husrev-ember font-semibold text-husrev-cream"
                    : inMonth
                      ? "text-husrev-ink hover:bg-husrev-sand/50 dark:text-husrev-cream dark:hover:bg-white/[0.06]"
                      : "text-gray-400 hover:bg-husrev-sand/40 dark:text-white/30",
              ].join(" ")}
            >
              {day.getDate()}
              {isToday && !isSel && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-husrev-amber" />
              )}
            </button>
          );
        })}
      </div>

      {/* Time selection */}
      {mode === "datetime" && (
        <div className="mt-3 border-t border-husrev-sand/60 pt-3 dark:border-white/[0.06]">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("datepicker.time", "Saat")}
            </span>
            <div className="flex gap-1">
              {[
                [9, 0],
                [12, 0],
                [18, 0],
              ].map(([h, m]) => (
                <button
                  key={`${h}:${m}`}
                  type="button"
                  onClick={() => commitTime(h, m)}
                  className="rounded-full bg-husrev-sand/50 px-2 py-0.5 text-[11px] font-medium text-gray-700 transition hover:bg-husrev-amber/15 dark:bg-white/[0.06] dark:text-gray-300"
                >
                  {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <TimeColumn
              label={t("datepicker.hour", "Saat")}
              values={Array.from({ length: 24 }, (_, i) => i)}
              selected={selected ? selected.getHours() : null}
              onSelect={(h) => commitTime(h, selected ? selected.getMinutes() : 0)}
              open={open}
            />
            <TimeColumn
              label={t("datepicker.minute", "Dakika")}
              values={Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP)}
              selected={
                selected ? Math.round(selected.getMinutes() / MINUTE_STEP) * MINUTE_STEP : null
              }
              onSelect={(m) => commitTime(selected ? selected.getHours() : 9, m)}
              open={open}
            />
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => commitDay(new Date())}
          className="text-xs font-medium text-husrev-ember hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber rounded"
        >
          {t("common.today", "Bugün")}
        </button>
        <div className="flex items-center gap-2">
          {clearable && selected && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="text-xs font-medium text-gray-500 hover:text-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber rounded dark:text-gray-400"
            >
              {t("common.clear", "Temizle")}
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="husrev-btn h-8 px-3 text-xs">
            {t("common.done", "Tamam")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={fieldId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={[
          "husrev-input flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
          className ?? "",
        ].join(" ")}
      >
        <BiCalendar className="h-4 w-4 flex-none text-husrev-ember/70 dark:text-husrev-amber/70" />
        <span
          className={
            triggerLabel
              ? "flex-1 truncate text-husrev-ink dark:text-husrev-cream"
              : "flex-1 truncate text-gray-400 dark:text-gray-500"
          }
        >
          {triggerLabel ?? placeholder ?? t("datepicker.placeholder", "Tarih seç")}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={t("common.clear", "Temizle")}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="flex-none rounded-full p-0.5 text-gray-400 transition hover:bg-husrev-sand/60 hover:text-husrev-ember dark:hover:bg-white/[0.08]"
          >
            <BiX className="h-4 w-4" />
          </span>
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {isMobile && (
              <div
                className="fixed inset-0 z-[100001] bg-husrev-ink/40 backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />
            )}
            {panel}
          </>,
          document.body,
        )}
    </>
  );
}

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
  open,
}: {
  label: string;
  values: number[];
  selected: number | null;
  onSelect: (v: number) => void;
  open: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll the selected value into view when the picker opens.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>('[data-active="true"]')
        ?.scrollIntoView({ block: "center" });
    });
  }, [open, selected]);

  return (
    <div className="flex-1">
      <div className="sr-only">{label}</div>
      <div
        ref={listRef}
        className="h-28 overflow-y-auto rounded-xl bg-husrev-cream/40 p-1 ring-1 ring-husrev-sand/60 dark:bg-white/[0.03] dark:ring-white/[0.06]"
      >
        {values.map((v) => {
          const active = selected === v;
          return (
            <button
              key={v}
              type="button"
              data-active={active}
              onClick={() => onSelect(v)}
              className={[
                "block w-full rounded-lg py-1.5 text-center text-sm tabular-nums transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber",
                active
                  ? "bg-husrev-ember font-semibold text-husrev-cream"
                  : "text-husrev-ink hover:bg-husrev-sand/60 dark:text-husrev-cream dark:hover:bg-white/[0.06]",
              ].join(" ")}
            >
              {String(v).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
