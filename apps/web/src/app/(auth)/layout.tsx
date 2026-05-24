"use client";

import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import AppLogo from "@/components/logo/AppLogo";
import { ThemeProvider } from "@/providers/ThemeContext";
import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="relative grain flex min-h-screen w-full flex-col items-center justify-center bg-husrev-cream p-6 dark:bg-husrev-ink">
        <div className="mb-8">
          <AppLogo />
        </div>

        {children}

        <p className="mt-10 text-center text-[12px] font-mono text-gray-500 dark:text-gray-400">
          husrevity · <span className="font-instrument-serif italic">sakin iş</span>
        </p>

        <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </ThemeProvider>
  );
}
