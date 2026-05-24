"use client";

import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import useGoBack from "@/hooks/useGoBack";
import { HOME_PAGE } from "@/utils/constants-url";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function Error404() {
  const { t } = useTranslation();
  const goBack = useGoBack();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-husrev-cream p-6 grain dark:bg-husrev-ink">
      <GridShape />

      <div className="relative z-10 mx-auto w-full max-w-md text-center">
        <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
          {t("errors.notFound.kicker", "Kayıp sayfa")}
        </span>

        <div className="mt-4 flex items-center justify-center">
          <span className="font-instrument-serif text-[8.5rem] sm:text-[10rem] leading-none italic text-husrev-ink dark:text-husrev-cream tabular-nums">
            404
          </span>
        </div>
        <div className="mx-auto mt-2 h-px w-16 bg-husrev-amber" aria-hidden="true" />

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream sm:text-3xl">
          {t("errors.notFound.title")}
        </h1>

        <p className="mt-3 text-base leading-relaxed text-gray-600 dark:text-gray-300">
          {t("errors.notFound.message")}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button type="button" onClick={goBack} className="husrev-btn-ghost">
            {t("errors.common.goBack")}
          </button>
          <Link href={HOME_PAGE} className="husrev-btn">
            {t("errors.common.backHome")}
          </Link>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
        <ThemeTogglerTwo />
      </div>

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs tracking-wide text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} — husrevity
      </p>
    </div>
  );
}
