import { headers } from "next/headers";

import type { PublicLanguage } from "./content";
import { resolvePublicLanguage } from "./language";

export type PublicSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Resolves the language for a request from `?lang=` and Accept-Language. */
export async function languageForRequest(searchParams: PublicSearchParams): Promise<PublicLanguage> {
  const params = await searchParams;
  const raw = params.lang;
  const queryLang = Array.isArray(raw) ? raw[0] : raw;
  const h = await headers();
  return resolvePublicLanguage(queryLang, h.get("accept-language"));
}
