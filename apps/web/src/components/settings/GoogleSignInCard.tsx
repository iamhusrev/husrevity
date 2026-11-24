"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleIdentityStatus, GoogleLoginService } from "@/services/google-login-service";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

/** Settings section to link or unlink the Google identity of the signed-in user. */
export default function GoogleSignInCard() {
  const { t } = useTranslation();
  const showAlert = alertStore((state) => state.show);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<GoogleIdentityStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await GoogleLoginService.getIdentity());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    GoogleLoginService.isEnabled()
      .then((value) => {
        if (!active) return;
        setEnabled(value);
        if (value) void load();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [load]);

  // Returning from the link flow lands here with ?google=linked.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") !== "linked") return;
    params.delete("google");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
    showAlert({
      title: t("googleLogin.settings.title"),
      message: t("googleLogin.settings.linkedSuccess"),
      type: "success",
      position: "top-center",
    });
  }, [showAlert, t]);

  if (!enabled || !status) return null;

  const link = async () => {
    setBusy(true);
    try {
      await GoogleLoginService.startLink();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await GoogleLoginService.unlink();
      await load();
      showAlert({
        title: t("googleLogin.settings.title"),
        message: t("googleLogin.settings.unlinkedSuccess"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setBusy(false);
    }
  };

  const canUnlink = status.passwordLoginEnabled;

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-6 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <h3 className="mb-1 text-base font-semibold text-husrev-ink dark:text-husrev-cream">
        {t("googleLogin.settings.title")}
      </h3>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {status.linked
          ? t("googleLogin.settings.linkedAs", { email: status.email ?? "" })
          : t("googleLogin.settings.notLinked")}
      </p>
      {status.linked ? (
        <>
          <button
            type="button"
            onClick={unlink}
            disabled={busy || !canUnlink}
            className="rounded-xl px-4 py-2 text-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:ring-white/20"
          >
            {t("googleLogin.settings.unlink")}
          </button>
          {!canUnlink && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t("googleLogin.settings.unlinkDisabled")}
            </p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={link}
          disabled={busy}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t("googleLogin.settings.link")}
        </button>
      )}
    </section>
  );
}
