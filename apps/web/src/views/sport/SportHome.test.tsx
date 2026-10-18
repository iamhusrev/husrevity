import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import SportHome from "./SportHome";
import { makeLog, makeProgram } from "./sport-home.fixture";
import { trUseTranslation } from "./sport-test-i18n";

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

const { programsResult, weekResult, rangeResult, useSportLogsSpy, mutation } = vi.hoisted(() => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    mutation,
    useSportLogsSpy: vi.fn(),
    programsResult: {
      data: [] as unknown[] | undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    weekResult: {
      data: [] as unknown[] | undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    rangeResult: {
      data: [] as unknown[] | undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
  };
});

vi.mock("@/hooks/useSport", () => ({
  useSportPrograms: () => programsResult,
  useSportWeek: () => weekResult,
  useSportLogs: (from: string, to: string) => {
    useSportLogsSpy(from, to);
    return rangeResult;
  },
  useQuickLogSession: () => mutation(),
  useDeleteSportLog: () => mutation(),
  useUpdateSportLog: () => mutation(),
  useCreateSportLog: () => mutation(),
}));

const THURSDAY = new Date(2026, 9, 15, 10, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(THURSDAY);
  programsResult.data = [makeProgram()];
  programsResult.isLoading = false;
  programsResult.isError = false;
  programsResult.refetch = vi.fn();
  weekResult.data = [makeLog({ sessionId: "run", executedDate: "2026-10-12" })];
  weekResult.isLoading = false;
  weekResult.isError = false;
  weekResult.refetch = vi.fn();
  rangeResult.data = [makeLog({ sessionId: "run", executedDate: "2026-10-12" })];
  rangeResult.isError = false;
  rangeResult.refetch = vi.fn();
  useSportLogsSpy.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SportHome", () => {
  it("shows the program row, the glance, the week strip and today's card", () => {
    render(<SportHome />);

    expect(screen.getByText("Base Program")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Geçmiş" })).toHaveAttribute("href", "/sport/history");
    expect(screen.getByRole("link", { name: "Programlar" })).toHaveAttribute(
      "href",
      "/sport/programs",
    );
    expect(screen.getByText("Bu hafta").nextSibling).toHaveTextContent("1/3");
    expect(screen.getByRole("tablist", { name: "Bu hafta" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Perşembe, bugün, dinlenme" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Bugün dinlenme günü")).toBeInTheDocument();
  });

  it("requests the program-range logs from the start date to today", () => {
    render(<SportHome />);
    expect(useSportLogsSpy).toHaveBeenCalledWith("2026-10-05", "2026-10-15");
  });

  it("shows the selected day's session when a day of the strip is picked", () => {
    render(<SportHome />);
    fireEvent.click(screen.getByRole("tab", { name: "Çarşamba, kaçırıldı" }));

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { name: "Strength" })).toBeInTheDocument();
    expect(within(panel).getByText("Kaçırıldı")).toBeInTheDocument();
    expect(screen.queryByText("Bugün dinlenme günü")).toBeNull();
  });

  it("shows an error row with Retry instead of the no-program state when programs fail", () => {
    programsResult.data = undefined;
    programsResult.isError = true;
    render(<SportHome />);

    expect(screen.getByText("Programlar yüklenemedi.")).toBeInTheDocument();
    expect(screen.queryByText("Aktif bir programın yok")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(programsResult.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error row instead of the day card when the week logs fail", () => {
    weekResult.data = undefined;
    weekResult.isError = true;
    render(<SportHome />);

    expect(screen.getByText("Antrenmanlar yüklenemedi.")).toBeInTheDocument();
    expect(screen.queryByText("Bugün dinlenme günü")).toBeNull();
    // Without the week's logs every past day would read "missed": no strip, no glance.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Seri")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(weekResult.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error row instead of the glance when the program-range logs fail", () => {
    rangeResult.data = undefined;
    rangeResult.isError = true;
    render(<SportHome />);

    expect(screen.getByText("Antrenmanlar yüklenemedi.")).toBeInTheDocument();
    expect(screen.queryByText("Seri")).toBeNull();
    // The week strip and the day card do not depend on the range logs.
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByText("Bugün dinlenme günü")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(rangeResult.refetch).toHaveBeenCalledTimes(1);
  });

  it("moves today forward when the tab becomes visible on a new day", () => {
    render(<SportHome />);
    expect(screen.getByRole("tab", { name: "Perşembe, bugün, dinlenme" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    vi.setSystemTime(new Date(2026, 9, 16, 9, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByRole("tab", { name: "Cuma, bugün, planlı" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Perşembe, bugün, dinlenme" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Yoga" })).toBeInTheDocument();
  });

  it("shows the create CTA and still the free workout row without a program", () => {
    programsResult.data = [];
    render(<SportHome />);

    expect(screen.getByRole("link", { name: "Program oluştur" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Serbest antrenman ekle" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("ignores inactive programs", () => {
    programsResult.data = [makeProgram({ isActive: false })];
    render(<SportHome />);
    expect(screen.getByText("Aktif bir programın yok")).toBeInTheDocument();
  });

  it("opens the workout log modal from the free workout row", async () => {
    render(<SportHome />);
    fireEvent.click(screen.getByRole("button", { name: "Serbest antrenman ekle" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Antrenman logla")).toBeInTheDocument();
  });

  it("shows skeletons while loading, never an empty state", () => {
    programsResult.data = undefined;
    programsResult.isLoading = true;
    render(<SportHome />);
    expect(screen.queryByText("Aktif bir programın yok")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
