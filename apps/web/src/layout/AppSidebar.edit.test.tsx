import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NavPreferences } from "@/types/user/user";

const applyUser = vi.fn();
let navPreferences: NavPreferences | null = null;

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { role: "user", navPreferences }, applyUser }),
}));
vi.mock("@/providers/SidebarContext", () => ({
  useSidebar: () => ({ isExpanded: true, isHovered: false, setIsHovered: vi.fn() }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ai/TodaySuggestionsModal", () => ({ default: () => null }));
vi.mock("@/components/logo/AppLogo", () => ({ default: () => null }));
// jsdom has no real drag events; reordering is exercised through the move buttons.
vi.mock("react-dnd", () => ({
  DndProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDrag: () => [{ isDragging: false }, vi.fn(), vi.fn()],
  useDrop: () => [{}, vi.fn()],
}));
vi.mock("react-dnd-html5-backend", () => ({ HTML5Backend: {} }));

const updateNavPreferences = vi.fn();
const resetNavPreferences = vi.fn();
vi.mock("@/services/auth-service", () => ({
  AuthService: {
    updateNavPreferences: (...a: unknown[]) => updateNavPreferences(...a),
    resetNavPreferences: (...a: unknown[]) => resetNavPreferences(...a),
  },
}));

import AppSidebar from "./AppSidebar";

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSidebar />
    </QueryClientProvider>,
  );
}

const linkOrder = () =>
  screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"))
    .filter((h): h is string => !!h && !["/dashboard", "/"].includes(h));

beforeEach(() => {
  navPreferences = null;
  applyUser.mockReset();
  updateNavPreferences.mockReset();
  resetNavPreferences.mockReset();
});

describe("AppSidebar menu order", () => {
  it("renders the default order without saved preferences", () => {
    renderSidebar();
    expect(linkOrder().slice(0, 4)).toEqual(["/reminders", "/notes", "/projects", "/vault"]);
  });

  it("renders the saved order, including an item moved to another section", () => {
    navPreferences = {
      sections: {
        core: ["vault", "notes", "reminders"],
        daily: ["projects", "inbox", "week", "month", "goals", "evkat", "learning", "sport"],
      },
    };
    renderSidebar();
    const order = linkOrder();
    expect(order.slice(0, 3)).toEqual(["/vault", "/notes", "/reminders"]);
    expect(order[3]).toBe("/projects");
  });
});

describe("AppSidebar edit mode", () => {
  it("saves the new order with PUT body built from the draft", async () => {
    const user = userEvent.setup();
    const saved = { role: "user", navPreferences: null };
    updateNavPreferences.mockResolvedValue(saved);
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "nav.edit.start" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.moveDown: nav.reminders" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.done" }));

    await waitFor(() => expect(updateNavPreferences).toHaveBeenCalledTimes(1));
    expect(updateNavPreferences.mock.calls[0][0]).toEqual({
      sections: {
        core: ["notes", "reminders", "projects", "vault"],
        daily: ["inbox", "week", "month", "goals", "evkat", "learning", "sport"],
      },
    });
    await waitFor(() => expect(applyUser).toHaveBeenCalledWith(saved));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "nav.edit.done" })).not.toBeInTheDocument(),
    );
  });

  it("moves an item across the section boundary", async () => {
    const user = userEvent.setup();
    updateNavPreferences.mockResolvedValue({ role: "user", navPreferences: null });
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "nav.edit.start" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.moveDown: nav.vault" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.done" }));

    await waitFor(() => expect(updateNavPreferences).toHaveBeenCalled());
    const body = updateNavPreferences.mock.calls[0][0] as NavPreferences;
    expect(body.sections.core).toEqual(["reminders", "notes", "projects"]);
    expect(body.sections.daily[0]).toBe("vault");
  });

  it("does not call the API when nothing changed", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "nav.edit.start" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.done" }));

    expect(updateNavPreferences).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "nav.edit.start" })).toBeInTheDocument();
  });

  it("discards the draft on cancel", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "nav.edit.start" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.moveDown: nav.reminders" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.cancel" }));

    expect(updateNavPreferences).not.toHaveBeenCalled();
    expect(linkOrder().slice(0, 2)).toEqual(["/reminders", "/notes"]);
  });

  it("resets to the default order through DELETE", async () => {
    const user = userEvent.setup();
    resetNavPreferences.mockResolvedValue({ role: "user", navPreferences: null });
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "nav.edit.start" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.reset" }));

    await waitFor(() => expect(resetNavPreferences).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(applyUser).toHaveBeenCalled());
  });

  it("keeps the editor open and shows an error when saving fails", async () => {
    const user = userEvent.setup();
    updateNavPreferences.mockRejectedValue(new Error("boom"));
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "nav.edit.start" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.moveDown: nav.reminders" }));
    await user.click(screen.getByRole("button", { name: "nav.edit.done" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("nav.edit.error");
    expect(screen.getByRole("button", { name: "nav.edit.done" })).toBeInTheDocument();
    expect(within(screen.getByRole("alert")).queryByRole("button")).toBeNull();
  });
});
