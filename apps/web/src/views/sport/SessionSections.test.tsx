import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import SessionSections from "./SessionSections";
import { CROSSFIT_A } from "./session-description.fixture";

afterEach(cleanup);

describe("SessionSections", () => {
  it("renders one collapsible <details> per titled section, in order", () => {
    const { container } = render(<SessionSections text={CROSSFIT_A} />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(4);
    const summaries = [...container.querySelectorAll("summary")].map((s) => s.textContent?.trim());
    expect(summaries).toEqual([
      "🔥 ISINMA (5 dk)",
      "💪 ANA BÖLÜM — 20 dk AMRAP (süre bitene kadar tur at)",
      "🧘 SOĞUMA (5 dk, her biri 30 sn)",
      "📌 Genel kurallar",
    ]);
  });

  it("opens the main block by default and keeps warm-up, cool-down and notes closed", () => {
    const { container } = render(<SessionSections text={CROSSFIT_A} />);
    const open = [...container.querySelectorAll("details")].map((d) => d.open);
    expect(open).toEqual([false, true, false, false]);
  });

  it("opens the first section when no main block is recognisable", () => {
    const { container } = render(
      <SessionSections text={"🔥 ISINMA\n- koşu\n\n🧘 SOĞUMA\n- esneme\n\n📌 Notlar\n- su iç"} />,
    );
    const open = [...container.querySelectorAll("details")].map((d) => d.open);
    expect(open).toEqual([true, false, false]);
  });

  it("shows the full body text of every section (nothing clamped)", () => {
    render(<SessionSections text={CROSSFIT_A} />);
    expect(screen.getByText("2 dk ip atlama ya da olduğun yerde koşu")).toBeInTheDocument();
    expect(screen.getByText("→ Kaç tur yaptığını kaydet.")).toBeInTheDocument();
    expect(screen.getByText("Form bozulursa yavaşla.")).toBeInTheDocument();
    expect(document.querySelector("[class*='line-clamp']")).toBeNull();
  });

  it("renders dash and numbered lines as list items", () => {
    const { container } = render(<SessionSections text={CROSSFIT_A} />);
    const warmUp = container.querySelectorAll("details")[0];
    expect(warmUp.querySelectorAll("ul li")).toHaveLength(3);
    const main = container.querySelectorAll("details")[1];
    expect(main.querySelectorAll("ol li")).toHaveLength(3);
  });

  it("renders plain text as a single paragraph that keeps line breaks", () => {
    const { container } = render(<SessionSections text={"Easy run.\nThen stretch."} />);
    expect(container.querySelector("details")).toBeNull();
    const paragraph = container.querySelector("p");
    expect(paragraph?.className).toContain("whitespace-pre-line");
    expect(paragraph?.textContent).toBe("Easy run.\nThen stretch.");
  });

  it("renders nothing for an empty description", () => {
    const { container } = render(<SessionSections text="   " />);
    expect(container.firstChild).toBeNull();
  });

  it("gives every summary a touch-sized, focusable control with dark-mode styles", () => {
    const { container } = render(<SessionSections text={CROSSFIT_A} />);
    for (const summary of container.querySelectorAll("summary")) {
      expect(summary.className).toContain("min-h-10");
      expect(summary.className).toContain("focus-visible:");
      expect(summary.className).toContain("dark:");
    }
  });
});
