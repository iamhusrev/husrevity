import { describe, it, vi } from "vitest";
import React from "react";
import { InviteModal } from "./InviteModal";
import { UserModal } from "./UserModal";
import { verifyBackdropClose, verifyDialogContract } from "@/test/dialog-contract";
import type { AdminUser } from "@/types/admin/admin";

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

vi.mock("@/hooks/useAdmin", () => ({
  useCreateInvite: () => mutation(),
  useUpdateAdminUser: () => mutation(),
  useResetAdminUserPassword: () => mutation(),
  useDeleteAdminUser: () => mutation(),
}));

const user = {
  id: "1",
  email: "a@b.c",
  firstName: "A",
  lastName: "B",
  role: "user",
  enabled: true,
} as unknown as AdminUser;

describe("InviteModal dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract((open, onClose) =>
      open ? <InviteModal onClose={onClose} /> : null,
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose((open, onClose) => (open ? <InviteModal onClose={onClose} /> : null));
  });
});

describe("UserModal dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract((open, onClose) =>
      open ? <UserModal initial={user} isSelf={false} onClose={onClose} /> : null,
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose((open, onClose) =>
      open ? <UserModal initial={user} isSelf={false} onClose={onClose} /> : null,
    );
  });
});
