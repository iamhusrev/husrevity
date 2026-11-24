/**
 * Minimal Cookie request-header parser (RFC 6265 section 5.4). Avoids adding
 * cookie-parser for the single cookie the Google sign-in flow reads.
 *
 * Malformed pairs are skipped, values may be double-quoted, percent-encoding is
 * decoded when valid, and the FIRST occurrence of a name wins (a later
 * duplicate must not override the cookie the browser sent first).
 */
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || Object.prototype.hasOwnProperty.call(out, name)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}
