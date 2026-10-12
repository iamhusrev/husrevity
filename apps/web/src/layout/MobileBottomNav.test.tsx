import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileBottomNav from "./MobileBottomNav";
import { QuickAddContext } from "@/providers/QuickAddContext";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({
    user: { role: "user" },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const map: Record<string, string> = {
        "quickAdd.title": "Quick Add",
        "nav.reminders": "Reminders",
        "nav.notes": "Notes",
        "nav.dashboard": "Dashboard",
        "nav.calendar": "Calendar",
        "nav.more": "More",
        "nav.week": "Week",
        "nav.inbox": "Inbox",
        "nav.goals": "Goals",
      };
      return map[key] ?? fallback ?? key;
    },
  }),
}));

function renderNav(setOpen = vi.fn()) {
  render(
    <QuickAddContext.Provider
      value={{
        open: false,
        setOpen,
        openQuickAdd: () => setOpen(true),
        closeQuickAdd: () => setOpen(false),
      }}
    >
      <MobileBottomNav />
    </QuickAddContext.Provider>,
  );
  return { setOpen };
}

describe("MobileBottomNav", () => {
  it("renders a button with an accessible name for quick add", () => {
    renderNav();
    const quickAddButton = screen.getByRole("button", { name: "Quick Add" });
    expect(quickAddButton).toBeInTheDocument();
  });

  it("clicking the quick add button calls the open handler of the quick add context", async () => {
    const user = userEvent.setup();
    const setOpen = vi.fn();
    renderNav(setOpen);

    const quickAddButton = screen.getByRole("button", { name: "Quick Add" });
    await user.click(quickAddButton);

    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it("still renders all 5 existing destinations", () => {
    renderNav();
    expect(screen.getByRole("link", { name: /Reminders/i })).toHaveAttribute("href", "/reminders");
    expect(screen.getByRole("link", { name: /Notes/i })).toHaveAttribute("href", "/notes");
    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Calendar/i })).toHaveAttribute("href", "/month");
    expect(screen.getByRole("button", { name: /More/i })).toBeInTheDocument();
  });

  it("lists Inbox and Week in the More sheet", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: /More/i }));
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
    expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute("href", "/week");
  });

  it("lists Goals in the More sheet", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: /More/i }));
    expect(screen.getByRole("link", { name: "Goals" })).toHaveAttribute("href", "/goals");
  });

  it("More sheet is a modal dialog: traps Tab, closes on Escape and restores focus", async () => {
    const user = userEvent.setup();
    renderNav();
    const moreButton = screen.getByRole("button", { name: /More/i });
    await user.click(moreButton);

    const dialog = await screen.findByRole("dialog", { name: "More" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const links = within(dialog).getAllByRole("link");
    links[links.length - 1].focus();
    await user.tab();
    expect(links[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(links[links.length - 1]).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(moreButton).toHaveFocus();
  });

  it("More sheet closes on a backdrop click but not on a click inside the sheet", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: /More/i }));
    const dialog = await screen.findByRole("dialog", { name: "More" });
    await user.click(dialog);
    expect(screen.getByRole("dialog", { name: "More" })).toBeInTheDocument();
    await user.click(dialog.parentElement as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
