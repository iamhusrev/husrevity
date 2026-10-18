import { describe, expect, it } from "vitest";
import {
  defaultOpenIndex,
  isNotesSection,
  parseSessionDescription,
  sessionSummary,
} from "./session-description";
import { CROSSFIT_A } from "./session-description.fixture";

describe("parseSessionDescription", () => {
  it("splits the CrossFit A text into four titled sections in order", () => {
    const sections = parseSessionDescription(CROSSFIT_A);

    expect(sections.map((s) => s.title)).toEqual([
      "🔥 ISINMA (5 dk)",
      "💪 ANA BÖLÜM — 20 dk AMRAP (süre bitene kadar tur at)",
      "🧘 SOĞUMA (5 dk, her biri 30 sn)",
      "📌 Genel kurallar",
    ]);
    expect(sections[0].lines).toEqual([
      "- 2 dk ip atlama ya da olduğun yerde koşu",
      "- 10 kol çevirme (öne/arkaya)",
      "- 10 kalça açma",
    ]);
    expect(sections[1].lines).toEqual([
      "1. 10 burpee",
      "2. 15 air squat",
      "3. 20 mountain climber",
      "→ Kaç tur yaptığını kaydet.",
      "Hedef: 6+ tur",
    ]);
    expect(sections[3].lines).toEqual(["- Form bozulursa yavaşla.", "- Su iç."]);
  });

  it("treats a mostly-uppercase first line without an emoji as a title", () => {
    const sections = parseSessionDescription("ANA BÖLÜM\n- 3x10 squat\n\nNotlar: su iç");
    expect(sections[0]).toEqual({ title: "ANA BÖLÜM", lines: ["- 3x10 squat"] });
  });

  it("returns a single untitled block that keeps line breaks for plain text", () => {
    const text = "Easy 30-min run.\n5-min warm-up jog, 20-min steady pace.\n5-min cool-down walk.";
    expect(parseSessionDescription(text)).toEqual([
      {
        title: null,
        lines: [
          "Easy 30-min run.",
          "5-min warm-up jog, 20-min steady pace.",
          "5-min cool-down walk.",
        ],
      },
    ]);
  });

  it("keeps plain paragraphs separated by blank lines as one untitled block", () => {
    const sections = parseSessionDescription("First paragraph.\n\nSecond paragraph.");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBeNull();
    expect(sections[0].lines).toEqual(["First paragraph.", "", "Second paragraph."]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(parseSessionDescription("")).toEqual([]);
    expect(parseSessionDescription("  \n\n ")).toEqual([]);
  });

  it("normalises Windows line endings", () => {
    const sections = parseSessionDescription("🔥 ISINMA\r\n- koşu\r\n\r\n💪 ANA\r\n- squat");
    expect(sections.map((s) => s.title)).toEqual(["🔥 ISINMA", "💪 ANA"]);
    expect(sections[1].lines).toEqual(["- squat"]);
  });
});

describe("defaultOpenIndex", () => {
  it("opens the main workout block of the CrossFit A text", () => {
    expect(defaultOpenIndex(parseSessionDescription(CROSSFIT_A))).toBe(1);
  });

  it("falls back to the first non-notes section, then to the first section", () => {
    expect(
      defaultOpenIndex([
        { title: "📌 Notlar", lines: [] },
        { title: "🔥 ISINMA", lines: [] },
        { title: "🧘 SOĞUMA", lines: [] },
      ]),
    ).toBe(1);
    expect(defaultOpenIndex([{ title: "📌 Notlar", lines: [] }])).toBe(0);
    expect(defaultOpenIndex([])).toBe(-1);
  });
});

describe("isNotesSection", () => {
  it("recognises the notes / rules blocks by their title", () => {
    expect(isNotesSection({ title: "📌 Genel kurallar", lines: [] })).toBe(true);
    expect(isNotesSection({ title: "📌 Notlar", lines: [] })).toBe(true);
    expect(isNotesSection({ title: "Notes", lines: [] })).toBe(true);
    expect(isNotesSection({ title: "💪 ANA BÖLÜM", lines: [] })).toBe(false);
    expect(isNotesSection({ title: null, lines: [] })).toBe(false);
  });
});

describe("sessionSummary", () => {
  it("takes the first lines of the main section without bullets", () => {
    const text =
      "🔥 ISINMA\n- 5 dk yürüyüş\n\n💪 ANA BÖLÜM\n- 20 dk tempo koşu\n- 3x100m\n- Soğuma\n\n📌 Notlar\n- Nabız";
    expect(sessionSummary(text)).toBe("20 dk tempo koşu · 3x100m");
  });

  it("uses the first lines of plain text", () => {
    expect(sessionSummary("Hafif koşu.\nSonra esneme.\nSonra duş.")).toBe(
      "Hafif koşu. · Sonra esneme.",
    );
  });

  it("truncates long summaries", () => {
    const long = "a".repeat(200);
    expect(sessionSummary(long).length).toBeLessThanOrEqual(121);
    expect(sessionSummary(long).endsWith("…")).toBe(true);
  });

  it("is empty for an empty description", () => {
    expect(sessionSummary("")).toBe("");
  });
});
