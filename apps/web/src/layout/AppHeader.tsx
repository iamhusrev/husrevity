"use client";
import DateTimeClock from "@/components/header/DateTimeClock";
import LanguageDropdown from "@/components/header/LanguageDropdown";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import { ThemeToggleButton } from "@/components/header/ThemeToggleButton";
import UserDropdown from "@/components/header/UserDropdown";
import TodaySuggestionsModal from "@/components/ai/TodaySuggestionsModal";
import { useSidebar } from "@/providers/SidebarContext";
import { useQuickAdd } from "@/providers/QuickAddContext";
import { HOME_PAGE } from "@/utils/constants-url";
import { useTranslation } from "react-i18next";
import { HiSparkles } from "react-icons/hi2";
import { BiPlus } from "react-icons/bi";
import Link from "next/link";
import React, { useState } from "react";

const AppHeader: React.FC = () => {
  const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { t } = useTranslation();

  const { toggleSidebar } = useSidebar();
  const { openQuickAdd } = useQuickAdd();

  const toggleApplicationMenu = () => {
    setApplicationMenuOpen(!isApplicationMenuOpen);
  };

  return (
    <header className="sticky top-0 flex w-full bg-husrev-cream/80 dark:bg-husrev-ink/80 backdrop-blur border-husrev-sand z-99999 dark:border-white/5 xl:border-b">
      <div className="flex flex-col items-center justify-between grow xl:flex-row xl:px-6">
        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-husrev-sand dark:border-white/5 sm:gap-4 xl:justify-normal xl:border-b-0 xl:px-0 xl:py-4">
          <button
            className="hidden xl:flex items-center justify-center w-11 h-11 text-gray-600 dark:text-gray-300 rounded-lg ring-1 ring-husrev-sand dark:ring-white/[0.06] hover:bg-husrev-sand/40 dark:hover:bg-white/5 z-99999"
            onClick={toggleSidebar}
            aria-label={t("appheader.toggleSidebar")}
          >
            <svg
              width="16"
              height="12"
              viewBox="0 0 16 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z"
                fill="currentColor"
              />
            </svg>
          </button>

          <Link href={HOME_PAGE} className="xl:hidden">
            <span className="text-2xl font-bold bg-gradient-to-r from-husrev-amber to-husrev-ember bg-clip-text text-transparent">
              husrevity
            </span>
          </Link>

          <button
            onClick={toggleApplicationMenu}
            className="flex items-center justify-center w-11 h-11 text-gray-700 rounded-lg z-99999 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 xl:hidden"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <div
          className={`${
            isApplicationMenuOpen ? "flex" : "hidden"
          } items-center justify-between w-full gap-4 px-5 py-4 xl:flex shadow-theme-md xl:justify-end xl:px-0 xl:shadow-none`}
        >
          <div className="flex items-center gap-2 2xsm:gap-3">
            <DateTimeClock />
            <button
              type="button"
              onClick={openQuickAdd}
              aria-label={t("quickAdd.title", "Hızlı Ekle")}
              title={t("quickAdd.title", "Hızlı Ekle")}
              className="hidden xl:inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-husrev-ember ring-1 ring-husrev-sand backdrop-blur transition hover:bg-husrev-amber/15 hover:ring-husrev-amber/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-white/5 dark:text-husrev-amber dark:ring-white/10 dark:hover:bg-white/10"
            >
              <BiPlus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              aria-label={t("sidebarPanel.ctaTitle", "Bugün ne yapsam?")}
              title={t("sidebarPanel.ctaTitle", "Bugün ne yapsam?")}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-husrev-ember ring-1 ring-husrev-sand backdrop-blur transition hover:bg-husrev-amber/15 hover:ring-husrev-amber/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-white/5 dark:text-husrev-amber dark:ring-white/10 dark:hover:bg-white/10"
            >
              <HiSparkles className="h-5 w-5" />
            </button>
            <LanguageDropdown />
            <ThemeToggleButton />
            <NotificationDropdown />
          </div>
          <UserDropdown />
        </div>
      </div>

      <TodaySuggestionsModal isOpen={showSuggestions} onClose={() => setShowSuggestions(false)} />
    </header>
  );
};

export default AppHeader;
