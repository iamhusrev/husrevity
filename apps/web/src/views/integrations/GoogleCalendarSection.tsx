"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GOOGLE_STATUS_KEY,
  useGoogleCalendars,
  useGoogleStatus,
  useSaveGoogleSelection,
} from "@/hooks/useGoogleCalendars";
import { GoogleCalendarChoice, integrationsService } from "@/services/integrations-service";
import { alertStore } from "@/stores/alert-store";
import { showErrorAlert } from "@/utils/mutation-error";

const CARD =
  "rounded-3xl ring-1 ring-husrev-sand/90 bg-white/60 p-5 sm:p-6 dark:bg-husrev-shadow/60 dark:ring-white/[0.06]";
const BTN =
  "rounded-xl px-4 py-2 text-sm font-medium bg-husrev-ink text-husrev-cream hover:bg-husrev-ember disabled:opacity-50 dark:bg-husrev-cream dark:text-husrev-ink";
const BTN_GHOST =
  "rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-husrev-sand hover:bg-husrev-sand/40 disabled:opacity-50 dark:ring-white/10";

/** Fallback dot colour for a calendar Google reports without one. */
const NEUTRAL_DOT = "#9ca3af";

function isSelectable(c: GoogleCalendarChoice): boolean {
  return !c.managed && c.accessRole !== "freeBusyReader";
}

/**
 * Calendar picker of the new read-only Google Calendar model. Rendered only
 * when the API reports the model as available (`v2Enabled`) and Google is
 * connected, so with the feature off the Integrations page is unchanged.
 */
