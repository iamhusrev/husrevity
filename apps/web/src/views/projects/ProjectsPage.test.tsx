import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import ProjectsPage from "./ProjectsPage";
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({ data: [], isLoading: false }),
  useCreateProject: () => mutation(),
  useDeleteProject: () => mutation(),
  useRestoreProject: () => mutation(),
  useUpdateProject: () => mutation(),
}));

afterEach(cleanup);

describe("ProjectsPage new project dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<ProjectsPage />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /projects.newProject/ }));
  });

  it("closes on a plain backdrop click only", async () => {
    render(<ProjectsPage />);
    await verifyBackdropCloseFromTrigger(
      screen.getByRole("button", { name: /projects.newProject/ }),
    );
  });
});
