import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import SportGlance from "./SportGlance";
import { buildWeek } from "./sport-schedule";
import { makeLog, makeProgram } from "./sport-home.fixture";
import { trUseTranslation } from "./sport-test-i18n";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return { ...actual, useTranslation: () => trUseTranslation() };
});

afterEach(cleanup);

describe("SportGlance", () => {
  it("shows this week's done/planned sessions, the streak and the program percentage", () => {
    const program = makeProgram();
    const today = "2026-10-15";
    const rangeLogs = [
      makeLog({ sessionId: "run", executedDate: "2026-10-05" }),
      makeLog({ sessionId: "strength", executedDate: "2026-10-07" }),
      makeLog({ sessionId: "yoga", executedDate: "2026-10-09" }),
      makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
      makeLog({ sessionId: "strength", executedDate: "2026-10-14" }),
    ];
    const week = buildWeek(program, rangeLogs, today);
    render(<SportGlance program={program} week={week} rangeLogs={rangeLogs} today={today} />);

    expect(screen.getByText("Bu hafta").nextSibling).toHaveTextContent("2/3");
    expect(screen.getByText("Seri").nextSibling).toHaveTextContent("5");
    expect(screen.getByText("Program").nextSibling).toHaveTextContent("%100");
  });

  it("rounds the percentage and shows zeros before anything is logged", () => {
    const program = makeProgram();
    const today = "2026-10-15";
    const rangeLogs = [makeLog({ sessionId: "run", executedDate: "2026-10-05" })];
    const week = buildWeek(program, rangeLogs, today);
    render(<SportGlance program={program} week={week} rangeLogs={rangeLogs} today={today} />);

    expect(screen.getByText("Bu hafta").nextSibling).toHaveTextContent("0/3");
    expect(screen.getByText("Seri").nextSibling).toHaveTextContent("0");
    // 1 of 5 planned so far.
    expect(screen.getByText("Program").nextSibling).toHaveTextContent("%20");
  });
});
