import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/week" }));
vi.mock("@/providers/AuthProvider", () => ({ useAuth: () => ({ user: { role: "user" } }) }));
vi.mock("@/providers/SidebarContext", () => ({ useSidebar: () => ({}) }));

import { getNavSections, isNavItemActive } from "./AppSidebar";

describe("getNavSections", () => {
  const sections = getNavSections((key) => key, false);
  const paths = sections.flatMap((s) => s.items.map((i) => i.path)).filter(Boolean);

  it("includes Hafta and Gelen Kutusu next to Ay in the daily section", () => {
    const daily = sections.find((s) => s.label === "nav.section.daily");
    expect(daily?.items.map((i) => i.path)).toEqual(
      expect.arrayContaining(["/inbox", "/week", "/month"]),
    );
    expect(daily?.items.find((i) => i.path === "/week")?.name).toBe("nav.week");
    expect(daily?.items.find((i) => i.path === "/inbox")?.name).toBe("nav.inbox");
  });

  it("activates the right entry from the current pathname", () => {
    expect(paths.filter((p) => p && isNavItemActive("/week", p))).toEqual(["/week"]);
    expect(paths.filter((p) => p && isNavItemActive("/inbox", p))).toEqual(["/inbox"]);
  });
});
