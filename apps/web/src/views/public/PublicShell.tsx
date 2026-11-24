import Link from "next/link";
import type { ReactNode } from "react";

import { content, type PublicLanguage } from "./content";

interface PublicShellProps {
  lang: PublicLanguage;
  /** Path of the current page, used for the language toggle link. */
  path: string;
  children: ReactNode;
}

export default function PublicShell({ lang, path, children }: PublicShellProps) {
  const t = content[lang];
  const other: PublicLanguage = lang === "en" ? "tr" : "en";

  return (
    <div
      lang={lang}
      className="flex min-h-screen flex-col bg-husrev-cream text-gray-800 dark:bg-husrev-ink dark:text-gray-100"
    >
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-medium">
          Husrevity
        </Link>
        <Link
          href={`${path}?lang=${other}`}
          hrefLang={other}
          className="text-sm text-gray-600 underline dark:text-gray-300"
        >
          {t.nav.language}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-12">{children}</main>
      <footer className="mx-auto w-full max-w-3xl border-t border-gray-300 px-6 py-6 text-sm dark:border-gray-700">
        <nav className="flex gap-6">
          <Link href="/privacy" className="underline">
            {t.nav.privacy}
          </Link>
          <Link href="/terms" className="underline">
            {t.nav.terms}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
