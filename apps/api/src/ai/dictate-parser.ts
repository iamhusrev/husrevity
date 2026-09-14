import { ApiException } from '../common/api.exception';

const ITEM_MAX = 255;
const MAX_ITEMS = 30;

/**
 * Parse Gemini's JSON-mode output (`{"items": [...]}`) into a validated
 * string array. Defensive on every field so a malformed model response
 * can't reach the wire.
 */
export function parseDictatedItems(raw: string): string[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw ApiException.badRequest('AI returned malformed JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw ApiException.badRequest('AI did not return a JSON object.');
  }

  const rawItems = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(rawItems)) {
    throw ApiException.badRequest('AI response is missing an items array.');
  }

  const items: string[] = [];
  for (const row of rawItems) {
    if (typeof row !== 'string') continue;
    const trimmed = row.trim();
    if (!trimmed) continue;
    items.push(trimmed.slice(0, ITEM_MAX));
    if (items.length >= MAX_ITEMS) break;
  }

  if (items.length === 0) {
    throw ApiException.badRequest('AI returned no usable items.');
  }
  return items;
}
