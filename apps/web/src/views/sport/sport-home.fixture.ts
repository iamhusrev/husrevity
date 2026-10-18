// Shared fixtures for the sport "Today" home tests. All dates are local and
// fixed: the program starts on Monday 2026-10-05 and runs four weeks, so its
// last day is Sunday 2026-11-01. Thursday 2026-10-15 is in week 2.
import type {
  SportLogResponse,
  SportProgramResponse,
  SportSessionResponse,
} from "@/types/sport/sport";

export const PROGRAM_START = "2026-10-05";

let sessionSeq = 0;

export function makeSession(overrides: Partial<SportSessionResponse> = {}): SportSessionResponse {
  sessionSeq += 1;
  return {
    id: `s${sessionSeq}`,
    programId: "p1",
    activityType: "RUNNING",
    location: "DIS",
    name: `Session ${sessionSeq}`,
    plannedDayOfWeek: 0,
    plannedDuration: 30,
    difficulty: "MODERATE",
    description: "",
    position: sessionSeq,
    createdAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

/** Monday "Run" (30 min, MODERATE), Wednesday "Strength" (45, HARD), Friday "Yoga" (60, EASY). */
export function makeProgram(overrides: Partial<SportProgramResponse> = {}): SportProgramResponse {
  return {
    id: "p1",
    ownerId: "u1",
    name: "Base Program",
    description: null,
    weekCount: 4,
    programType: "WEEKLY",
    aiGenerated: false,
    startDate: PROGRAM_START,
    endDate: null,
    isActive: true,
    sessions: [
      makeSession({
        id: "run",
        name: "Run",
        plannedDayOfWeek: 0,
        plannedDuration: 30,
        difficulty: "MODERATE",
        position: 0,
        description:
          "🔥 ISINMA\n- 5 dk yürüyüş\n\n💪 ANA BÖLÜM\n- 20 dk tempo koşu\n- 3x100m\n\n📌 Notlar\n- Nabız 150 altı",
      }),
      makeSession({
        id: "strength",
        name: "Strength",
        plannedDayOfWeek: 2,
        plannedDuration: 45,
        difficulty: "HARD",
        position: 1,
        activityType: "STRENGTH",
        location: "SALON",
      }),
      makeSession({
        id: "yoga",
        name: "Yoga",
        plannedDayOfWeek: 4,
        plannedDuration: 60,
        difficulty: "EASY",
        position: 2,
        activityType: "YOGA",
        location: "EV",
      }),
    ],
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

let logSeq = 0;

export function makeLog(overrides: Partial<SportLogResponse> = {}): SportLogResponse {
  logSeq += 1;
  return {
    id: `log${logSeq}`,
    sessionId: "run",
    executedDate: PROGRAM_START,
    actualDuration: 30,
    completed: true,
    intensity: 6,
    notes: null,
    caloriesBurned: null,
    createdAt: "2026-10-05T10:00:00Z",
    ...overrides,
  };
}
