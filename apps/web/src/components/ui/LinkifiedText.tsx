"use client";

import { Fragment, type SyntheticEvent } from "react";
import { splitLinks } from "@/utils/linkify";

// Links usually sit inside clickable cards, sortable rows or rows that open an editor. Stopping
// propagation keeps a link click from also opening the card or starting a drag.
const stop = (e: SyntheticEvent) => e.stopPropagation();

export const LINK_CLASS =
  "break-all text-brand-600 underline decoration-brand-500/40 underline-offset-2 transition hover:text-brand-700 hover:decoration-brand-600 dark:text-brand-400 dark:hover:text-brand-300";

/**
 * Renders free text with every http(s)/www URL turned into a new-tab anchor. Plain text is
 * returned untouched, so it inherits the parent's whitespace and clamping styles.
 *
 * Must not be placed inside a <button> or another <a>: nested interactive content is invalid
 * HTML and the browser would swallow the click.
 */
export default function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((segment, i) =>
        segment.type === "text" ? (
          <Fragment key={i}>{segment.value}</Fragment>
        ) : (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            onPointerDown={stop}
            onKeyDown={stop}
            className={LINK_CLASS}
          >
            {segment.value}
          </a>
        ),
      )}
    </>
  );
}
