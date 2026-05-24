"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEnablePush, usePushStatus } from "@/hooks/usePush";

const DISMISSED_KEY = "husrevity.pushPromptDismissed";

/**
 * One-time, low-friction nudge to enable Web Push. Lives inside the (app)
 * layout so authenticated pages can opt-in without bouncing to settings.
 *
 * Visibility rules: shown only when the browser supports push AND permission
 * is still "default" AND the user hasn't dismissed it before. After accept
 * the prompt naturally hides (status flips to granted-subscribed). After
 * decline we set the dismissed flag so we don't badger.
 *
 * Husrev amber surface, soft inset shadow, focus-visible rings.
 */
export default function NotificationPermissionPrompt() {
  const { t } = useTranslation();
  const { status, refresh } = usePushStatus();
  const { enable, loading } = useEnablePush();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  if (
    dismissed ||
    status.state !== "default" // hidden when unsupported / denied / already granted
  ) {
    return null;
  }

  const onDismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const onEnable = async () => {
    const res = await enable();
    await refresh();
    if (res.ok) onDismiss(); // hide regardless after success
  };

  return (
    <div
      role="region"
      aria-label={t("notifications.permission.title", "Bildirim izni")}
      className="relative mx-auto mb-4 flex flex-col gap-3 rounded-2xl border border-husrev-amber/40 bg-husrev-cream/70 px-4 py-3 shadow-card-warm md:flex-row md:items-center md:justify-between dark:bg-husrev-shadow/60 dark:border-husrev-amber/30"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-husrev-amber/15 text-husrev-amber"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248Z" />
          </svg>
        </span>
        <div className="flex flex-col">
          <div className="husrev-kicker text-husrev-amber">
            {t("notifications.permission.kicker", "Yeni özellik")}
          </div>
          <p className="text-sm text-husrev-ink dark:text-husrev-cream">
            {t(
              "notifications.permission.body",
              "Zamanı gelen anımsatıcılar ve takvim olayları için anlık bildirim al — sekme kapalı olsa bile.",
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end md:self-auto">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-3 py-1.5 text-sm text-gray-600 transition hover:text-husrev-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-gray-400 dark:hover:text-husrev-cream"
        >
          {t("notifications.permission.later", "Şimdi değil")}
        </button>
        <button
          type="button"
          onClick={onEnable}
          disabled={loading}
          className="husrev-btn disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading
            ? t("notifications.permission.enabling", "Açılıyor…")
            : t("notifications.permission.enable", "Bildirimleri aç")}
        </button>
      </div>
    </div>
  );
}
