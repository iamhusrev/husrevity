"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { integrationsService } from "@/services/integrations-service";
import { INTEGRATIONS_PAGE } from "@/utils/constants-url";
import { GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY as VERIFIER_KEY, clearVerifier, readVerifier } from "@/utils/google-pkce";

type Outcome = "connected" | "error";

// The handoff code is single use. React Strict Mode runs effects twice and a
// re-render can re-run them, so the single in-flight exchange lives at module
// level and every effect run subscribes to it instead of starting its own.
let inflight: Promise<Outcome> | null = null;

export function resetGoogleCalendarCallbackGuardForTests(): void {
  inflight = null;
}

/** Reads and strips the fragment synchronously, then starts at most one exchange. */
function startOnce(): Promise<Outcome> {
  if (inflight) return inflight;

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code");
  if (window.location.hash) {
    // Clear first: the handoff code must never stay in the URL or history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  const verifier = readVerifier(VERIFIER_KEY);
  clearVerifier(VERIFIER_KEY);
  // No code (denied or failed consent), or no verifier in THIS browser session
  // (a link someone else started): nothing is exchanged.
  if (!code || !verifier) return Promise.resolve("error");

  const run: Promise<Outcome> = integrationsService.googleExchange(code, verifier).then(
    (result): Outcome => (result.connected ? "connected" : "error"),
    (): Outcome => "error",
  );
  inflight = run;
  // Release the guard once settled so only a fresh fragment can start another exchange.
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/**
 * Landing page of every Google Calendar consent (connect, narrow, enable write).
 * Redeems the handoff code from the URL fragment together with the PKCE
 * verifier held by this session, then returns to the Integrations page, which
 * shows the result.
 */
export default function GoogleCalendarCallbackView() {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void startOnce().then((outcome) => {
      if (active) router.replace(`${INTEGRATIONS_PAGE}?google=${outcome}`);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-md py-16 text-center" role="status">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.googleCallback.working")}</p>
    </div>
  );
}
