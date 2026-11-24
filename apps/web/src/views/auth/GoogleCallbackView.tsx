"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers/AuthProvider";
import { refreshSession } from "@/services/api-client";
import { GoogleExchangeResult, GoogleLoginService } from "@/services/google-login-service";
import { LOGIN_PAGE, PROFILE_PAGE } from "@/utils/constants-url";
import { clearVerifier, readVerifier } from "@/utils/google-pkce";

type Outcome = { kind: "session"; result: GoogleExchangeResult } | { kind: "error"; key: string };

// The handoff code is single use. React Strict Mode runs effects twice and a
// re-render can re-run them, so the single in-flight exchange lives at module
// level and every effect run subscribes to it instead of starting its own.
let inflight: Promise<Outcome> | null = null;

export function resetGoogleCallbackGuardForTests(): void {
  inflight = null;
}

function errorKeyFor(error: unknown): string {
  if (!isAxiosError(error)) return "googleLogin.errors.generic";
  const status = error.response?.status;
  const message = String(error.response?.data?.message ?? "");
  if (status === 409) {
    if (/invit/i.test(message)) return "googleLogin.errors.liveInvite";
    if (/already exists/i.test(message)) return "googleLogin.errors.existingEmail";
    return "googleLogin.errors.conflict";
  }
  if (status === 403) return "googleLogin.errors.disabled";
  if (status === 401) return "googleLogin.errors.failed";
  if (status === 400) return "googleLogin.errors.badCode";
  return "googleLogin.errors.generic";
}

/**
 * Registers an outcome as THE in-flight one so every effect run (Strict Mode
 * remount included) sees the same real result. Released once settled so only a
 * fresh fragment can start another exchange.
 */
function track(run: Promise<Outcome>): Promise<Outcome> {
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/**
 * A link flow redeemed with an expired session answers 401 without consuming
 * the handoff. Refresh the session once and retry with the same verifier; a
 * second 401 (or a failed refresh) is final.
 */
async function exchangeWithOneRefresh(code: string, verifier: string): Promise<GoogleExchangeResult> {
  try {
    return await GoogleLoginService.exchange(code, verifier);
  } catch (err) {
    if (!isAxiosError(err) || err.response?.status !== 401) throw err;
    try {
      await refreshSession();
    } catch {
      throw err;
    }
    return GoogleLoginService.exchange(code, verifier);
  }
}

/** Reads and strips the fragment synchronously, then starts at most one exchange. */
function startOnce(): Promise<Outcome> | null {
  if (inflight) return inflight;

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code");
  const error = params.get("error");
  if (code || error || window.location.hash) {
    // Clear first: the handoff code must never stay in the URL or history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  if (error) {
    clearVerifier();
    return track(Promise.resolve({ kind: "error", key: "googleLogin.errors.denied" } as Outcome));
  }
  if (!code) return null;

  const verifier = readVerifier();
  if (!verifier) {
    return track(Promise.resolve({ kind: "error", key: "googleLogin.errors.badCode" } as Outcome));
  }

  // The verifier stays in sessionStorage across the optional retry and is
  // removed once the exchange has finally succeeded or failed.
  const run: Promise<Outcome> = exchangeWithOneRefresh(code, verifier)
    .then(
      (result): Outcome => ({ kind: "session", result }),
      (err): Outcome => ({ kind: "error", key: errorKeyFor(err) }),
    )
    .finally(() => clearVerifier());
  return track(run);
}

export default function GoogleCallbackView() {
  const { t } = useTranslation();
  const { acceptSession } = useAuth();
  const router = useRouter();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const pending = startOnce();
    if (!pending) {
      setErrorKey("googleLogin.errors.missingCode");
      return;
    }
    void pending.then((outcome) => {
      if (!active) return;
      if (outcome.kind === "error") {
        setErrorKey(outcome.key);
      } else if (outcome.result.purpose === "link") {
        router.replace(`${PROFILE_PAGE}?google=linked`);
      } else {
        const { purpose: _purpose, ...auth } = outcome.result;
        void _purpose;
        acceptSession(auth);
      }
    });
    return () => {
      active = false;
    };
    // Run once on mount: the handoff code is single use and the exchange is
    // guarded at module level; acceptSession and router must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-md text-center" role="status">
      {errorKey ? (
        <>
          <p className="mb-6 text-sm text-gray-700 dark:text-gray-300">{t(errorKey)}</p>
          <Link href={LOGIN_PAGE} className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
            {t("googleLogin.backToSignIn")}
          </Link>
        </>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("googleLogin.signingIn")}</p>
      )}
    </div>
  );
}
