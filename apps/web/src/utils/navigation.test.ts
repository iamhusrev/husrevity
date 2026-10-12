import { describe, it, expect } from "vitest";
import { isNavItemActive } from "./navigation";

describe("isNavItemActive", () => {
  it("matches when pathname is a subpath of path with segment boundary", () => {
    expect(isNavItemActive("/projects/12", "/projects")).toBe(true);
  });

  it("matches exact path", () => {
    expect(isNavItemActive("/projects", "/projects")).toBe(true);
  });

  it("does not match when path is only a string prefix without segment boundary", () => {
    expect(isNavItemActive("/projectsfoo", "/projects")).toBe(false);
  });

  it("for /settings/profile: activates Settings parent and Profile child, but not Integrations", () => {
    const settingsParent = {
      name: "Settings",
      subItems: [
        { name: "Profile", path: "/settings/profile" },
        { name: "Integrations", path: "/settings/integrations" },
      ],
    };
    expect(isNavItemActive("/settings/profile", settingsParent)).toBe(true);
    expect(isNavItemActive("/settings/profile", "/settings/profile")).toBe(true);
    expect(isNavItemActive("/settings/profile", "/settings/integrations")).toBe(false);
    expect(isNavItemActive("/settings/profile", "/settings")).toBe(true);
  });

  it("/dashboard only matches /dashboard", () => {
    expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavItemActive("/dashboard-extra", "/dashboard")).toBe(false);
    expect(isNavItemActive("/projects", "/dashboard")).toBe(false);
  });

  it("handles trailing slashes on pathname and path", () => {
    expect(isNavItemActive("/projects/", "/projects")).toBe(true);
    expect(isNavItemActive("/projects", "/projects/")).toBe(true);
    expect(isNavItemActive("/projects/12/", "/projects")).toBe(true);
    expect(isNavItemActive("/projects/12/", "/projects/")).toBe(true);
  });

  it("matches /month path and subpaths without prefix false-positives", () => {
    expect(isNavItemActive("/month", "/month")).toBe(true);
    expect(isNavItemActive("/month/", "/month")).toBe(true);
    expect(isNavItemActive("/month", "/month/")).toBe(true);
    expect(isNavItemActive("/month/2026-10", "/month")).toBe(true);
    expect(isNavItemActive("/monthly", "/month")).toBe(false);
  });

  it("matches /week and /inbox without prefix false-positives", () => {
    expect(isNavItemActive("/week", "/week")).toBe(true);
    expect(isNavItemActive("/week/2026-10-12", "/week")).toBe(true);
    expect(isNavItemActive("/weekly", "/week")).toBe(false);
    expect(isNavItemActive("/inbox", "/inbox")).toBe(true);
    expect(isNavItemActive("/inbox/", "/inbox")).toBe(true);
    expect(isNavItemActive("/inbox-archive", "/inbox")).toBe(false);
    expect(isNavItemActive("/week", "/month")).toBe(false);
  });

  it("keeps /goals active on its sub-paths without prefix false-positives", () => {
    expect(isNavItemActive("/goals", "/goals")).toBe(true);
    expect(isNavItemActive("/goals/", "/goals")).toBe(true);
    expect(isNavItemActive("/goals/12", "/goals")).toBe(true);
    expect(isNavItemActive("/goals-archive", "/goals")).toBe(false);
    expect(isNavItemActive("/month", "/goals")).toBe(false);
  });
});
