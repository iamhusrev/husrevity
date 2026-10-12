import { describe, it, vi } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VaultCsvImportModal from "./VaultCsvImportModal";
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

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("VaultCsvImportModal dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract(
      (open, onClose) => <VaultCsvImportModal entityId="1" isOpen={open} onClose={onClose} />,
      { wrapper: Wrapper },
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose(
      (open, onClose) => <VaultCsvImportModal entityId="1" isOpen={open} onClose={onClose} />,
      { wrapper: Wrapper },
    );
  });
});
