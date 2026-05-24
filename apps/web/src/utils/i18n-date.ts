import i18n from "@/configs/i18n";
import { useTranslation } from "react-i18next";

const LOCALE_MAP: Record<string, string> = {
  tr: "tr-TR",
  en: "en-US",
};

export function getDateLocale(): string {
  const lang = (i18n.language ?? "en").split("-")[0];
  return LOCALE_MAP[lang] ?? "en-US";
}

export function formatDate(
  value: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  return new Date(value).toLocaleDateString(getDateLocale(), opts);
}

export function formatTime(
  value: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  return new Date(value).toLocaleTimeString(getDateLocale(), opts);
}

export function formatDateTime(
  value: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  return new Date(value).toLocaleString(getDateLocale(), opts);
}

export function formatMonthShort(value: Date | string | number): string {
  return new Date(value).toLocaleDateString(getDateLocale(), { month: "short" });
}

export function formatWeekdayDayMonth(value: Date | string | number): string {
  return new Date(value).toLocaleDateString(getDateLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Hook variant — re-renders on language change. */
export function useFormatters() {
  useTranslation();
  return {
    formatDate,
    formatTime,
    formatDateTime,
    formatMonthShort,
    formatWeekdayDayMonth,
    getDateLocale,
  };
}
