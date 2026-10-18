"use client";
import React from "react";
import { useTranslation } from "react-i18next";
import { BiDesktop, BiMoon, BiSun } from "react-icons/bi";
import { Theme, useTheme } from "@/providers/ThemeContext";

// Automatic first: it is the default, and clicking through light and dark returns to it.
const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

export const ThemeToggleButton: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const labels: Record<Theme, string> = {
    system: t("themeToggle.system", "Theme: automatic (follows system)"),
    light: t("themeToggle.light", "Theme: light"),
    dark: t("themeToggle.dark", "Theme: dark"),
  };
  const Icon = theme === "system" ? BiDesktop : theme === "light" ? BiSun : BiMoon;

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label={labels[theme]}
      title={labels[theme]}
      className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-dark-900 h-11 w-11 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
};
