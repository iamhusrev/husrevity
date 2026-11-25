/**
 * Splits free text into plain-text and link segments so URLs typed into notes, descriptions and
 * routine items can be rendered as real anchors. Only http(s) URLs and bare "www." hosts are
 * linked; anything else (javascript:, mailto:, file:) stays plain text.
 */
export type LinkSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

// Stop at whitespace, angle brackets and quotes; trailing punctuation is trimmed below.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?…'"»]+$/;

/** Drops sentence punctuation and unbalanced closing brackets that are not part of the URL. */
function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    const before = url;
    url = url.replace(TRAILING_PUNCTUATION, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ] as const) {
      // Keep a closing bracket only when the URL itself opened one, e.g. Wikipedia "(disambiguation)".
      if (url.endsWith(close) && url.split(close).length > url.split(open).length) {
        url = url.slice(0, -1);
      }
    }
    if (url === before) return url;
  }
}

export function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function splitLinks(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = trimUrl(match[0]);
    // A bare scheme or a lone "www." has no host to open.
    const host = url.replace(/^https?:\/\//i, "");
    if (host === "" || /^www\.?$/i.test(host)) continue;
    if (start > cursor) segments.push({ type: "text", value: text.slice(cursor, start) });
    segments.push({ type: "link", value: url, href: toHref(url) });
    cursor = start + url.length;
  }
  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}

/** Short label for a link chip: the host without "www.", or the raw value if it does not parse. */
export function linkLabel(url: string): string {
  try {
    return new URL(toHref(url)).hostname.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
}
