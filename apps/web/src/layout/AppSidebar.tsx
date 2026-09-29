"use client";
import AppLogo from "@/components/logo/AppLogo";
import TodaySuggestionsModal from "@/components/ai/TodaySuggestionsModal";
import { HOME_PAGE } from "@/utils/constants-url";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CiGrid41 } from "react-icons/ci";
import { BiNote, BiFolder, BiDotsHorizontalRounded } from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";
import { useSidebar } from "@/providers/SidebarContext";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path: string;
};

type TFunc = (key: string) => string;

/**
 * Faz 2: nav reduced to 4 top-level destinations — Bugün (/dashboard) ·
 * Notlar · Projeler · Diğer. Everything that used to have its own primary
 * nav entry (Reminders, Calendar, Evkat, Vault, Sport, Learning, Admin,
 * Settings) now lives under "Diğer" (see DigerPage) — their data is
 * superseded by the unified Item model and the Bugün screen, but the
 * pages themselves stay reachable while the old tables are still live.
 */
const getNavSections = (t: TFunc): NavItem[] => [
  { icon: <CiGrid41 size={"1.5rem"} />, name: t("nav.dashboard"), path: "/dashboard" },
  { icon: <BiNote size={"1.5rem"} />, name: t("nav.notes"), path: "/notes" },
  { icon: <BiFolder size={"1.5rem"} />, name: t("nav.projects"), path: "/projects" },
  { icon: <BiDotsHorizontalRounded size={"1.5rem"} />, name: t("nav.more"), path: "/diger" },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const isActive = useCallback((path: string) => path === pathname, [pathname]);
  const showText = isExpanded || isHovered;

  return (
    <aside
      className={`fixed flex flex-col xl:mt-0 top-0 px-5 left-0 bg-husrev-cream/85 dark:bg-husrev-ink/70 backdrop-blur-sm text-husrev-ink dark:text-husrev-cream h-full transition-all duration-300 ease-in-out z-50 border-r border-husrev-sand/70 dark:border-white/5 ${
        isExpanded || isHovered ? "w-[290px]" : "w-[90px]"
      } -translate-x-full xl:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "xl:justify-center" : "justify-center"
        }`}
      >
        <Link href={HOME_PAGE}>
          <AppLogo collapsed={!showText} />
        </Link>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <ul className="flex flex-col gap-1">
            {getNavSections(t).map((nav) => (
              <li key={nav.path}>
                <Link
                  href={nav.path}
                  className={`menu-item group ${
                    isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                  }`}
                >
                  <span
                    className={`${
                      isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"
                    }`}
                  >
                    {nav.icon}
                  </span>
                  {showText && <span className="menu-item-text">{nav.name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto pb-4">
          {showText ? (
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              aria-label={t("sidebarPanel.ctaTitle")}
              className="group relative block w-full overflow-hidden rounded-xl ring-1 ring-husrev-sand bg-husrev-cream/80 dark:bg-white/[0.03] dark:ring-white/[0.06] p-3.5 grain text-left transition hover:-translate-y-px hover:ring-husrev-amber/60 hover:bg-husrev-cream dark:hover:bg-white/[0.05] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-husrev-ink dark:bg-husrev-cream transition group-hover:bg-husrev-ember">
                  <HiSparkles className="h-4 w-4 text-husrev-amber" />
                </div>
                <div className="text-[12.5px] leading-snug text-gray-600 dark:text-gray-300">
                  <span className="font-instrument-serif italic text-[15px] text-husrev-ink dark:text-husrev-cream">
                    {t("sidebarPanel.ctaTitle")}
                  </span>
                  <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                    {t("sidebarPanel.ctaBody")}
                  </p>
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              aria-label={t("sidebarPanel.ctaTitle")}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-husrev-ink dark:bg-husrev-cream transition hover:bg-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
            >
              <HiSparkles className="h-4 w-4 text-husrev-amber" />
            </button>
          )}
        </div>

        <TodaySuggestionsModal
          isOpen={showSuggestions}
          onClose={() => setShowSuggestions(false)}
        />
      </div>
    </aside>
  );
};

export default AppSidebar;
