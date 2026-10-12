import { DateTime } from 'luxon';
import { ItemKind } from '../../item/item.entity';
import { isValidNumericId } from '../../change-set/change-set.service';
import { ItemRequestDto } from '../../item/dto/item-dtos';
import { looksLikeSecret, looksLikeSecretInFields } from './secret-guard';

export const ISTANBUL_ZONE = 'Europe/Istanbul';

export const MAX_TITLE_LENGTH = 255;
export const MAX_NOTES_LENGTH = 10_000;
export const MAX_CONTEXT_LENGTH = 32;
export const MAX_DURATION_MIN = 10_080; // one week

export const SECRETS_REFUSED_MESSAGE =
  'This text looks like a password, API key, token or other secret. Secrets are not stored through MCP; remove the secret value and try again.';

const KINDS: ItemKind[] = ['task', 'event', 'log'];

/**
 * Parses an ISO 8601 instant. A value that carries an offset or `Z` keeps it; a value without one
 * (including a bare date) is read as Europe/Istanbul wall time. Returns UTC ISO, or null if invalid.
 */
export function normalizeInstant(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = DateTime.fromISO(value.trim(), { zone: ISTANBUL_ZONE });
  if (!parsed.isValid) return null;
  return parsed.toUTC().toISO();
}

export interface ItemFieldInput {
  kind?: unknown;
  title?: unknown;
  notes?: unknown;
  dueAt?: unknown;
  scheduledAt?: unknown;
  durationMin?: unknown;
  projectId?: unknown;
  goalId?: unknown;
  context?: unknown;
}

export interface ValidatedItemFields {
  errors: string[];
  fields: Partial<ItemRequestDto>;
}

/**
 * Validates and normalizes the item fields shared by `capture` and `apply_plan`. Only keys that are
 * present (not `undefined`) end up in `fields`; `null` is kept for nullable fields so an update can
 * clear them. Never throws: problems come back in `errors`.
 */
export function validateItemFields(
  input: ItemFieldInput,
  options: { requireTitle: boolean; allowNull: boolean; allowKind: boolean },
): ValidatedItemFields {
  const errors: string[] = [];
  const fields: Partial<ItemRequestDto> = {};
  const isNullAllowed = (v: unknown) => options.allowNull && v === null;

  if (input.kind !== undefined) {
    if (!options.allowKind) errors.push('kind cannot be changed by an update');
    else if (typeof input.kind !== 'string' || !KINDS.includes(input.kind as ItemKind)) {
      errors.push(`kind must be one of ${KINDS.join(', ')}`);
    } else fields.kind = input.kind as ItemKind;
  }

  if (input.title === undefined) {
    if (options.requireTitle) errors.push('title is required');
  } else if (typeof input.title !== 'string' || !input.title.trim()) {
    errors.push('title must be a non-blank string');
  } else if (input.title.trim().length > MAX_TITLE_LENGTH) {
    errors.push(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  } else {
    fields.title = input.title.trim();
  }

  if (input.notes !== undefined) {
    if (isNullAllowed(input.notes)) fields.notes = null;
    else if (typeof input.notes !== 'string') errors.push('notes must be a string');
    else if (input.notes.length > MAX_NOTES_LENGTH) {
      errors.push(`notes must be at most ${MAX_NOTES_LENGTH} characters`);
    } else fields.notes = input.notes;
  }

  if (input.context !== undefined) {
    if (isNullAllowed(input.context)) fields.context = null;
    else if (typeof input.context !== 'string' || !input.context.trim()) {
      errors.push('context must be a non-blank string');
    } else if (input.context.trim().length > MAX_CONTEXT_LENGTH) {
      errors.push(`context must be at most ${MAX_CONTEXT_LENGTH} characters`);
    } else fields.context = input.context.trim();
  }

  if (input.projectId !== undefined) {
    if (isNullAllowed(input.projectId)) fields.projectId = null;
    else if (!isValidNumericId(input.projectId)) {
      errors.push('projectId must be a numeric ID (1-19 digits)');
    } else fields.projectId = input.projectId;
  }

  if (input.goalId !== undefined) {
    if (isNullAllowed(input.goalId)) fields.goalId = null;
    else if (!isValidNumericId(input.goalId)) {
      errors.push('goalId must be a numeric ID (1-19 digits)');
    } else fields.goalId = input.goalId;
  }

  for (const key of ['scheduledAt', 'dueAt'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (isNullAllowed(value)) {
      fields[key] = null;
      continue;
    }
    const normalized = normalizeInstant(value);
    if (!normalized) errors.push(`${key} must be a valid ISO 8601 date-time`);
    else fields[key] = normalized;
  }

  if (input.durationMin !== undefined) {
    if (isNullAllowed(input.durationMin)) fields.durationMin = null;
    else if (
      typeof input.durationMin !== 'number' ||
      !Number.isInteger(input.durationMin) ||
      input.durationMin < 0 ||
      input.durationMin > MAX_DURATION_MIN
    ) {
      errors.push(`durationMin must be an integer between 0 and ${MAX_DURATION_MIN}`);
    } else fields.durationMin = input.durationMin;
  }

  if (looksLikeSecretInFields(fields.title, fields.notes, fields.context)) {
    errors.push(SECRETS_REFUSED_MESSAGE);
  }

  return { errors, fields };
}
