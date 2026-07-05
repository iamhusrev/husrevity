import { ApiException } from '../common/api.exception';
import {
  ACTIVITY_TYPES,
  ActivityType,
  SESSION_DIFFICULTIES,
  SESSION_LOCATIONS,
  SessionDifficulty,
  SessionLocation,
} from './dto/sport-session.dto';

export type ParsedAiSession = {
  activityType: ActivityType;
  location: SessionLocation;
  name: string;
  dayOfWeek: number;
  duration: number;
  difficulty: SessionDifficulty;
  description: string;
};

export type ParsedAiWeek = {
  weekNumber: number;
  sessions: ParsedAiSession[];
};

const NAME_MAX = 120;
const DESCRIPTION_MAX = 4000;
const DEFAULT_DURATION = 30;

/**
 * Parses Gemini's JSON-mode program-generation output into validated
 * {@link ParsedAiWeek}[]. Defensive on every field so a malformed model
 * response can never reach the database — invalid sessions are dropped,
 * invalid enum values fall back to a safe default rather than failing.
 */
export function parseAiProgram(raw: string): ParsedAiWeek[] {
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
    throw ApiException.badRequest('AI did not return a JSON array of weeks.');
  }

  const weeks: ParsedAiWeek[] = [];
  (parsed as unknown[]).forEach((weekRaw, weekIndex) => {
    if (!weekRaw || typeof weekRaw !== 'object') return;
    const weekRec = weekRaw as Record<string, unknown>;

    const weekNumber =
      typeof weekRec.weekNumber === 'number' && Number.isFinite(weekRec.weekNumber)
        ? weekRec.weekNumber
        : weekIndex + 1;

    const sessionsRaw = Array.isArray(weekRec.sessions) ? weekRec.sessions : [];
    const sessions: ParsedAiSession[] = [];
    for (const sessionRaw of sessionsRaw as unknown[]) {
      if (!sessionRaw || typeof sessionRaw !== 'object') continue;
      const rec = sessionRaw as Record<string, unknown>;

      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      const description = typeof rec.description === 'string' ? rec.description.trim() : '';
      if (!name || !description) continue;

      const activityTypeRaw = typeof rec.activityType === 'string' ? rec.activityType.toUpperCase() : '';
      const activityType: ActivityType = (ACTIVITY_TYPES as readonly string[]).includes(
        activityTypeRaw,
      )
        ? (activityTypeRaw as ActivityType)
        : 'CUSTOM';

      const locationRaw = typeof rec.location === 'string' ? rec.location.toUpperCase() : '';
      const location: SessionLocation = (SESSION_LOCATIONS as readonly string[]).includes(
        locationRaw,
      )
        ? (locationRaw as SessionLocation)
        : 'EV';

      const difficultyRaw = typeof rec.difficulty === 'string' ? rec.difficulty.toUpperCase() : '';
      const difficulty: SessionDifficulty = (SESSION_DIFFICULTIES as readonly string[]).includes(
        difficultyRaw,
      )
        ? (difficultyRaw as SessionDifficulty)
        : 'MODERATE';

      const dayOfWeekRaw = typeof rec.dayOfWeek === 'number' ? rec.dayOfWeek : Number(rec.dayOfWeek);
      const dayOfWeek = Number.isFinite(dayOfWeekRaw)
        ? Math.min(6, Math.max(0, Math.trunc(dayOfWeekRaw)))
        : 0;

      const durationRaw = typeof rec.duration === 'number' ? rec.duration : Number(rec.duration);
      const duration =
        Number.isFinite(durationRaw) && durationRaw > 0
          ? Math.trunc(durationRaw)
          : DEFAULT_DURATION;

      sessions.push({
        activityType,
        location,
        name: name.slice(0, NAME_MAX),
        dayOfWeek,
        duration,
        difficulty,
        description: description.slice(0, DESCRIPTION_MAX),
      });
    }

    if (sessions.length) weeks.push({ weekNumber, sessions });
  });

  if (weeks.length === 0) {
    throw ApiException.badRequest('AI returned no usable workout sessions.');
  }
  return weeks;
}
