/**
 * Masks credential-looking substrings before text reaches a log line. Google
 * client errors can echo request headers or URLs, so every error message that
 * is logged by the Google integration goes through this helper.
 */
const BARE_TOKEN_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bya29\.[A-Za-z0-9._-]+/g,
  /\b1\/\/[A-Za-z0-9._-]{20,}/g,
];

const KEYED_TOKEN_PATTERN =
  /\b(access_token|refresh_token|id_token|client_secret|syncToken|token)(["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi;

export function redactSecrets(value: unknown): string {
  if (value === undefined || value === null) return '';
  let text =
    typeof value === 'string' ? value : value instanceof Error ? value.message : String(value);
  for (const pattern of BARE_TOKEN_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  return text.replace(KEYED_TOKEN_PATTERN, '$1$2[redacted]');
}
