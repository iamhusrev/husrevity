import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import EvkatPage from "./EvkatPage";
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

const { mutation, segmentsResult } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  segmentsResult: { data: [], isLoading: false, isError: false, refetch: () => {} },
}));

vi.mock("@/hooks/useRoutine", () => ({
  useRoutineSegments: () => segmentsResult,
  useReorderRoutineSegments: () => mutation(),
  useCreateRoutineSegment: () => mutation(),
  useUpdateRoutineSegment: () => mutation(),
  useDeleteRoutineSegment: () => mutation(),
  useCreateRoutineActivity: () => mutation(),
  useDeleteRoutineActivity: () => mutation(),
}));

vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => <div>crumb</div> }));

afterEach(cleanup);

describe("EvkatPage segment dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<EvkatPage />);
    await verifyDialogFromTrigger(screen.getAllByRole("button", { name: "Yeni vakit" })[0]);
  });

  it("closes on a plain backdrop click only", async () => {
    render(<EvkatPage />);
    await verifyBackdropCloseFromTrigger(screen.getAllByRole("button", { name: "Yeni vakit" })[0]);
  });
});
