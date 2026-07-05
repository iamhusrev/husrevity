// Sport module types — mirrors the NestJS contract exactly (apps/api/src/sport/dto/*).
// The API is the source of truth; enum values below match the backend's
// uppercase string constants verbatim (do not "prettify" to lowercase).

export const FITNESS_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export const ACTIVITY_TYPES = [
  "RUNNING",
  "YOGA",
  "SWIMMING",
  "STRENGTH",
  "GYM",
  "CYCLING",
  "FOOTBALL",
  "CUSTOM",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const SPORT_LOCATIONS = ["EV", "SALON", "YÜZME", "DIS"] as const;
export type SportLocation = (typeof SPORT_LOCATIONS)[number];

export const DIFFICULTIES = ["EASY", "MODERATE", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const PROGRAM_TYPES = ["WEEKLY", "MONTHLY"] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

// ─── Profile ────────────────────────────────────────────────────────────────

export interface SportProfileResponse {
  id: string;
  fitnessLevel: FitnessLevel;
  weeklyHours: number;
  preferredActivities: string[];
  goals: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SportProfileRequest {
  fitnessLevel?: FitnessLevel;
  weeklyHours?: number;
  preferredActivities?: string[];
  goals?: string | null;
  notes?: string | null;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export interface SportSessionResponse {
  id: string;
  programId: string | null;
  activityType: ActivityType;
  location: SportLocation;
  name: string;
  plannedDayOfWeek: number;
  plannedDuration: number;
  difficulty: Difficulty;
  description: string;
  position: number;
  createdAt: string;
}

export interface SportSessionRequest {
  programId?: string;
  activityType: ActivityType;
  location: SportLocation;
  name: string;
  plannedDayOfWeek: number;
  plannedDuration: number;
  difficulty: Difficulty;
  description: string;
}

export interface SportSessionUpdateRequest {
  activityType?: ActivityType;
  location?: SportLocation;
  name?: string;
  plannedDayOfWeek?: number;
  plannedDuration?: number;
  difficulty?: Difficulty;
  description?: string;
}

export interface SportSessionReorderItem {
  id: string;
  position: number;
}

// ─── Programs ───────────────────────────────────────────────────────────────

export interface SportProgramResponse {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  weekCount: number;
  programType: ProgramType;
  aiGenerated: boolean;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  sessions: SportSessionResponse[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SportProgramRequest {
  name: string;
  description?: string | null;
  weekCount: number;
  programType: ProgramType;
  startDate: string;
  endDate?: string | null;
  aiGenerated?: boolean;
}

export interface SportProgramUpdateRequest {
  name?: string;
  description?: string | null;
  weekCount?: number;
  programType?: ProgramType;
  startDate?: string;
  endDate?: string | null;
  aiGenerated?: boolean;
}

export interface GenerateAiProgramRequest {
  weekCount: number;
  activityPreferences: string[];
  targetWeeklyHours: number;
}

// ─── Logs ───────────────────────────────────────────────────────────────────

export interface SportLogResponse {
  id: string;
  sessionId: string | null;
  executedDate: string;
  actualDuration: number;
  completed: boolean;
  intensity: number;
  notes: string | null;
  caloriesBurned: number | null;
  createdAt: string;
}

export interface SportLogRequest {
  sessionId?: string | null;
  executedDate: string;
  actualDuration: number;
  completed: boolean;
  intensity: number;
  notes?: string | null;
  caloriesBurned?: number | null;
}

export interface SportLogUpdateRequest {
  sessionId?: string | null;
  executedDate?: string;
  actualDuration?: number;
  completed?: boolean;
  intensity?: number;
  notes?: string | null;
  caloriesBurned?: number | null;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export interface WeeklyTrendEntry {
  weekStart: string;
  hoursCompleted: number;
}

export interface SportStatsResponse {
  totalCompleted: number;
  avgDuration: number;
  totalHours: number;
  activityBreakdown: Record<string, number>;
  intensityDist: Record<string, number>;
  weeklyTrend: WeeklyTrendEntry[];
}
