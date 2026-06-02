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
