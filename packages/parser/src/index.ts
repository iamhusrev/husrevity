import { DateTime } from 'luxon';
import {
  WEEKDAY_CODES,
  extractContext,
  extractPriority,
  extractProjectRef,
  extractRecurrence,
  extractTime,
} from './tokens';

const ISTANBUL = 'Europe/Istanbul';
const DEFAULT_HOUR = 9;

export interface ParsedDraft {
  title: string;
  scheduledAt?: string;
  context?: string;
  projectRef?: string;
  priority?: string;
  rrule?: string;
}

export interface ParseQuickAddOptions {
  /**
   * Called only when NO rule matched anything at all (title is unchanged
   * and every other field is unset). The caller supplies this — the
   * parser package itself has no LLM dependency of its own. Its result is
   * merged onto the (empty) rule result; the merged draft is still always
   * meant to be previewed by the user before creating anything, never
   * auto-applied.
   */
  llmFallback?: (text: string) => Promise<Partial<ParsedDraft>>;
}

function stripToken(text: string, match: RegExpMatchArray): string {
  return text.replace(match[0], '').replace(/\s+/g, ' ').trim();
}

function isFullyUnresolved(original: string, draft: ParsedDraft): boolean {
  return (
    draft.title === original.trim() &&
    draft.scheduledAt === undefined &&
    draft.context === undefined &&
    draft.projectRef === undefined &&
    draft.priority === undefined &&
    draft.rrule === undefined
  );
}

/**
 * Rule-first Turkish natural-language quick-add parser. Recognizes, in
 * order: recurrence ("her gün", "her pzt" → rrule), a one-off date word
 * ("bugün", "yarın", a weekday code) when there's no recurrence, a
 * time-of-day token (9da, 14:30), #context / @proje tags, and priority
 * (!yüksek). If every rule misses and an `llmFallback` is supplied, it's
 * awaited and merged in — otherwise unmatched text just stays the title.
 *
 * scheduledAt defaults to 09:00 Europe/Istanbul when a date/recurrence
 * token matches but no explicit time does.
 */
export async function parseQuickAdd(
  text: string,
  opts?: ParseQuickAddOptions,
): Promise<ParsedDraft> {
  const draft = parseRules(text);
  if (opts?.llmFallback && isFullyUnresolved(text, draft)) {
    const fallback = await opts.llmFallback(text);
    return { ...draft, ...fallback };
  }
  return draft;
}

function parseRules(text: string): ParsedDraft {
  const now = DateTime.now().setZone(ISTANBUL);
  let title = text.trim();
  let target: DateTime | null = null;

  const recurrenceResult = extractRecurrence(title);
  title = recurrenceResult.rest;

  if (recurrenceResult.value) {
    target = recurrenceResult.value.weekday
      ? nearestWeekday(now, recurrenceResult.value.weekday)
      : now;
  } else {
    const bugun = title.match(/\bbugün\b/i);
    const yarin = title.match(/\byarın\b/i);
    // Not \b(...)\b — "çar" starts with a non-ASCII letter, and JS's \b is
    // ASCII-word-boundary-only regardless of the /u flag, so \b silently
    // fails to match right before it. This lookaround is Unicode-correct.
    const weekday = title.match(/(?<![\p{L}\p{N}_])(pzt|sal|çar|per|cum|cmt|paz)(?![\p{L}\p{N}_])/iu);
    if (bugun) {
      target = now;
      title = stripToken(title, bugun);
    } else if (yarin) {
      target = now.plus({ days: 1 });
      title = stripToken(title, yarin);
    } else if (weekday) {
      target = nearestWeekday(now, WEEKDAY_CODES[weekday[1].toLowerCase()]);
      title = stripToken(title, weekday);
    }
  }

  const timeResult = extractTime(title);
  title = timeResult.rest;
  if (timeResult.value) {
    target = (target ?? now).set({ hour: timeResult.value.hour, minute: timeResult.value.minute });
  }

  const contextResult = extractContext(title);
  title = contextResult.rest;
  const projectResult = extractProjectRef(title);
  title = projectResult.rest;
  const priorityResult = extractPriority(title);
  title = priorityResult.rest;

  const draft: ParsedDraft = { title };
  if (contextResult.value) draft.context = contextResult.value;
  if (projectResult.value) draft.projectRef = projectResult.value;
  if (priorityResult.value) draft.priority = priorityResult.value;
  if (recurrenceResult.value) draft.rrule = recurrenceResult.value.rrule;

  if (target) {
    if (!timeResult.value) target = target.set({ hour: DEFAULT_HOUR, minute: 0 });
    const scheduledAt = target.set({ second: 0, millisecond: 0 }).toUTC().toISO();
    if (scheduledAt) draft.scheduledAt = scheduledAt;
  }

  return draft;
}

/** The nearest date on/after `from` whose weekday matches `code` (1=Mon..7=Sun), inclusive of `from` itself. */
function nearestWeekday(from: DateTime, code: number): DateTime {
  let d = from;
  while (d.weekday !== code) d = d.plus({ days: 1 });
  return d;
}
