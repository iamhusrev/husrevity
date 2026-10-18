import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import WeekStrip from "./WeekStrip";
import { buildWeek } from "./sport-schedule";
import { makeLog, makeProgram } from "./sport-home.fixture";
import { trUseTranslation } from "./sport-test-i18n";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return { ...actual, useTranslation: () => trUseTranslation() };
});

afterEach(cleanup);

// Week of Mon 12 .. Sun 18 October 2026 seen on Thursday 15, with a program
// that plans Monday, Wednesday and Friday (plus a Thursday session here).
function week() {
  const program = makeProgram();
  program.sessions.push({ ...program.sessions[0], id: "swim", name: "Swim", plannedDayOfWeek: 3 });
  const logs = [
    makeLog({ sessionId: "run", executedDate: "2026-10-12" }),
    makeLog({ sessionId: "strength", executedDate: "2026-10-14", completed: false }),
  ];
  return buildWeek(program, logs, "2026-10-15");
}

describe("WeekStrip", () => {
  it("renders seven day tabs with state in their accessible names", () => {
    render(<WeekStrip week={week()} selected="2026-10-15" onSelect={() => {}} />);

    const tablist = screen.getByRole("tablist", { name: "Bu hafta" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    expect(tablist).toContainElement(tabs[0]);
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Pazartesi, tamamlandı",
      "Salı, dinlenme",
      "Çarşamba, atlandı",
      "Perşembe, bugün, planlı",
      "Cuma, planlı",
      "Cumartesi, dinlenme",
      "Pazar, dinlenme",
    ]);
  });

  it("marks a missed day", () => {
    const missedWeek = buildWeek(makeProgram(), [], "2026-10-15");
    render(<WeekStrip week={missedWeek} selected="2026-10-15" onSelect={() => {}} />);
    expect(screen.getByRole("tab", { name: "Pazartesi, kaçırıldı" })).toBeInTheDocument();
  });

  it("selects a day on click and reports it", () => {
    const onSelect = vi.fn();
    render(<WeekStrip week={week()} selected="2026-10-15" onSelect={onSelect} />);

    expect(screen.getByRole("tab", { name: "Perşembe, bugün, planlı" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Çarşamba, atlandı" }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-14");
  });

  it("moves the selection with the arrow keys", () => {
    const onSelect = vi.fn();
    render(<WeekStrip week={week()} selected="2026-10-15" onSelect={onSelect} />);
    const thursday = screen.getByRole("tab", { name: "Perşembe, bugün, planlı" });
    fireEvent.keyDown(thursday, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("2026-10-16");
    fireEvent.keyDown(thursday, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("2026-10-14");
  });

  it("keeps only the selected tab in the tab order and strikes skipped days", () => {
    render(<WeekStrip week={week()} selected="2026-10-15" onSelect={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(
      screen.getByRole("tab", { name: "Çarşamba, atlandı" }).querySelector(".line-through"),
    ).not.toBeNull();
  });
});
