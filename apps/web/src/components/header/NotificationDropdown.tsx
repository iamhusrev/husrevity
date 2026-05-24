"use client";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { Dropdown } from "../dropdown/Dropdown";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/hooks/useNotifications";
import type { NotificationResponse } from "@/types/notification/notification";

/**
 * Bell + dropdown that mirrors the central `notification` table.
 *
 * - Badge: pulse dot only when unread > 0 (no badge while empty).
 * - List: most-recent first; unread rows get a left amber stripe.
 * - Click a row → mark read + navigate to its deepLink.
 * - "Tümünü okundu" zeroes the badge without clearing the list.
 *
 * All states handled (loading skeleton, empty, error). Husrev tokens only.
 */
export default function NotificationDropdown() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const { data: countData } = useUnreadNotificationCount();
  const unread = countData ?? 0;

  const closeDropdown = useCallback(() => setIsOpen(false), []);
  const toggleDropdown = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("notifications.title", "Bildirimler")}
        onClick={toggleDropdown}
        className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber focus-visible:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        {unread > 0 && (
          <span
            aria-label={t("notifications.unreadCount", { count: unread, defaultValue: "{{count}} okunmamış" }) as string}
            className="absolute right-0 top-0.5 z-10 flex h-2 w-2 rounded-full bg-husrev-amber"
          >
            <span className="absolute inline-flex w-full h-full bg-husrev-amber rounded-full opacity-75 motion-safe:animate-ping motion-reduce:animate-none" />
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-60 mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-husrev-sand bg-white p-3 shadow-card-warm dark:border-white/[0.06] dark:bg-husrev-shadow sm:w-[361px] lg:right-0"
      >
        <DropdownHeader
          unread={unread}
          onClose={closeDropdown}
          title={t("notifications.title", "Bildirimler")}
          markAllLabel={t("notifications.markAllRead", "Tümünü okundu işaretle")}
        />

        <Body locale={i18n.language} onClick={(n) => {
          closeDropdown();
          if (n.deepLink) router.push(n.deepLink);
        }} />
      </Dropdown>
    </div>
  );
}

function DropdownHeader({
  unread,
  onClose,
  title,
  markAllLabel,
}: {
  unread: number;
  onClose: () => void;
  title: string;
  markAllLabel: string;
}) {
  const markAll = useMarkAllNotificationsRead();
  return (
    <div className="flex items-center justify-between pb-3 mb-3 border-b border-husrev-sand/70 dark:border-white/[0.06]">
      <div className="flex items-baseline gap-2">
        <h5 className="text-lg font-semibold text-husrev-ink dark:text-husrev-cream">
          {title}
        </h5>
        {unread > 0 && (
          <span className="husrev-pill text-husrev-amber">
            {unread}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending || unread === 0}
          className="text-xs text-husrev-ember hover:underline disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber focus-visible:ring-offset-1 rounded"
        >
          {markAllLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber rounded-full"
        >
          <svg
            className="fill-current"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Body({
  locale,
  onClick,
}: {
  locale: string;
  onClick: (n: NotificationResponse) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useNotifications({ limit: 30 });
  const markRead = useMarkNotificationRead();

  if (isLoading) {
    return (
      <ul className="flex flex-col gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="h-14 rounded-lg bg-husrev-sand/50 motion-safe:animate-pulse motion-reduce:opacity-60"
          />
        ))}
      </ul>
    );
  }
  if (isError) {
    return (
      <div className="text-sm text-error-500 px-3 py-6 text-center">
        {t("notifications.error", "Bildirimler yüklenemedi.")}
      </div>
    );
  }
  const items = data ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
        <div className="husrev-kicker text-husrev-amber">
          {t("notifications.empty.kicker", "Sessizlik")}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("notifications.empty.body", "Şu an gösterilecek bir bildirim yok.")}
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => {
              if (!n.readAt) markRead.mutate(n.id);
              onClick(n);
            }}
            className={`group relative w-full text-left flex gap-3 rounded-lg border-b border-husrev-sand/40 p-3 transition-colors hover:bg-husrev-cream/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:border-white/[0.04] dark:hover:bg-white/[0.04] ${
              n.readAt ? "opacity-80" : ""
            }`}
          >
            {!n.readAt && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-husrev-amber"
              />
            )}
            <span className="block min-w-0 flex-1">
              <span className="mb-0.5 block text-sm font-medium text-husrev-ink dark:text-husrev-cream truncate">
                {n.title}
              </span>
              {n.body && (
                <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400 line-clamp-2 whitespace-pre-line">
                  {n.body}
                </span>
              )}
              <span className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="husrev-pill">{t(`notifications.kind.${n.kind}`, n.kind)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRelative(n.scheduledAt, locale)}</span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60_000);
  if (Math.abs(min) < 1) return locale.startsWith("tr") ? "az önce" : "just now";
  const rtf = new Intl.RelativeTimeFormat(locale || "tr", { numeric: "auto" });
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, "hour");
  const day = Math.round(hr / 24);
  return rtf.format(-day, "day");
}
