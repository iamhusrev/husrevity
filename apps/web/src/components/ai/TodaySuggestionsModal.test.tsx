import { describe, it, vi } from "vitest";
import React from "react";
import TodaySuggestionsModal from "./TodaySuggestionsModal";
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

vi.mock("@/components/dashboard/TodaySuggestionsCard", () => ({
  default: () => <button type="button">suggestion</button>,
}));

describe("TodaySuggestionsModal dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract((open, onClose) => (
      <TodaySuggestionsModal isOpen={open} onClose={onClose} />
    ));
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose((open, onClose) => (
      <TodaySuggestionsModal isOpen={open} onClose={onClose} />
    ));
  });
});
