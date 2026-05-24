import { DASHBOARD_PAGE } from "@/utils/constants-url";
import Link from "next/link";
import React from "react";
import { useTranslation } from "react-i18next";

interface BreadcrumbProps {
  pageTitle: string;
  /** Optional decorative italic word that replaces the last word in the title. */
  flourish?: string;
  /** Optional eyebrow/kicker (mono uppercase) shown above the title. */
  kicker?: string;
}

const PageBreadcrumb: React.FC<BreadcrumbProps> = ({ pageTitle, flourish, kicker }) => {
  const { t } = useTranslation();

  const renderTitle = () => {
    if (flourish) {
      return (
        <h2 className="text-[28px] md:text-[32px] leading-none tracking-tight font-semibold text-husrev-ink dark:text-husrev-cream">
          {pageTitle}{" "}
          <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
            {flourish}
          </span>
        </h2>
      );
    }
    const words = pageTitle.split(" ");
    if (words.length > 1) {
      const last = words.pop()!;
      return (
        <h2 className="text-[28px] md:text-[32px] leading-none tracking-tight font-semibold text-husrev-ink dark:text-husrev-cream">
          {words.join(" ")}{" "}
          <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
            {last}
          </span>
        </h2>
      );
    }
    return (
      <h2 className="text-[28px] md:text-[32px] leading-none tracking-tight font-semibold text-husrev-ink dark:text-husrev-cream">
        <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
          {pageTitle}
        </span>
      </h2>
    );
  };

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          {kicker && (
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {kicker}
            </span>
          )}
          {renderTitle()}
        </div>
        <nav>
          <ol className="flex items-center gap-2">
            <li>
              <Link
                className="inline-flex items-center gap-1.5 husrev-kicker text-gray-500 hover:text-husrev-ember dark:text-gray-400 dark:hover:text-husrev-amber transition-colors"
                href={DASHBOARD_PAGE}
              >
                {t("common.home")}
              </Link>
            </li>
            <li className="text-gray-300 dark:text-gray-600 select-none">·</li>
            <li className="husrev-kicker text-husrev-shadow dark:text-husrev-cream">{pageTitle}</li>
          </ol>
        </nav>
      </div>
      <div className="husrev-rule mt-4" />
    </div>
  );
};

export default PageBreadcrumb;
