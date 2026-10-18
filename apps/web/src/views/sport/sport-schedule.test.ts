import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adherence,
  buildWeek,
  defaultIntensity,
  localISO,
  nextPlanned,
  programPhase,
  programWeek,
  programWindow,
  quickLogBody,
  sessionsForDay,
  streak,
  weekProgress,
  weekRange,
  weekdayIndex,
} from "./sport-schedule";
import { makeLog, makeProgram, makeSession } from "./sport-home.fixture";

// Calendar used below (local time): Mon 2026-10-05 is the program start,
// Sun 2026-11-01 is its last day (4 weeks), Thu 2026-10-15 is in week 2.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0);

describe("weekRange", () => {
  it("returns Monday..Sunday for a Monday", () => {
    expect(weekRange(d(2026, 10, 12))).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("returns the same week for the following Sunday", () => {
    expect(weekRange(d(2026, 10, 18))).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("crosses a month boundary", () => {
    // Thu 2026-10-29 lies in the week Mon 26 Oct .. Sun 1 Nov.
    expect(weekRange(d(2026, 10, 29))).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("does not depend on the time of day", () => {
    expect(weekRange(new Date(2026, 9, 12, 0, 30))).toEqual(
      weekRange(new Date(2026, 9, 12, 23, 30)),
    );
  });
});

describe("programWindow", () => {
  it("ends after weekCount weeks when endDate is null", () => {
    expect(programWindow(makeProgram())).toEqual({ start: "2026-10-05", end: "2026-11-01" });
  });

  it("lets an earlier endDate shorten the window", () => {
    expect(programWindow(makeProgram({ endDate: "2026-10-20" }))).toEqual({
      start: "2026-10-05",
      end: "2026-10-20",
    });
  });

  it("never runs past weekCount weeks even with a later endDate", () => {
    expect(programWindow(makeProgram({ endDate: "2026-12-31" })).end).toBe("2026-11-01");
  });

  it("is open ended without weekCount and endDate", () => {
    expect(programWindow(makeProgram({ weekCount: 0 })).end).toBeNull();
  });
});

describe("programWeek", () => {
  const program = makeProgram();

  it("is null before the start", () => {
    expect(programWeek(program, d(2026, 10, 4))).toBeNull();
  });

  it("is week 1 on the first day", () => {
    expect(programWeek(program, d(2026, 10, 5))).toEqual({ week: 1, total: 4 });
  });

  it("is week 2 on Thursday of the second week", () => {
    expect(programWeek(program, d(2026, 10, 15))).toEqual({ week: 2, total: 4 });
  });

  it("is the last week on the last day", () => {
    expect(programWeek(program, d(2026, 11, 1))).toEqual({ week: 4, total: 4 });
  });

  it("is null after the end", () => {
    expect(programWeek(program, d(2026, 11, 2))).toBeNull();
  });

  it("respects an earlier endDate", () => {
    const shorter = makeProgram({ endDate: "2026-10-20" });
    expect(programWeek(shorter, d(2026, 10, 20))).toEqual({ week: 3, total: 4 });
    expect(programWeek(shorter, d(2026, 10, 21))).toBeNull();
  });

  it("accepts an ISO date string", () => {
    expect(programWeek(program, "2026-10-12")).toEqual({ week: 2, total: 4 });
  });
});

describe("programPhase", () => {
  const program = makeProgram();

  it("is upcoming before the start", () => {
    expect(programPhase(program, d(2026, 10, 4))).toBe("upcoming");
  });

  it("is running from the first to the last day", () => {
    expect(programPhase(program, d(2026, 10, 5))).toBe("running");
    expect(programPhase(program, d(2026, 11, 1))).toBe("running");
  });

  it("is ended after the last day", () => {
    expect(programPhase(program, d(2026, 11, 2))).toBe("ended");
  });

  it("stays running forever for an open ended program", () => {
    expect(programPhase(makeProgram({ weekCount: 0 }), d(2030, 1, 1))).toBe("running");
  });
});

describe("weekdayIndex", () => {
  // The API and the `sport.day` i18n keys count 0 = Monday ... 6 = Sunday,
  // while JS Date#getDay() counts 0 = Sunday.
  it("maps Monday to 0", () => {
    expect(weekdayIndex(new Date(2026, 9, 12))).toBe(0); // 2026-10-12 is a Monday
  });

  it("maps Sunday to 6", () => {
    expect(weekdayIndex(new Date(2026, 9, 18))).toBe(6); // 2026-10-18 is a Sunday
  });

  it("maps Wednesday to 2", () => {
    expect(weekdayIndex(new Date(2026, 9, 14))).toBe(2);
  });
});

describe("localISO", () => {
  it("formats YYYY-MM-DD with zero padding", () => {
    expect(localISO(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  // toISOString() converts to UTC first, so late/early local hours land on the
  // neighbouring UTC day. The local calendar day must be kept.
  it("keeps the local day for a time of 23:30", () => {
    expect(localISO(new Date(2026, 9, 12, 23, 30))).toBe("2026-10-12");
  });

  it("keeps the local day for a time of 00:30", () => {
    expect(localISO(new Date(2026, 9, 12, 0, 30))).toBe("2026-10-12");
  });
});

describe("sessionsForDay", () => {
  it("returns the sessions planned on that weekday sorted by position", () => {
    const program = makeProgram({
      sessions: [
        makeSession({ id: "b", plannedDayOfWeek: 0, position: 2 }),
        makeSession({ id: "c", plannedDayOfWeek: 2, position: 0 }),
        makeSession({ id: "a", plannedDayOfWeek: 0, position: 1 }),
      ],
    });
    expect(sessionsForDay(program, 0).map((s) => s.id)).toEqual(["a", "b"]);
    expect(sessionsForDay(program, 2).map((s) => s.id)).toEqual(["c"]);
    expect(sessionsForDay(program, 6)).toEqual([]);
  });

  it("is empty without a program", () => {
    expect(sessionsForDay(null, 0)).toEqual([]);
  });
});

describe("buildWeek", () => {
  // Week 2 of the program: Mon 12 .. Sun 18 October 2026, today = Thu 15.
  const program = makeProgram();
  const today = d(2026, 10, 15);
  const byDate = (week: ReturnType<typeof buildWeek>, iso: string) =>
    week.find((w) => w.date === iso)!;

  it("returns Monday..Sunday of the week containing today", () => {
    const week = buildWeek(program, [], today);
    expect(week.map((w) => w.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(week.map((w) => w.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("flags today with isToday and nothing else", () => {
    const week = buildWeek(program, [], today);
    expect(week.map((w) => w.isToday)).toEqual([false, false, false, true, false, false, false]);
  });

  it("is done when every planned session of the day has a completed log", () => {
    const week = buildWeek(
      program,
      [makeLog({ sessionId: "run", executedDate: "2026-10-12" })],
      today,
    );
    const monday = byDate(week, "2026-10-12");
    expect(monday.state).toBe("done");
    expect(monday.sessions.map((s) => s.id)).toEqual(["run"]);
    expect(monday.logs).toHaveLength(1);
  });

  it("is skipped when a log with completed:false exists", () => {
    const week = buildWeek(
      program,
      [makeLog({ sessionId: "strength", executedDate: "2026-10-14", completed: false })],
      today,
    );
    expect(byDate(week, "2026-10-14").state).toBe("skipped");
  });

  it("is missed for a past planned day without a log", () => {
    const week = buildWeek(program, [], today);
    expect(byDate(week, "2026-10-12").state).toBe("missed");
    expect(byDate(week, "2026-10-14").state).toBe("missed");
  });

  it("is planned for a future planned day", () => {
    const week = buildWeek(program, [], today);
    expect(byDate(week, "2026-10-16").state).toBe("planned");
  });

  it("is rest on a day without sessions, even with a free workout logged", () => {
    const week = buildWeek(
      program,
      [makeLog({ sessionId: null, executedDate: "2026-10-13", actualDuration: 20 })],
      today,
    );
    const tuesday = byDate(week, "2026-10-13");
    expect(tuesday.state).toBe("rest");
    expect(tuesday.logs).toHaveLength(1);
  });

  it("keeps today's own state next to the isToday flag", () => {
    const withThursday = makeProgram({
      sessions: [...program.sessions, makeSession({ id: "swim", plannedDayOfWeek: 3 })],
    });
    expect(byDate(buildWeek(program, [], today), "2026-10-15")).toMatchObject({
      isToday: true,
      state: "rest",
    });
    expect(byDate(buildWeek(withThursday, [], today), "2026-10-15")).toMatchObject({
      isToday: true,
      state: "planned",
    });
    expect(
      byDate(
        buildWeek(
          withThursday,
          [makeLog({ sessionId: "swim", executedDate: "2026-10-15" })],
          today,
        ),
        "2026-10-15",
      ),
    ).toMatchObject({ isToday: true, state: "done" });
  });

  it("treats days outside the program window as rest", () => {
    // Week of Mon 28 Sep .. Sun 4 Oct lies entirely before the start.
    const before = buildWeek(program, [], d(2026, 10, 2));
    expect(before.every((w) => w.state === "rest")).toBe(true);
    expect(before.every((w) => w.sessions.length === 0)).toBe(true);
    // Week of Mon 2 Nov lies entirely after the end.
    const after = buildWeek(program, [], d(2026, 11, 3));
    expect(after.every((w) => w.state === "rest")).toBe(true);
  });

  it("marks only the in-window days of a week that crosses the end", () => {
    const shorter = makeProgram({ endDate: "2026-10-14" }); // ends on Wednesday
    const week = buildWeek(shorter, [], d(2026, 10, 16));
    expect(byDate(week, "2026-10-12").state).toBe("missed");
    expect(byDate(week, "2026-10-16").state).toBe("rest");
  });

  it("needs every session of a two-session day to be done", () => {
    const twoOnMonday = makeProgram({
      sessions: [
        ...program.sessions,
        makeSession({ id: "mobility", plannedDayOfWeek: 0, position: 5, plannedDuration: 20 }),
      ],
    });
    const onlyRun = [makeLog({ sessionId: "run", executedDate: "2026-10-12" })];
    const monday = byDate(buildWeek(twoOnMonday, onlyRun, today), "2026-10-12");
    expect(monday.sessions.map((s) => s.id)).toEqual(["run", "mobility"]);
    expect(monday.state).toBe("missed");

    const both = [...onlyRun, makeLog({ sessionId: "mobility", executedDate: "2026-10-12" })];
    expect(byDate(buildWeek(twoOnMonday, both, today), "2026-10-12").state).toBe("done");
  });

  it("ignores logs of other days and other sessions", () => {
    const week = buildWeek(
      program,
      [
        makeLog({ sessionId: "run", executedDate: "2026-10-05" }),
        makeLog({ sessionId: "yoga", executedDate: "2026-10-12" }),
      ],
      today,
    );
    expect(byDate(week, "2026-10-12").state).toBe("missed");
  });

  it("is all rest without a program but still flags today", () => {
    const week = buildWeek(null, [], today);
    expect(week.every((w) => w.state === "rest")).toBe(true);
    expect(byDate(week, "2026-10-15").isToday).toBe(true);
  });
});

describe("adherence", () => {
  const program = makeProgram();

  it("counts planned sessions from the start up to and including today", () => {
    // Planned so far on Thu 15: Mon 5, Wed 7, Fri 9, Mon 12, Wed 14.
    const logs = [
      makeLog({ sessionId: "run", executedDate: "2026-10-05" }),
      makeLog({ sessionId: "strength", executedDate: "2026-10-07" }),
      makeLog({ sessionId: "strength", executedDate: "2026-10-14" }),
      makeLog({ sessionId: "run", executedDate: "2026-10-12", completed: false }),
    ];
    expect(adherence(program, logs, d(2026, 10, 15))).toEqual({ done: 3, planned: 5, ratio: 0.6 });
  });

  it("includes a session planned today once it is logged", () => {
    const logs = [makeLog({ sessionId: "strength", executedDate: "2026-10-14" })];
    // Planned up to and including Wed 14: Mon 5, Wed 7, Fri 9, Mon 12, Wed 14.
    expect(adherence(program, logs, d(2026, 10, 14))).toEqual({ done: 1, planned: 5, ratio: 0.2 });
  });

  it("is zero before the start", () => {
    expect(adherence(program, [], d(2026, 10, 1))).toEqual({ done: 0, planned: 0, ratio: 0 });
  });

  it("stops counting at the end of the program", () => {
    expect(adherence(program, [], d(2027, 1, 1)).planned).toBe(12);
  });
});

describe("streak", () => {
  const program = makeProgram();

  it("counts consecutive done planned days backwards, rest days do not break it", () => {
    const logs = [
      makeLog({ sessionId: "strength", executedDate: "2026-10-14" }),
      makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
      makeLog({ sessionId: "yoga", executedDate: "2026-10-09" }),
    ];
    // Thu 15: Wed 14 done, Tue 13 rest, Mon 12 done, Sun/Sat rest, Fri 9 done, Wed 7 missed.
    expect(streak(program, logs, d(2026, 10, 15))).toBe(3);
  });

  it("is broken by a missed day", () => {
    const logs = [
      makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
      makeLog({ sessionId: "yoga", executedDate: "2026-10-09" }),
    ];
    expect(streak(program, logs, d(2026, 10, 15))).toBe(0);
  });

  it("is broken by a skipped day", () => {
    const logs = [
      makeLog({ sessionId: "strength", executedDate: "2026-10-14", completed: false }),
      makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
    ];
    expect(streak(program, logs, d(2026, 10, 15))).toBe(0);
  });

  it("counts today when it is already done", () => {
    const logs = [
      makeLog({ sessionId: "strength", executedDate: "2026-10-14" }),
      makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
    ];
    expect(streak(program, logs, d(2026, 10, 14))).toBe(2);
  });

  it("does not break on a today that is not done yet", () => {
    const logs = [
      makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
      makeLog({ sessionId: "yoga", executedDate: "2026-10-09" }),
    ];
    expect(streak(program, logs, d(2026, 10, 14))).toBe(2);
  });

  it("is zero before the start", () => {
    expect(streak(program, [], d(2026, 10, 1))).toBe(0);
  });
});

describe("defaultIntensity", () => {
  it("maps EASY 4, MODERATE 6, HARD 8", () => {
    expect(defaultIntensity("EASY")).toBe(4);
    expect(defaultIntensity("MODERATE")).toBe(6);
    expect(defaultIntensity("HARD")).toBe(8);
  });
});

describe("quickLogBody", () => {
  afterEach(() => vi.useRealTimers());

  it("builds the planned-session log body for the given date", () => {
    const session = makeSession({ id: "run", plannedDuration: 30, difficulty: "MODERATE" });
    expect(quickLogBody(session, { executedDate: "2026-10-12", completed: false })).toEqual({
      sessionId: "run",
      executedDate: "2026-10-12",
      actualDuration: 30,
      completed: false,
      intensity: 6,
    });
  });

  it("defaults to local today and completed:true", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 12, 23, 30));
    const session = makeSession({ id: "yoga", plannedDuration: 60, difficulty: "EASY" });
    expect(quickLogBody(session)).toEqual({
      sessionId: "yoga",
      executedDate: "2026-10-12",
      actualDuration: 60,
      completed: true,
      intensity: 4,
    });
  });
});

describe("nextPlanned", () => {
  const program = makeProgram();

  it("finds the next day with a planned session after the given date", () => {
    expect(nextPlanned(program, "2026-10-13")).toMatchObject({
      date: "2026-10-14",
      session: { id: "strength" },
    });
  });

  it("wraps into the next week and stops at the end of the program", () => {
    expect(nextPlanned(program, "2026-10-16")).toMatchObject({ date: "2026-10-19" });
    expect(nextPlanned(program, "2026-10-30")).toBeNull();
  });

  it("is null without a program", () => {
    expect(nextPlanned(null, "2026-10-13")).toBeNull();
  });
});

describe("weekProgress", () => {
  it("counts the sessions of the week and those with a completed log", () => {
    const program = makeProgram();
    const logs = [
      makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
      makeLog({ sessionId: "strength", executedDate: "2026-10-14", completed: false }),
    ];
    expect(weekProgress(buildWeek(program, logs, "2026-10-15"))).toEqual({ done: 1, planned: 3 });
  });

  it("is 0/0 for a week without planned sessions", () => {
    expect(weekProgress(buildWeek(null, [], "2026-10-15"))).toEqual({ done: 0, planned: 0 });
  });
});
