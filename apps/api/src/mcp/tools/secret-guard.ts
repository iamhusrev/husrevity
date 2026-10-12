/**
 * Conservative credential heuristic for text arriving over MCP. It is an
 * ASSUMPTION-based guard, not a security boundary: it only catches obvious
 * shapes, and prefers refusing when in doubt on explicit "keyword: value"
 * assignments while leaving ordinary phrases ("şifre yenile") alone.
 *
 * Explicit assumptions:
 * - Specific secret keywords (password, parola, şifre, api_key, secret, private_key, bearer,
 *   as well as specific token types like auth_token, access_token, api_token) followed by an
 *   assignment operator (":", "=", "is", "ise") refuse any value of 3+ chars.
 * - Polysemous keywords like bare "token" (which appear in transit contexts such as bus/subway tokens,
 *   gaming tokens, or NLP tokens) only trigger on assignment if the assigned value itself looks
 *   like a credential (letters + digits, symbols, 6+ digits, or known token format).
 *   This avoids false positives on phrases like "otobüs için token: bilet al" or "bus token is required".
 * - Known token shapes (e.g. OpenAI sk-, GitHub ghp_, AWS AKIA, Google AIza, Slack xoxb-, JWT)
 *   and PEM private key blocks are unconditionally refused.
 * - Documented false negatives: novel or obscure key formats without identifying keywords or shapes.
 * - Documented false positives: user text that intentionally embeds sample credential-like strings.
 */

const SUFFIX_KEYWORD = '(?:parola|şifre|sifre)';
const STRICT_EXACT_KEYWORD =
  '(?:password|passwd|pwd|pw|pass|passphrase|pin|credentials|kimlik[\\s_-]?bilgisi|api[\\s_-]?key|apikey|secret|client[\\s_-]?secret|private[\\s_-]?key|bearer|(?:auth|api|access|bearer|refresh|session|jwt|personal[\\s_-]?access)[\\s_-]?token)';
const STRICT_KEYWORD_START = `(?<![\\p{L}\\p{N}])(?:${SUFFIX_KEYWORD}(?:['’]?\\p{L}+)?|${STRICT_EXACT_KEYWORD}(?:['’]\\p{L}+)?)`;

// Strict keyword + explicit assignment (":", "=", "is", "ise") + any value
const STRICT_ASSIGNMENT = new RegExp(
  `${STRICT_KEYWORD_START}["']?\\s*(?::|=|\\bis\\b|\\bise\\b)\\s*["']?\\S{3,}`,
  'iu',
);

// Bare token keyword (e.g. transit token, subway token, bus token, NLP token)
const BARE_TOKEN_KEYWORD = 'token';
const BARE_TOKEN_START = `(?<![\\p{L}\\p{N}])${BARE_TOKEN_KEYWORD}(?:['’]?\\p{L}+)?`;

// Bare token assignment: capture the assigned value so we can verify if it looks like a credential
const BARE_TOKEN_ASSIGNMENT = new RegExp(
  `${BARE_TOKEN_START}["']?\\s*(?::|=|\\bis\\b|\\bise\\b)\\s*["']?(\\S+)`,
  'iu',
);

// Any keyword + whitespace + a value that itself looks like a credential
const ALL_EXACT_KEYWORD =
  '(?:password|passwd|pwd|pw|pass|passphrase|pin|credentials|kimlik[\\s_-]?bilgisi|api[\\s_-]?key|apikey|secret|client[\\s_-]?secret|private[\\s_-]?key|bearer|token)';
const ALL_KEYWORDS_START = `(?<![\\p{L}\\p{N}])(?:${SUFFIX_KEYWORD}(?:['’]?\\p{L}+)?|${ALL_EXACT_KEYWORD}(?:['’]\\p{L}+)?)`;
const GLOBAL_KEYWORD_THEN_VALUE = new RegExp(`${ALL_KEYWORDS_START}\\s+["']?(\\S{6,})`, 'giu');
const GLOBAL_BARE_TOKEN_ASSIGNMENT = new RegExp(BARE_TOKEN_ASSIGNMENT.source, 'giu');

// A field that ENDS in a strict keyword (optionally followed by ":" or "="),
// used to relate a keyword in one field to a value in the next field.
const KEYWORD_AT_FIELD_END = new RegExp(`${STRICT_KEYWORD_START}["']?\\s*[:=]?\\s*$`, 'iu');

