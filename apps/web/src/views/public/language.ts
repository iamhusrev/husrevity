import type { PublicLanguage } from "./content";

const SUPPORTED: readonly PublicLanguage[] = ["en", "tr"];

function isSupported(value: string | undefined): value is PublicLanguage {
  return !!value && (SUPPORTED as readonly string[]).includes(value);
}

/**
 * Picks the page language: an explicit `?lang=` wins, then the best-weighted
 * supported tag in Accept-Language, then English.
 */
export function resolvePublicLanguage(
  queryLang: string | undefined,
  acceptLanguage: string | null | undefined,
): PublicLanguage {
  if (isSupported(queryLang)) return queryLang;
  if (acceptLanguage) {
    const ranked = acceptLanguage
      .split(",")
      .map((part, index) => {
        const [tag, ...params] = part.trim().split(";");
        const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
        const weight = q ? Number(q.slice(2)) : 1;
        return {
          primary: tag.trim().toLowerCase().split("-")[0],
          weight: Number.isFinite(weight) ? weight : 0,
          index,
        };
      })
      .filter((c) => isSupported(c.primary) && c.weight > 0)
      .sort((a, b) => b.weight - a.weight || a.index - b.index);
    if (ranked.length > 0) return ranked[0].primary as PublicLanguage;
  }
  return "en";
}
