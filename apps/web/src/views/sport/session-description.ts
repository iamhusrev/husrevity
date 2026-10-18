// Pure parser for the free-text session description (no React).
//
// Real descriptions look like several blocks separated by blank lines, each
// opened by an emoji or an uppercase heading ("🔥 ISINMA (5 dk)",
// "💪 ANA BÖLÜM — 20 dk AMRAP", "📌 Genel kurallar"). The parser is a
// heuristic: when no block has a recognisable heading the whole text is kept
// as one untitled block with its line breaks, so nothing is ever lost.

export interface SessionSection {
  /** Heading line of the block, or null for an untitled block of plain text. */
  title: string | null;
  /** Body lines of the block, in order, with line breaks preserved. */
  lines: string[];
}

const LEADING_EMOJI = /^\p{Extended_Pictographic}/u;
const NOTES_TITLE = /📌|\bnot(?:lar|es|e)?\b|kural|\brules?\b/iu;
const MAIN_TITLE = /\bana\b|\bmain\b|\bwod\b/iu;

function isMostlyUppercase(line: string): boolean {
  const letters = line.match(/\p{L}/gu) ?? [];
  if (letters.length < 2) return false;
  const upper = letters.filter((ch) => /\p{Lu}/u.test(ch)).length;
  return upper / letters.length >= 0.6;
}

function isHeading(line: string): boolean {
  return LEADING_EMOJI.test(line) || isMostlyUppercase(line);
}

function normaliseLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

export function parseSessionDescription(text: string): SessionSection[] {
  const lines = normaliseLines(text);
  if (!lines.length) return [];

  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);

  const anyHeading = blocks.some((b) => isHeading(b[0]));
  if (!anyHeading) return [{ title: null, lines }];

  return blocks.map((block) =>
    isHeading(block[0])
      ? { title: block[0].trim(), lines: block.slice(1) }
      : { title: null, lines: block },
  );
}

/** True for the "notes" / "rules" block, which is collapsed by default. */
export function isNotesSection(section: SessionSection): boolean {
  return section.title !== null && NOTES_TITLE.test(section.title);
}

/**
 * Index of the section that should start expanded: the main workout block if
 * one is recognisable, otherwise the first block that is not notes/rules,
 * otherwise the first block. Returns -1 for an empty list.
 */
const LIST_MARKER = /^(?:[-•*]|\d+[.)])\s+/;
const SUMMARY_MAX_CHARS = 120;

/**
 * One-line teaser for a card: the first `maxLines` non-empty lines of the
 * main section (bullets stripped), joined with " · " and cut at 120 chars.
 */
export function sessionSummary(text: string, maxLines = 2): string {
  const sections = parseSessionDescription(text);
  if (!sections.length) return "";
  const main = sections[defaultOpenIndex(sections)];
  const lines = main.lines
    .map((l) => l.trim().replace(LIST_MARKER, ""))
    .filter(Boolean)
    .slice(0, maxLines);
  const summary = lines.join(" · ");
  return summary.length > SUMMARY_MAX_CHARS ? `${summary.slice(0, SUMMARY_MAX_CHARS)}…` : summary;
}

export function defaultOpenIndex(sections: SessionSection[]): number {
  if (!sections.length) return -1;
  const main = sections.findIndex((s) => s.title !== null && MAIN_TITLE.test(s.title));
  if (main >= 0) return main;
  const firstRegular = sections.findIndex((s) => !isNotesSection(s));
  return firstRegular >= 0 ? firstRegular : 0;
}
