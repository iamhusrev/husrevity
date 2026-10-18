import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import TodayCard from "./TodayCard";
import { buildWeek } from "./sport-schedule";
import { makeLog, makeProgram, makeSession } from "./sport-home.fixture";
import { trUseTranslation } from "./sport-test-i18n";
import type { SportLogResponse, SportProgramResponse } from "@/types/sport/sport";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return { ...actual, useTranslation: () => trUseTranslation() };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { quickLogMutate, deleteMutate, updateMutateAsync, pending } = vi.hoisted(() => ({
  quickLogMutate: vi.fn(),
  deleteMutate: vi.fn(),
  updateMutateAsync: vi.fn(),
  pending: { quickLog: false },
}));

vi.mock("@/hooks/useSport", () => ({
  useQuickLogSession: () => ({
    mutate: quickLogMutate,
    mutateAsync: quickLogMutate,
    isPending: pending.quickLog,
  }),
  useDeleteSportLog: () => ({ mutate: deleteMutate, mutateAsync: deleteMutate, isPending: false }),
  useUpdateSportLog: () => ({
    mutateAsync: updateMutateAsync,
    mutate: updateMutateAsync,
    isPending: false,
  }),
}));

const MONDAY = "2026-10-12";
const THURSDAY = "2026-10-15";

function renderDay(
  program: SportProgramResponse | null,
  logs: SportLogResponse[],
  date: string,
  today: string,
  rangeLogs?: SportLogResponse[],
) {
  // Every case below picks a date inside the week of `today`.
  const day = buildWeek(program, logs, today).find((d) => d.date === date);
  if (!day) throw new Error(`${date} is not in the week of ${today}`);
  return render(<TodayCard program={program} day={day} today={today} rangeLogs={rangeLogs} />);
}

beforeEach(() => {
  quickLogMutate.mockReset();
  deleteMutate.mockReset();
  updateMutateAsync.mockReset();
  updateMutateAsync.mockResolvedValue({ data: {} });
  pending.quickLog = false;
});

afterEach(cleanup);

