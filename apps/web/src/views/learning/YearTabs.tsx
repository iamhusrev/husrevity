"use client";

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { YearTabDef, YearTabId } from "./learning-year";

export const TOPICS_PANEL_ID = "learning-topics";

// Stable DOM id of a tab, so the tabpanel can point back at the selected one with aria-labelledby.
export const yearTabDomId = (id: YearTabId) => `learning-tab-${id}`;

export default function YearTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: YearTabDef[];
  value: YearTabId;
  onChange: (id: YearTabId) => void;
}) {
  const { t } = useTranslation();
  const tabRefs = useRef<Map<YearTabId, HTMLButtonElement>>(new Map());
  // Automatic activation: arrow keys both move focus and select, as in the WAI-ARIA tabs pattern.
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = tabs[next];
    onChange(target.id);
    tabRefs.current.get(target.id)?.focus();
  };
  return (
    <nav
      role="tablist"
      aria-label={t("learning.yearFilter", "Filter by year")}
      // The vertical padding keeps the focus ring inside the scroll box (overflow-x forces overflow-y).
      className="-mx-1 -my-0.5 flex min-w-0 max-w-full gap-1 overflow-x-auto px-1 py-0.5 no-scrollbar"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            id={yearTabDomId(tab.id)}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            aria-controls={TOPICS_PANEL_ID}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
              selected
                ? "bg-husrev-ember text-husrev-cream"
                : "text-gray-600 hover:bg-husrev-sand/40 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            <span>{tab.id === "all" ? t("learning.yearTabs.all", "All") : tab.id}</span>
            <span className={`tabular-nums ${selected ? "opacity-80" : "opacity-60"}`}>
              {" · "}
              {tab.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
