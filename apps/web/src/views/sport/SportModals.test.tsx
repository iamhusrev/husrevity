import { describe, it, vi } from "vitest";
import React from "react";
import SportAiGeneratorModal from "./SportAiGeneratorModal";
import SportLogModal from "./SportLogModal";
import { verifyBackdropClose, verifyDialogContract } from "@/test/dialog-contract";

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

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useSport", () => ({
  useGenerateSportProgram: () => mutation(),
  useCreateSportLog: () => mutation(),
  useUpdateSportLog: () => mutation(),
  useDeleteSportLog: () => mutation(),
}));

describe("SportAiGeneratorModal dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract((open, onClose) =>
      open ? <SportAiGeneratorModal onClose={onClose} onViewProgram={() => {}} /> : null,
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose((open, onClose) =>
      open ? <SportAiGeneratorModal onClose={onClose} onViewProgram={() => {}} /> : null,
    );
  });
});

describe("SportLogModal dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract((open, onClose) =>
      open ? <SportLogModal initial={null} sessionOptions={[]} onClose={onClose} /> : null,
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose((open, onClose) =>
      open ? <SportLogModal initial={null} sessionOptions={[]} onClose={onClose} /> : null,
    );
  });
});
