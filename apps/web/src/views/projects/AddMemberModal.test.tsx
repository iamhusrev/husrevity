import { describe, it, vi } from "vitest";
import React from "react";
import AddMemberModal from "./AddMemberModal";
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

vi.mock("@/hooks/useProjects", () => ({
  useAddProjectMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProjectMembers: () => ({ data: [] }),
  useSystemUsers: () => ({ data: [], isLoading: false }),
}));

describe("AddMemberModal dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract((open, onClose) =>
      open ? <AddMemberModal projectId={1} onClose={onClose} /> : null,
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose((open, onClose) =>
      open ? <AddMemberModal projectId={1} onClose={onClose} /> : null,
    );
  });
});
