import { describe, it, expect } from "vitest";
import { getNavSections } from "./AppSidebar";

describe("getNavSections", () => {
  it("puts Goals (/goals) in the daily section", () => {
    const sections = getNavSections((key) => key, false);
    const daily = sections.find((s) => s.label === "nav.section.daily");
    expect(daily).toBeDefined();
    const goals = daily?.items.find((i) => i.path === "/goals");
    expect(goals?.name).toBe("nav.goals");
  });
});
