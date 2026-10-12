import { describe, it, vi, beforeAll } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "@/configs/i18n";
import DictateQuickAddModal from "./DictateQuickAddModal";
import { verifyBackdropClose, verifyDialogContract } from "@/test/dialog-contract";

vi.mock("@/services/ai-service", () => ({
  aiService: { splitDictatedText: vi.fn() },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

describe("DictateQuickAddModal dialog behaviour", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract(
      (open, onClose) => (
        <DictateQuickAddModal
          isOpen={open}
          onClose={onClose}
          title="Dictate"
          onConfirm={() => {}}
        />
      ),
      { wrapper: Wrapper, name: undefined },
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose(
      (open, onClose) => (
        <DictateQuickAddModal
          isOpen={open}
          onClose={onClose}
          title="Dictate"
          onConfirm={() => {}}
        />
      ),
      { wrapper: Wrapper },
    );
  });
});
