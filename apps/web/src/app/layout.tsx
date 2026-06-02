import type { Metadata, Viewport } from "next";
import { Outfit, Instrument_Serif, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

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

export const metadata: Metadata = {
  applicationName: "husrevity",
  title: {
    default: "Husrevity",
    template: "%s | Husrevity",
  },
  description:
    "Notlar, listeler, projeler, görevler, takvim ve anımsatıcılar için kişisel üretkenlik uygulaması.",
  appleWebApp: {
    capable: true,
    title: "husrevity",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#2b2823" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `lang` starts at the project default (tr); ClientBootstrap syncs it to the
  // detected i18n language after hydration. suppressHydrationWarning keeps that
  // attribute swap from logging a mismatch.
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