const KNOWN_TOKEN_SHAPES: RegExp[] = [
  /^(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}$/,
  /^gh[pousr]_[A-Za-z0-9]{20,}$/,
  /^AKIA[0-9A-Z]{16}$/,
  /^AIza[0-9A-Za-z_-]{35}$/,
  /^xox[abprs]-[A-Za-z0-9-]{10,}$/,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/,
];

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

function normalize(text: string): string {
  return text.replace(/İ/g, 'i');
}

function stripEdgePunctuation(value: string): string {
  return value.replace(/^[()[\]{}<>"'`.,;:!?]+|[()[\]{}<>"'`.,;:!?]+$/g, '');
}

function looksLikeCredentialValue(raw: string): boolean {
  const value = stripEdgePunctuation(raw);
  if (value.length < 6) return false;
  const hasLetter = /\p{L}/u.test(value);
  const hasDigit = /\d/.test(value);
  if (hasLetter && hasDigit) return true;
  if (/^\d+$/.test(value)) return true;
  return /[!@#$%^&*]/.test(value);
}

function looksLikeRandomToken(raw: string): boolean {
  const token = stripEdgePunctuation(raw);
  if (token.length < 20) return false;
  if (KNOWN_TOKEN_SHAPES.some((re) => re.test(token))) return true;
  if (/^[0-9a-f]{24,}$/i.test(token)) {
    const unique = new Set(token.toLowerCase());
    if (unique.size >= 4) return true;
  }
  // Long lowercase alphanumeric token (>= 24 chars, e.g. base32 or random strings with letters and digits)
  if (
    token.length >= 24 &&
    /^[a-z0-9]{24,}$/.test(token) &&
    /[a-z]/.test(token) &&
    /\d/.test(token)
  ) {
    const unique = new Set(token.toLowerCase());
    if (unique.size >= 4) return true;
  }
  // A long mixed-case alphanumeric run with digits: slugs and URLs are lowercase or contain ":".
  return (
    token.length >= 24 &&
    /^[A-Za-z0-9_+/=-]+$/.test(token) &&
    /[a-z]/.test(token) &&
    /[A-Z]/.test(token) &&
    /\d/.test(token)
  );
}

export function looksLikeSecret(text: string): boolean {
  if (!text) return false;
  const normalized = normalize(text);
  if (PRIVATE_KEY_BLOCK.test(normalized)) return true;
  if (STRICT_ASSIGNMENT.test(normalized)) return true;

  // Every occurrence is checked: a harmless first "pass through" must not
  // hide a later "secret <value>" in the same text.
  for (const match of normalized.matchAll(GLOBAL_BARE_TOKEN_ASSIGNMENT)) {
    if (looksLikeCredentialValue(match[1]) || looksLikeRandomToken(match[1])) return true;
  }

  for (const match of normalized.matchAll(GLOBAL_KEYWORD_THEN_VALUE)) {
    if (looksLikeCredentialValue(match[1]) || looksLikeRandomToken(match[1])) return true;
  }

  return normalized.split(/\s+/).some(looksLikeRandomToken);
}

export function looksLikeSecretInFields(...fields: unknown[]): boolean {
  const textStrings = fields
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map((f) => f.trim());

  if (textStrings.length === 0) return false;

  if (textStrings.some((t) => looksLikeSecret(t))) return true;

  if (textStrings.length > 1) {
    if (looksLikeSecret(textStrings.join(' '))) return true;
    if (looksLikeSecret(textStrings.join('\n'))) return true;

    // Keyword at the end of one field and a credential-looking value at the
    // start of the next ("Wifi password" + "hunter2x"). Joining with ": " was
    // too eager: "Boarding pass" + "Gate B12" became "pass: Gate B12".
    // Documented false negative: short values ("pin" + "4821") across fields.
    for (let i = 0; i < textStrings.length - 1; i++) {
      if (!KEYWORD_AT_FIELD_END.test(normalize(textStrings[i]))) continue;
      const firstToken = textStrings[i + 1].split(/\s+/)[0] ?? '';
      if (looksLikeCredentialValue(firstToken) || looksLikeRandomToken(firstToken)) return true;
    }
  }

  return false;
}
