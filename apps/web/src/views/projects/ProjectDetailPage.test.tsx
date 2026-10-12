import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import ProjectDetailPage from "./ProjectDetailPage";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useProjects", () => ({
  useProject: () => ({
    data: { id: 1, code: "P", name: "Project", role: "OWNER", status: "ACTIVE" },
  }),
  useProjectTasks: () => ({ data: [], isLoading: false }),
  useCreateTask: () => mutation(),
  useUpdateProject: () => mutation(),
}));

vi.mock("./KanbanBoard", () => ({ default: () => <div>board</div> }));
vi.mock("./TaskList", () => ({ default: () => <div>list</div> }));
vi.mock("./TaskDetailModal", () => ({ default: () => null }));
vi.mock("./MembersPanel", () => ({ default: () => <div>members</div> }));
vi.mock("./AssigneePicker", () => ({ default: () => <div>assignee</div> }));
vi.mock("@/components/ai/DictateQuickAddModal", () => ({ default: () => null }));

afterEach(cleanup);

describe("ProjectDetailPage new task dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<ProjectDetailPage projectId={1} />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /kanban.newTask/ }));
  });

  it("closes on a plain backdrop click only", async () => {
    render(<ProjectDetailPage projectId={1} />);
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: /kanban.newTask/ }));
  });
});

describe("ProjectDetailPage edit project dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<ProjectDetailPage projectId={1} />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: "projects.edit" }));
  });

  it("closes on a plain backdrop click only", async () => {
    render(<ProjectDetailPage projectId={1} />);
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: "projects.edit" }));
  });
});
