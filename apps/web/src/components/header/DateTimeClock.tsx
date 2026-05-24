"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/utils/i18n-date";

export default function DateTimeClock() {
  // Subscribe to language changes so format follows the active locale.
  useTranslation();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const tz = "Europe/Istanbul";
  const locale = getDateLocale();

  const time = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);

  return (
    <div className="hidden sm:flex flex-col items-end leading-tight select-none">
      <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
        {time}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{date}</span>
    </div>
  );
}
