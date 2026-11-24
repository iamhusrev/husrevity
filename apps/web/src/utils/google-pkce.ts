// PKCE helpers for the Google sign-in flow. The verifier never leaves the
// browser except in the final exchange POST; only its SHA-256 challenge goes
// into the start URL. It lives in sessionStorage so a reload of the callback
// page cannot replay it and other tabs cannot read it.

export const GOOGLE_VERIFIER_STORAGE_KEY = "google_pkce_verifier";
/** Separate slot for the Google Calendar consent flows so they never clash with a sign-in in another tab. */
export const GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY = "google_calendar_pkce_verifier";

const VERIFIER_BYTES = 32; // 32 random bytes -> 43 base64url characters

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateVerifier(): string {
  const bytes = new Uint8Array(VERIFIER_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

export function storeVerifier(verifier: string, key: string = GOOGLE_VERIFIER_STORAGE_KEY): void {
  sessionStorage.setItem(key, verifier);
}

export function readVerifier(key: string = GOOGLE_VERIFIER_STORAGE_KEY): string | null {
  return sessionStorage.getItem(key);
}

export function clearVerifier(key: string = GOOGLE_VERIFIER_STORAGE_KEY): void {
  sessionStorage.removeItem(key);
}

/** Creates a fresh verifier, stores it and returns it with its challenge. */
export async function beginPkce(
  key: string = GOOGLE_VERIFIER_STORAGE_KEY,
): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateVerifier();
  const challenge = await challengeFor(verifier);
  storeVerifier(verifier, key);
  return { verifier, challenge };
}
