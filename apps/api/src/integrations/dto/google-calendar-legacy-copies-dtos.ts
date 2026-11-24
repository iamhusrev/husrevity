import { Equals } from 'class-validator';

/**
 * `POST /integrations/google-calendar/legacy-copies/purge`. The purge hard-deletes data,
 * so it only runs with an explicit boolean `true` (a string, `false` or a missing body is a 400).
 */
export class PurgeLegacyCopiesRequestDto {
  @Equals(true, { message: 'confirm must be true' })
  confirm!: boolean;
}

export interface LegacyCopiesCountResponse {
  legacyCopyCount: number;
}

export interface PurgeLegacyCopiesResponse {
  deleted: number;
}
