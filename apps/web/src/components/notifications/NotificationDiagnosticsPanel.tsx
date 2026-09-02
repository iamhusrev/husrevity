"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiBell, BiSend } from "react-icons/bi";
import {
  useNotificationDiagnostics,
  useResyncNotifications,
  useSendTestNotification,
} from "@/hooks/useNotifications";
import {
  useDisablePush,
  useEnablePush,
  usePushStatus,
} from "@/hooks/usePush";
import { pushService } from "@/services/push-service";
import { alertStore } from "@/stores/alert-store";
import { TestNotificationResult } from "@/types/notification/notification";
import { parseAxiosError } from "@/utils/handleError";

/**
 * Shows browser push controls alongside server-side notification diagnostics
 * and provides an end-to-end test-fire action for the current user.
 */
export default function NotificationDiagnosticsPanel() {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const { status, refresh } = usePushStatus();
  const { enable, loading: enabling } = useEnablePush();
  const { disable, loading: disabling } = useDisablePush();
  const diagnostics = useNotificationDiagnostics();
  const sendTest = useSendTestNotification();
  const resync = useResyncNotifications();
  const [preferenceEnabled, setPreferenceEnabled] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setPermission(pushService.permissionState());
    setPreferenceEnabled(pushService.preferenceEnabled());

    const ua = navigator.userAgent;
    const isIosSafari =
      /iPhone|iPad|iPod/.test(ua) &&
      /Safari/.test(ua) &&
      !/CriOS|FxiOS/.test(ua);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setShowIosHint(isIosSafari && !standalone);
  }, []);

  const pushEnabled =
    status.state === "granted-subscribed" && preferenceEnabled;
  const pushUnavailable =
    status.state === "denied" || status.state === "unsupported";
  const pushLoading = status.state === "loading" || enabling || disabling;

  const togglePush = async () => {
    if (pushLoading || pushUnavailable) return;
    try {
      if (pushEnabled) {
        await disable();
        setPreferenceEnabled(false);
      } else {
        const result = await enable();
        setPermission(pushService.permissionState());
        setPreferenceEnabled(pushService.preferenceEnabled());
        if (!result.ok) {
          showAlert({
            title: t("settings.notifications.diagnostics.title"),
            message:
              result.reason === "denied"
                ? t("settings.notifications.push.denied")
                : result.reason === "unsupported"
                  ? t("settings.notifications.push.unsupported")
                  : result.reason ?? t("common.error"),
            type: "error",
            position: "top-center",
          });
        }
      }
      await refresh();
      await diagnostics.refetch();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const describeResult = (result: TestNotificationResult): string => {
    const push = result.pushSucceeded
      ? t("settings.notifications.diagnostics.resultPushSucceeded")
      : result.pushAttempted
        ? t("settings.notifications.diagnostics.resultPushFailed")
        : !diagnostics.data?.vapidConfigured
          ? t("settings.notifications.diagnostics.resultPushVapidMissing")
          : diagnostics.data.subscriptionCount === 0
            ? t("settings.notifications.diagnostics.resultPushNoDevice")
            : t("settings.notifications.diagnostics.resultPushSkipped");
    const email = result.emailSucceeded
      ? t("settings.notifications.diagnostics.resultMailSucceeded")
      : result.emailAttempted
        ? t("settings.notifications.diagnostics.resultMailFailed")
        : !diagnostics.data?.mailConfigured
          ? t("settings.notifications.diagnostics.resultMailSmtpMissing")
          : !diagnostics.data.emailOptIn
            ? t("settings.notifications.diagnostics.resultMailOptOut")
            : t("settings.notifications.diagnostics.resultMailSkipped");
    return t("settings.notifications.diagnostics.testResult", { push, email });
  };

  const testNotification = async () => {
    try {
      const response = await sendTest.mutateAsync();
      const result = response.data;
      showAlert({
        title: t("settings.notifications.diagnostics.title"),
        message: describeResult(result),
        type:
          result.pushSucceeded || result.emailSucceeded ? "success" : "warning",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const resyncNotifications = async () => {
    try {
      const response = await resync.mutateAsync();
      showAlert({
        title: t("settings.notifications.diagnostics.title"),
        message: t("settings.notifications.diagnostics.resyncResult", {
          count: response.data.total,
        }),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const rows = diagnostics.data
    ? [
        [
          t("settings.notifications.diagnostics.vapid"),
          diagnostics.data.vapidConfigured
            ? t("settings.notifications.diagnostics.vapidConfigured")
            : t("settings.notifications.diagnostics.vapidUnconfigured"),
        ],
        [
          t("settings.notifications.diagnostics.mail"),
          diagnostics.data.mailConfigured
            ? t("settings.notifications.diagnostics.mailConfigured")
            : t("settings.notifications.diagnostics.mailUnconfigured"),
        ],
        [
          t("settings.notifications.diagnostics.device"),
          diagnostics.data.subscriptionCount > 0
            ? t("settings.notifications.diagnostics.deviceRegistered")
            : t("settings.notifications.diagnostics.deviceUnregistered"),
        ],
        [
          t("settings.notifications.diagnostics.pending"),
          diagnostics.data.pendingCount,
        ],
        [
          t("settings.notifications.diagnostics.dispatched24h"),
          diagnostics.data.dispatchedLast24h,
        ],
      ]
    : [];

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-6 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-4 flex items-center justify-between">
        <div className="space-y-1">
          <span className="husrev-kicker text-gray-400 dark:text-gray-500">
            {t("settings.notifications.kicker")}
          </span>
          <h3 className="text-base font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("settings.notifications.diagnostics.title")}
          </h3>
        </div>
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
          <BiBell size={18} />
        </div>
      </header>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-husrev-sand/70 bg-husrev-cream/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
            {t("settings.notifications.push.label")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {status.state === "denied"
              ? t("settings.notifications.push.denied")
              : status.state === "unsupported" || permission === "unsupported"
                ? t("settings.notifications.push.unsupported")
                : t("settings.notifications.push.description")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={pushEnabled}
          aria-label={t("settings.notifications.push.label")}
          onClick={togglePush}
          disabled={pushLoading || pushUnavailable}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            pushEnabled
              ? "bg-husrev-ember"
              : "bg-husrev-sand dark:bg-white/[0.12]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              pushEnabled ? "translate-x-[1.375rem]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {showIosHint && (
        <p className="mt-3 rounded-xl bg-husrev-amber/10 px-4 py-3 text-xs leading-relaxed text-husrev-ember dark:text-husrev-amber">
          {t("settings.notifications.ios.hint")}
        </p>
      )}

      <dl className="mt-4 divide-y divide-husrev-sand/60 rounded-xl border border-husrev-sand/70 px-4 dark:divide-white/[0.06] dark:border-white/[0.06]">
        {diagnostics.isPending ? (
          <div className="py-4 text-sm text-gray-400">{t("common.loading")}</div>
        ) : (
          rows.map(([label, value]) => (
            <div key={String(label)} className="flex items-center justify-between gap-4 py-3 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="font-medium text-husrev-ink dark:text-husrev-cream">
                {value}
              </dd>
            </div>
          ))
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={testNotification}
          disabled={sendTest.isPending}
          className="husrev-btn inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <BiSend size={16} />
          {sendTest.isPending
            ? t("settings.notifications.diagnostics.testSending")
            : t("settings.notifications.diagnostics.testCta")}
        </button>
        <button
          type="button"
          onClick={resyncNotifications}
          disabled={resync.isPending}
          className="husrev-btn-ghost inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <BiBell size={16} />
          {resync.isPending
            ? t("settings.notifications.diagnostics.resyncSending")
            : t("settings.notifications.diagnostics.resyncCta")}
        </button>
      </div>
    </section>
  );
}
