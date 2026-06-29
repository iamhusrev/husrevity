"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import GlobalAlert from "@/components/alert/GlobalAlert";
import { AuthProvider } from "@/providers/AuthProvider";
import I18nProvider from "@/providers/I18nProvider";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { SidebarProvider } from "@/providers/SidebarContext";
import { ThemeProvider } from "@/providers/ThemeContext";

/**
 * Keeps <html lang> in sync with the active i18n language and registers the
 * service worker for PWA install/offline. Lives inside I18nProvider so it can
 * read the language; renders nothing. Setting `lang` in an effect (rather than
 * during render) avoids a hydration mismatch with the server-rendered default.
 */
function ClientBootstrap() {
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language) {
      document.documentElement.lang = i18n.language;
    }
  }, [i18n.language]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // In development we must NOT keep a service worker around: it caches
    // hashed `/_next/static/` chunks (stale-while-revalidate), and a chunk
    // built against a different NEXT_PUBLIC_API_URL would keep calling that
    // old API. Proactively unregister any leftover worker and drop its caches
    // so dev always talks to the local API from `.env.local`.
    //
    // Opt out with NEXT_PUBLIC_ENABLE_SW_DEV=1 to test push/PWA locally (the SW
    // then registers in dev too). Caveat: stale hashed chunks can linger after
    // switching NEXT_PUBLIC_API_URL — hard-reload / clear site data if so.
    const enableSwInDev = process.env.NEXT_PUBLIC_ENABLE_SW_DEV === "1";
    if (process.env.NODE_ENV !== "production" && !enableSwInDev) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    // Idempotent: push-service.ts may register the same worker when the user
    // enables notifications. Registering on load makes the app installable and
    // offline-capable even without push.
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* SW registration is best-effort; the app still works without it. */
      });

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ReactQueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <ClientBootstrap />
            <GlobalAlert />
            <SidebarProvider>{children}</SidebarProvider>
          </ThemeProvider>
        </AuthProvider>
      </ReactQueryProvider>
    </I18nProvider>
  );
}