export default function GoogleCalendarSection() {
  const { t } = useTranslation();
  const { data: status } = useGoogleStatus();
  const visible = !!status && status.configured && status.connected && status.v2Enabled === true;
  const calendars = useGoogleCalendars(visible);
  // `null` = follow the saved selection; a Set = the user's unsaved edits.
  const [draft, setDraft] = useState<Set<string> | null>(null);

  const save = useSaveGoogleSelection({
    onSaved: () => {
      setDraft(null);
      alertStore.getState().show({
        title: t("integrations.googleCalendars.saved"),
        message: "",
        type: "success",
        position: "top-center",
      });
    },
  });
  const [confirmingNarrow, setConfirmingNarrow] = useState(false);
  const narrow = useMutation({
    mutationFn: integrationsService.googleNarrowUrl,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err) => {
      setConfirmingNarrow(false);
      showErrorAlert(err);
    },
  });
  const reconnect = useMutation({
    mutationFn: integrationsService.googleConnectUrl,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: showErrorAlert,
  });

  const qc = useQueryClient();
  const toggleWrite = useMutation({
    mutationFn: (enabled: boolean) => integrationsService.googleSetWrite(enabled),
    onSuccess: (result, requested) => {
      if (result.consentUrl) {
        // The extra permission is still missing: Google's consent screen decides.
        window.location.href = result.consentUrl;
        return;
      }
      qc.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY, exact: true });
      alertStore.getState().show({
        title: t(requested ? "integrations.googleWrite.enabledToast" : "integrations.googleWrite.disabledToast"),
        message: "",
        type: "success",
        position: "top-center",
      });
    },
    onError: showErrorAlert,
  });
  const migrate = useMutation({
    mutationFn: integrationsService.googleMigrateLegacy,
    onSuccess: (r) => {
      alertStore.getState().show({
        title:
          r.remaining > 0
            ? t("integrations.googleWrite.migratedPartial", { published: r.published, pending: r.remaining })
            : t("integrations.googleWrite.migrated", { published: r.published }),
        message: "",
        type: "success",
        position: "top-center",
      });
    },
    onError: showErrorAlert,
  });

  if (!visible || !status) return null;

  const list = calendars.data ?? [];
  const saved = new Set(list.filter((c) => c.selected && isSelectable(c)).map((c) => c.id));
  const current = draft ?? saved;
  const dirty = draft !== null && (draft.size !== saved.size || [...draft].some((id) => !saved.has(id)));

  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  };

  return (
    <section className={`${CARD} lg:col-span-2`}>
      <h2 className="text-lg font-semibold">{t("integrations.googleCalendars.title")}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("integrations.googleCalendars.note")}
      </p>

      {status.needsReconnect && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <p>{t("integrations.googleCalendars.needsReconnect")}</p>
          <button className={BTN_GHOST} disabled={reconnect.isPending} onClick={() => reconnect.mutate()}>
            {t("integrations.googleCalendars.reconnect")}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{t("integrations.googleCalendars.selectedCount", { count: status.selectedCount ?? 0 })}</span>
        <span>
          {status.lastSyncAt
            ? t("integrations.googleCalendars.lastSync", {
                time: new Date(status.lastSyncAt).toLocaleString(),
              })
            : t("integrations.googleCalendars.neverSynced")}
        </span>
        {status.lastError && (
          <span className="text-amber-600">
            {t("integrations.googleCalendars.lastError", { error: status.lastError })}
          </span>
        )}
      </div>

      {calendars.isPending ? (
        <p className="mt-4 text-sm text-gray-500">{t("integrations.googleCalendars.loading")}</p>
      ) : calendars.isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-600">{t("integrations.googleCalendars.loadError")}</p>
          <button className={BTN_GHOST} onClick={() => calendars.refetch()}>
            {t("integrations.googleCalendars.retry")}
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t("integrations.googleCalendars.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-husrev-sand/70 dark:divide-white/5">
          {list.map((c) => {
            const selectable = isSelectable(c);
            return (
              <li key={c.id}>
                <label className="flex items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectable && current.has(c.id)}
                    disabled={!selectable || save.isPending}
                    onChange={() => toggle(c.id)}
                  />
                  <span
                    data-testid={`color-dot-${c.id}`}
                    aria-hidden="true"
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: c.backgroundColor ?? NEUTRAL_DOT }}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.summary}</span>
                  {c.primary && (
                    <span className="rounded-full bg-husrev-sand/60 px-2 py-0.5 text-xs dark:bg-white/10">
                      {t("integrations.googleCalendars.primary")}
                    </span>
                  )}
                  {c.managed ? (
                    <span className="text-xs text-gray-500">{t("integrations.googleCalendars.managed")}</span>
                  ) : c.accessRole === "freeBusyReader" ? (
                    <span className="text-xs text-gray-500">{t("integrations.googleCalendars.freeBusy")}</span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {status.mode === "v2_read" && (
        <div className="mt-6 rounded-2xl ring-1 ring-husrev-sand/90 p-4 text-sm dark:ring-white/[0.06]">
          <h3 className="font-medium">{t("integrations.googleNarrow.title")}</h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            {t("integrations.googleNarrow.explain")}
          </p>
          {confirmingNarrow ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={BTN} disabled={narrow.isPending} onClick={() => narrow.mutate()}>
                {narrow.isPending
                  ? t("integrations.googleNarrow.working")
                  : t("integrations.googleNarrow.confirm")}
              </button>
              <button
                className={BTN_GHOST}
                disabled={narrow.isPending}
                onClick={() => setConfirmingNarrow(false)}
              >
                {t("integrations.googleNarrow.cancel")}
              </button>
            </div>
          ) : (
            <button className={`${BTN_GHOST} mt-3`} onClick={() => setConfirmingNarrow(true)}>
              {t("integrations.googleNarrow.action")}
            </button>
          )}
        </div>
      )}

      {status.mode === "v2_read" && (
        <p className="mt-4 text-xs text-gray-500">{t("integrations.googleWrite.needsNarrow")}</p>
      )}

      {status.mode === "narrowed" && (
        <div className="mt-6 rounded-2xl ring-1 ring-husrev-sand/90 p-4 text-sm dark:ring-white/[0.06]">
          <h3 className="font-medium">{t("integrations.googleWrite.title")}</h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            {t("integrations.googleWrite.explain")}
          </p>
          <label className="mt-3 flex items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={status.writeEnabled === true}
              disabled={toggleWrite.isPending}
              onChange={() => toggleWrite.mutate(status.writeEnabled !== true)}
            />
            <span>{t("integrations.googleWrite.toggle")}</span>
          </label>
          {status.writeEnabled === true && (
            <div className="mt-4 border-t border-husrev-sand/70 pt-4 dark:border-white/5">
              <p className="text-gray-500 dark:text-gray-400">
                {t("integrations.googleWrite.migrateExplain")}
              </p>
              <button
                className={`${BTN_GHOST} mt-3`}
                disabled={migrate.isPending}
                onClick={() => migrate.mutate()}
              >
                {migrate.isPending
                  ? t("integrations.googleWrite.migrating")
                  : t("integrations.googleWrite.migrateAction")}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <button
          className={BTN}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate([...current])}
        >
          {save.isPending
            ? t("integrations.googleCalendars.saving")
            : t("integrations.googleCalendars.save")}
        </button>
      </div>
    </section>
  );
}
