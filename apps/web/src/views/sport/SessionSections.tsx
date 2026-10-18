"use client";

import { BiChevronRight } from "react-icons/bi";
import { cn } from "@/utils/utils";
import { defaultOpenIndex, parseSessionDescription } from "./session-description";

type LineGroup = { kind: "ul" | "ol"; items: string[] } | { kind: "p"; text: string };

const BULLET = /^[-•*]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

/** Groups consecutive "- item" / "1. item" lines into lists; other lines stay paragraphs. */
function groupLines(lines: string[]): LineGroup[] {
  const groups: LineGroup[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const kind: "ul" | "ol" | null = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : null;
    if (!kind) {
      groups.push({ kind: "p", text: line });
      continue;
    }
    const text = line.replace(kind === "ul" ? BULLET : NUMBERED, "");
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.items.push(text);
    else groups.push({ kind, items: [text] });
  }
  return groups;
}

const BODY_TEXT = "text-sm leading-relaxed text-gray-700 dark:text-gray-300";

function SectionBody({ lines }: { lines: string[] }) {
  const groups = groupLines(lines);
  return (
    <div className={cn("space-y-1.5", BODY_TEXT)}>
      {groups.map((group, i) => {
        if (group.kind === "p") return <p key={i}>{group.text}</p>;
        const ListTag = group.kind;
        return (
          <ListTag
            key={i}
            className={cn(
              "space-y-1 pl-5 marker:text-husrev-ember/70 dark:marker:text-husrev-amber/70",
              group.kind === "ul" ? "list-disc" : "list-decimal",
            )}
          >
            {group.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}

function PlainBlock({ lines, className }: { lines: string[]; className?: string }) {
  return <p className={cn("whitespace-pre-line", BODY_TEXT, className)}>{lines.join("\n")}</p>;
}

/**
 * Readable rendering of a session description: titled blocks become
 * collapsible `<details>` sections (main workout open, warm-up / cool-down /
 * notes closed), plain text stays a paragraph with its line breaks.
 */
export default function SessionSections({ text, className }: { text: string; className?: string }) {
  const sections = parseSessionDescription(text);
  if (!sections.length) return null;

  if (sections.length === 1 && sections[0].title === null) {
    return <PlainBlock lines={sections[0].lines} className={className} />;
  }

  const openIndex = defaultOpenIndex(sections);

  return (
    <div className={cn("space-y-1.5", className)}>
      {sections.map((section, i) =>
        section.title === null ? (
          <PlainBlock key={i} lines={section.lines} className="px-1" />
        ) : (
          <details
            key={i}
            open={i === openIndex}
            className="group/section rounded-xl ring-1 ring-husrev-sand/70 bg-husrev-cream/30 open:bg-white dark:bg-white/[0.02] dark:ring-white/[0.06] dark:open:bg-white/[0.04]"
          >
            <summary className="flex min-h-10 cursor-pointer select-none list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-husrev-ink transition hover:bg-husrev-sand/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-husrev-cream dark:hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
              <BiChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open/section:rotate-90 dark:text-gray-500"
              />
              <span className="min-w-0 flex-1">{section.title}</span>
            </summary>
            {section.lines.length > 0 && (
              <div className="px-3 pb-3 pl-9">
                <SectionBody lines={section.lines} />
              </div>
            )}
          </details>
        ),
      )}
    </div>
  );
}
