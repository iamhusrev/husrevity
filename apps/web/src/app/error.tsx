"use client";

import GridShape from "@/components/common/GridShape";
import { useTranslation } from "react-i18next";
import Link from "next/link";

export default function GlobalError({ reset }: { reset: () => void }) {
  const { t } = useTranslation();

  return (
    <html>
      <body>
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-husrev-cream p-6 grain dark:bg-husrev-ink">
          <GridShape />

          <div className="relative z-10 mx-auto w-full max-w-md text-center">
            <span className="husrev-kicker text-error-500/80">
              {t("errors.internal.kicker", "Beklenmedik bir hata")}
            </span>

            <div className="mt-4 flex items-center justify-center">
              <span className="font-instrument-serif text-[8.5rem] sm:text-[10rem] leading-none italic text-husrev-ink dark:text-husrev-cream tabular-nums">
                500
              </span>
            </div>
            <div className="mx-auto mt-2 h-px w-16 bg-husrev-ember" aria-hidden="true" />

            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream sm:text-3xl">
              {t("errors.internal.title")}
            </h1>

            <p className="mt-3 text-base leading-relaxed text-gray-600 dark:text-gray-300">
              {t("errors.internal.message")}
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <button type="button" onClick={reset} className="husrev-btn-ghost">
                {t("errors.internal.tryAgain")}
              </button>
              <Link href="/" className="husrev-btn">
                {t("errors.common.backHome")}
              </Link>
            </div>
          </div>

          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs tracking-wide text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} — husrevity
          </p>
        </div>
      </body>
    </html>
  );
}
