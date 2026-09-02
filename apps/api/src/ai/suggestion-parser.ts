import { ApiException } from '../common/api.exception';
import {
  SuggestionItemDto,
  SuggestionKind,
  SuggestionSourceType,
} from './dto/suggestion-dtos';

/**
 * Pre-built id whitelist for sourceRef validation. Keys are `${type}:${id}`,
 * e.g. `"note:42"`. Anything the LLM puts in a sourceRef must hit this set,
 * or the ref is dropped — protects against the model inventing ids.
 */
export type ParseContext = {
  validIds: Set<string>;
};

const KINDS = ['task', 'hobby', 'mixed'] as const;
const SOURCE_TYPES = [
  'reminder',
  'task',
  'note',
  'project',
] as const;

const TITLE_MAX = 120;
const DESC_MAX = 280;
const REASON_MAX = 160;

/**
 * Parse Gemini's JSON-mode output into validated SuggestionItemDto[].
 * Defensive on every field so a malformed model response can't reach the wire.
 */
export function parseSuggestions(
  raw: string,
  count: 1 | 3,
  ctx: ParseContext,
): SuggestionItemDto[] {
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

  if (!Array.isArray(parsed)) {
    throw ApiException.badRequest('AI did not return a JSON array.');
  }

  const items: SuggestionItemDto[] = [];
  for (const row of parsed as unknown[]) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;

    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const description =
      typeof rec.description === 'string' ? rec.description.trim() : '';
    if (!title || !description) continue;

    const kindRaw = typeof rec.kind === 'string' ? rec.kind : '';
    const kind: SuggestionKind = (KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as SuggestionKind)
      : 'mixed';

    const reasonShort =
      typeof rec.reasonShort === 'string' ? rec.reasonShort.trim() : '';

    let sourceRef: SuggestionItemDto['sourceRef'] = null;
    const refRaw = rec.sourceRef;
    if (refRaw && typeof refRaw === 'object') {
      const ref = refRaw as Record<string, unknown>;
      const type = typeof ref.type === 'string' ? ref.type : '';
      const id = typeof ref.id === 'string' ? ref.id : '';
      if (
        id &&
        (SOURCE_TYPES as readonly string[]).includes(type) &&
        ctx.validIds.has(`${type}:${id}`)
      ) {
        sourceRef = { type: type as SuggestionSourceType, id };
      }
    }

    items.push({
      title: title.slice(0, TITLE_MAX),
      description: description.slice(0, DESC_MAX),
      kind,
      sourceRef,
      reasonShort: reasonShort.slice(0, REASON_MAX),
    });

    if (items.length >= count) break;
  }

  if (items.length === 0) {
    throw ApiException.badRequest('AI returned no usable suggestions.');
  }
  return items;
}
