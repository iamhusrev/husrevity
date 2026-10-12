import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VaultPage from "./VaultPage";
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

const { mutation, entitiesResult, itemsResult } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  entitiesResult: {
    data: [{ id: 1, name: "Prod", color: "#6366F1", category: null, itemCount: 0 }],
    isLoading: false,
  },
  itemsResult: { data: [], isLoading: false },
}));

vi.mock("@/hooks/useVault", () => ({
  useVaultEntities: () => entitiesResult,
  useCreateVaultEntity: () => mutation(),
  useUpdateVaultEntity: () => mutation(),
  useDeleteVaultEntity: () => mutation(),
  useVaultItems: () => itemsResult,
  useCreateVaultItem: () => mutation(),
  useUpdateVaultItem: () => mutation(),
  useDeleteVaultItem: () => mutation(),
}));

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <VaultPage />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("VaultPage entity dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    renderPage();
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /vault.newEntity/ }));
  });

  it("closes on a plain backdrop click only", async () => {
    renderPage();
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: /vault.newEntity/ }));
  });

  it("the edit dialog is a modal dialog too", async () => {
    renderPage();
    await verifyDialogFromTrigger(screen.getByRole("button", { name: "vault.action.edit" }));
  });
});

describe("VaultPage item dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    renderPage();
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /vault.addField/ }));
  });

  it("closes on a plain backdrop click only", async () => {
    renderPage();
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: /vault.addField/ }));
  });
});

describe("VaultPage env import dialog", () => {
  it("is a modal dialog with a focus trap and Escape close", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /vault.import$/ }));
    await verifyDialogFromTrigger(screen.getByText("vault.import_modal.title"), {
      triggerUnmounts: true,
    });
  });

  it("closes on a plain backdrop click only", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /vault.import$/ }));
    await verifyBackdropCloseFromTrigger(screen.getByText("vault.import_modal.title"));
  });
});
