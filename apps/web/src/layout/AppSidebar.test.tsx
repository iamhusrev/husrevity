import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/month" }));
vi.mock("@/providers/AuthProvider", () => ({ useAuth: () => ({ user: { role: "user" } }) }));
vi.mock("@/providers/SidebarContext", () => ({ useSidebar: () => ({}) }));

import { getNavSections, isNavItemActive } from "./AppSidebar";

describe("getNavSections", () => {
  const sections = getNavSections((key) => key, false);
  const paths = sections.flatMap((s) => s.items.map((i) => i.path)).filter(Boolean);

  it("keeps the calendar in the daily section and no longer lists Week or Inbox", () => {
    const daily = sections.find((s) => s.label === "nav.section.daily");
    expect(daily?.items.find((i) => i.path === "/month")?.name).toBe("nav.calendar");
    expect(paths).not.toContain("/week");
    expect(paths).not.toContain("/inbox");
  });

  it("activates the right entry from the current pathname", () => {
    expect(paths.filter((p) => p && isNavItemActive("/month", p))).toEqual(["/month"]);
    expect(paths.filter((p) => p && isNavItemActive("/goals", p))).toEqual(["/goals"]);
  });
});
