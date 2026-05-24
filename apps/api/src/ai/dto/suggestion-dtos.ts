import { IsIn, IsOptional } from 'class-validator';

export type SuggestionMode = 'task' | 'hobby';
export type SuggestionKind = 'task' | 'hobby' | 'mixed';
export type SuggestionSourceType =
  | 'reminder'
  | 'task'
  | 'note'
  | 'plan'
  | 'project';

export class SuggestionsRequestDto {
  @IsIn(['task', 'hobby'])
  mode!: SuggestionMode;

  /** 1 or 3 suggestions. Defaults to 3. */
  @IsOptional()
  @IsIn([1, 3])
  count?: 1 | 3;
}

export class SuggestionSourceRefDto {
  type!: SuggestionSourceType;
  id!: string;
}

export class SuggestionItemDto {
  /** Short, actionable title (≤80 chars). */
  title!: string;

  /** One- or two-sentence elaboration (≤220 chars). */
  description!: string;

  /** task = something to get done; hobby = leisure; mixed = both flavors. */
  kind!: SuggestionKind;

  /** If derived from a real item the user already has, point to it. */
  sourceRef!: SuggestionSourceRefDto | null;

  /** Why this surfaced now — single short clause (≤120 chars). */
  reasonShort!: string;
}