describe("TodayCard on a planned day (Monday, today)", () => {
  it("shows the week kicker, the session, its chips and a short summary", () => {
    renderDay(makeProgram(), [], MONDAY, MONDAY);

    expect(screen.getByText("Hafta 2 / 4 · Pazartesi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByText("30 dk")).toBeInTheDocument();
    expect(screen.getByText("Dış mekan")).toBeInTheDocument();
    expect(screen.getByText("Orta")).toBeInTheDocument();
    expect(screen.getByText("20 dk tempo koşu · 3x100m")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Antrenmanı başlat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yaptım ✓" })).toBeInTheDocument();
  });

  it("logs the session with one tap using the planned duration and the default intensity", () => {
    renderDay(makeProgram(), [], MONDAY, MONDAY);
    fireEvent.click(screen.getByRole("button", { name: "Yaptım ✓" }));

    expect(quickLogMutate).toHaveBeenCalledTimes(1);
    expect(quickLogMutate.mock.calls[0][0]).toEqual({
      sessionId: "run",
      executedDate: MONDAY,
      actualDuration: 30,
      completed: true,
      intensity: 6,
    });
  });

  it("expands the full session on 'Antrenmanı başlat' and collapses it again", () => {
    renderDay(makeProgram(), [], MONDAY, MONDAY);
    expect(screen.queryByText("Nabız 150 altı")).toBeNull();

    const start = screen.getByRole("button", { name: "Antrenmanı başlat" });
    expect(start).toHaveAttribute("aria-expanded", "false");
    // No dangling reference while the details are not in the DOM.
    expect(start).not.toHaveAttribute("aria-controls");
    fireEvent.click(start);

    expect(screen.getByText("Nabız 150 altı")).toBeInTheDocument();
    const hide = screen.getByRole("button", { name: "Antrenmanı gizle" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(hide.getAttribute("aria-controls")!)).not.toBeNull();
    fireEvent.click(hide);
    expect(screen.queryByText("Nabız 150 altı")).toBeNull();
  });

  it("shows the completed state with 'Nasıldı?' and 'Geri al' once a log exists", () => {
    const log = makeLog({
      id: "log-1",
      sessionId: "run",
      executedDate: MONDAY,
      actualDuration: 30,
    });
    renderDay(makeProgram(), [log], MONDAY, MONDAY);

    expect(screen.getByText("Tamamlandı · 30 dk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yaptım ✓" })).toBeNull();
    expect(screen.getByRole("button", { name: "Nasıldı?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Geri al" }));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0][0]).toBe("log-1");
  });

  it("announces the completed state in a status region", () => {
    const log = makeLog({
      id: "log-1",
      sessionId: "run",
      executedDate: MONDAY,
      actualDuration: 30,
    });
    renderDay(makeProgram(), [log], MONDAY, MONDAY);
    expect(screen.getByRole("status")).toHaveTextContent("Tamamlandı · 30 dk");
  });

  it("keeps keyboard focus on the session after 'Yaptım' succeeds", () => {
    quickLogMutate.mockImplementation((_body, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.(),
    );
    renderDay(makeProgram(), [], MONDAY, MONDAY);
    const button = screen.getByRole("button", { name: "Yaptım ✓" });
    button.focus();
    fireEvent.click(button);

    const block = screen.getByRole("heading", { name: "Run" }).closest("[tabindex]");
    expect(block).not.toBeNull();
    expect(document.activeElement).toBe(block);
  });

  it("opens the quick log sheet from 'Nasıldı?'", async () => {
    const log = makeLog({ id: "log-1", sessionId: "run", executedDate: MONDAY });
    renderDay(makeProgram(), [log], MONDAY, MONDAY);
    fireEvent.click(screen.getByRole("button", { name: "Nasıldı?" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Antrenmanı değerlendir")).toBeInTheDocument();
  });

  it("disables undo and the sheet while the optimistic log has no real id yet", () => {
    const log = makeLog({ id: "optimistic-1", sessionId: "run", executedDate: MONDAY });
    renderDay(makeProgram(), [log], MONDAY, MONDAY);
    expect(screen.getByRole("button", { name: "Geri al" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nasıldı?" })).toBeDisabled();
  });

  it("lists every session of a two-session day", () => {
    const program = makeProgram();
    program.sessions.push(
      makeSession({ id: "mobility", name: "Mobility", plannedDayOfWeek: 0, position: 9 }),
    );
    renderDay(program, [], MONDAY, MONDAY);
    expect(screen.getByRole("heading", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mobility" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Yaptım ✓" })).toHaveLength(2);
  });
});

describe("TodayCard on other day states", () => {
  it("shows the rest state with the next session on a rest day", () => {
    renderDay(makeProgram(), [], "2026-10-13", "2026-10-13");
    expect(screen.getByText("Bugün dinlenme günü")).toBeInTheDocument();
    expect(screen.getByText("Sırada: Strength · Çarşamba")).toBeInTheDocument();
  });

  it("offers 'Yine de yaptım' and 'Atla' for a missed day", () => {
    renderDay(makeProgram(), [], MONDAY, THURSDAY);
    expect(screen.getByText("Kaçırıldı")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yine de yaptım" }));
    expect(quickLogMutate).toHaveBeenLastCalledWith(
      { sessionId: "run", executedDate: MONDAY, actualDuration: 30, completed: true, intensity: 6 },
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Atla" }));
    expect(quickLogMutate).toHaveBeenLastCalledWith(
      {
        sessionId: "run",
        executedDate: MONDAY,
        actualDuration: 30,
        completed: false,
        intensity: 6,
      },
      expect.anything(),
    );
  });

  it("shows a skipped day with undo", () => {
    const log = makeLog({ id: "skip-1", sessionId: "run", executedDate: MONDAY, completed: false });
    renderDay(makeProgram(), [log], MONDAY, THURSDAY);
    expect(screen.getByText("Atlandı")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Geri al" }));
    expect(deleteMutate.mock.calls[0][0]).toBe("skip-1");
  });

  it("shows a future planned day without the one-tap button", () => {
    renderDay(makeProgram(), [], "2026-10-16", THURSDAY);
    expect(screen.getByRole("heading", { name: "Yoga" })).toBeInTheDocument();
    expect(screen.getByText("Planlandı")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yaptım ✓" })).toBeNull();
  });

  it("lists a free workout logged on a rest day", () => {
    const free = makeLog({ sessionId: null, executedDate: "2026-10-13", actualDuration: 20 });
    renderDay(makeProgram(), [free], "2026-10-13", THURSDAY);
    expect(screen.getByText("Serbest antrenman · 20 dk")).toBeInTheDocument();
  });
});

describe("TodayCard program states", () => {
  it("shows the start date before the program starts", () => {
    renderDay(makeProgram(), [], "2026-10-02", "2026-10-02");
    expect(screen.getByText(/tarihinde başlıyor/)).toHaveTextContent(/5/);
    expect(screen.queryByRole("button", { name: "Yaptım ✓" })).toBeNull();
  });

  it("shows the done/planned summary with a programs link after the end", () => {
    const rangeLogs = [
      makeLog({ sessionId: "run", executedDate: "2026-10-05" }),
      makeLog({ sessionId: "strength", executedDate: "2026-10-07" }),
    ];
    renderDay(makeProgram(), [], "2026-11-03", "2026-11-03", rangeLogs);
    expect(screen.getByText("Program bitti: 2/12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Programlara git" })).toHaveAttribute(
      "href",
      "/sport/programs",
    );
  });

  it("omits the counts after the end when the range logs could not be loaded", () => {
    renderDay(makeProgram(), [], "2026-11-03", "2026-11-03", undefined);
    expect(screen.getByText("Program bitti")).toBeInTheDocument();
    expect(screen.queryByText(/Program bitti: /)).toBeNull();
  });

  it("shows the create CTA without a program", () => {
    renderDay(null, [], THURSDAY, THURSDAY);
    expect(screen.getByText("Aktif bir programın yok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Program oluştur" })).toHaveAttribute(
      "href",
      "/sport/programs",
    );
  });
});
