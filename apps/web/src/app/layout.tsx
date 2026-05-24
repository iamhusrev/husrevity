"use client";

import GlobalAlert from "@/components/alert/GlobalAlert";
import { SidebarProvider } from "@/providers/SidebarContext";
import { ThemeProvider } from "@/providers/ThemeContext";
import { AuthProvider } from "@/providers/AuthProvider";
import I18nProvider from "@/providers/I18nProvider";

import { Outfit, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { useTranslation } from "react-i18next";

import "./globals.css";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--next-font-outfit",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--next-font-instrument-serif",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--next-font-jetbrains-mono",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();

  return (
    <html lang={i18n.language}>
      <body
        className={`${outfit.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans`}
      >
        <I18nProvider>
          <ReactQueryProvider>
            <AuthProvider>
              <ThemeProvider>
                <GlobalAlert />
                <SidebarProvider>{children}</SidebarProvider>
              </ThemeProvider>
            </AuthProvider>
          </ReactQueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
