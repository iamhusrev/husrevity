import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import SportProfileCard from "./SportProfileCard";
import SportProgramDetail from "./SportProgramDetail";
import SportProgramsList from "./SportProgramsList";
import { verifyBackdropCloseFromTrigger, verifyDialogFromTrigger } from "@/test/dialog-contract";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
      i18n: { language: "en" },
    }),
  };
});

const { mutation, profileResult, programsResult, programResult } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  profileResult: {
    data: {
      fitnessLevel: "BEGINNER",
      weeklyHours: 4,
      preferredActivities: [],
      goals: "",
      notes: "",
    },
    isLoading: false,
  },
  programsResult: { data: [], isLoading: false },
  programResult: {
    data: {
      id: "p1",
      name: "Program",
      description: "",
      programType: "STRENGTH",
      isActive: false,
      sessions: [],
    },
    isLoading: false,
  },
}));

vi.mock("@/hooks/useSport", () => ({
  useSportProfile: () => profileResult,
  useUpdateSportProfile: () => mutation(),
  useSportPrograms: () => programsResult,
  useCreateSportProgram: () => mutation(),
  useActivateSportProgram: () => mutation(),
  useDeleteSportProgram: () => mutation(),
  useGenerateSportProgram: () => mutation(),
  useGetSportProgram: () => programResult,
  useCreateSportSession: () => mutation(),
  useUpdateSportSession: () => mutation(),
  useDeleteSportSession: () => mutation(),
  useReorderSportSessions: () => mutation(),
}));

afterEach(cleanup);

describe("SportProfileCard edit dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<SportProfileCard />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: "Profili düzenle" }));
  });

  it("closes on a plain backdrop click only", async () => {
    render(<SportProfileCard />);
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: "Profili düzenle" }));
  });
});

describe("SportProgramsList new program dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<SportProgramsList onOpenDetail={() => {}} />);
    await verifyDialogFromTrigger(screen.getAllByRole("button", { name: "Yeni program" })[0]);
  });

  it("closes on a plain backdrop click only", async () => {
    render(<SportProgramsList onOpenDetail={() => {}} />);
    await verifyBackdropCloseFromTrigger(
      screen.getAllByRole("button", { name: "Yeni program" })[0],
    );
  });
});

describe("SportProgramDetail session dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<SportProgramDetail programId="p1" onBack={() => {}} />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: "Yeni seans" }));
  });

  it("closes on a plain backdrop click only", async () => {
    render(<SportProgramDetail programId="p1" onBack={() => {}} />);
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: "Yeni seans" }));
  });
});
