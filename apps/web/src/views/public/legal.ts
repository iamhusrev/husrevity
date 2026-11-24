export interface LegalIdentity {
  operatorName: string | null;
  contactEmail: string | null;
}

const EMPTY: LegalIdentity = { operatorName: null, contactEmail: null };
const FETCH_TIMEOUT_MS = 3000;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads the operator identity from the public API. Any failure (network,
 * non-OK status, malformed body) yields nulls: the pages never invent a value.
 */
export async function fetchLegalIdentity(): Promise<LegalIdentity> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4090/api";
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/public/legal`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return EMPTY;
    const body = (await res.json()) as { data?: Record<string, unknown> | null };
    return {
      operatorName: cleanString(body?.data?.operatorName),
      contactEmail: cleanString(body?.data?.contactEmail),
    };
  } catch {
    return EMPTY;
  }
}
