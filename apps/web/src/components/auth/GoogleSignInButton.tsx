"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLoginService } from "@/services/google-login-service";

/**
 * "Continue with Google" for the sign-in and sign-up forms. Renders nothing
 * until the API reports the feature enabled; a failed config request hides
 * it so the password form is never affected.
 */
export default function GoogleSignInButton() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;
    GoogleLoginService.isEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  const onClick = async () => {
    setStarting(true);
    try {
      await GoogleLoginService.startLogin();
    } catch {
      setStarting(false);
    }
  };

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={onClick}
        disabled={starting}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm ring-1 ring-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:bg-transparent dark:text-white/90 dark:ring-white/20"
      >
        {t("googleLogin.continue")}
      </button>
      <div className="mt-5 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
        {t("googleLogin.or")}
        <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
      </div>
    </div>
  );
}
