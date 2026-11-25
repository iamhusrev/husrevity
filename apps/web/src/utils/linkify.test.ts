import { describe, expect, it } from "vitest";
import { linkLabel, splitLinks } from "./linkify";

const links = (text: string) =>
  splitLinks(text)
    .filter((s) => s.type === "link")
    .map((s) => (s.type === "link" ? [s.value, s.href] : []));

describe("splitLinks", () => {
  it("returns a single text segment when there is no URL", () => {
    expect(splitLinks("Kur'an + Cevşen")).toEqual([{ type: "text", value: "Kur'an + Cevşen" }]);
  });

  it("splits text around an http(s) URL and keeps the surrounding text intact", () => {
    expect(splitLinks("Kaynak: https://pgexercises.com/questions/basic/ bugün")).toEqual([
      { type: "text", value: "Kaynak: " },
      {
        type: "link",
        value: "https://pgexercises.com/questions/basic/",
        href: "https://pgexercises.com/questions/basic/",
      },
      { type: "text", value: " bugün" },
    ]);
  });

  it("links bare www hosts with an https href", () => {
    expect(links("bak www.example.com")).toEqual([["www.example.com", "https://www.example.com"]]);
  });

  it("drops trailing sentence punctuation", () => {
    expect(links("Bitti: https://a.com/x. Sonra https://b.com, ve https://c.com!")).toEqual([
      ["https://a.com/x", "https://a.com/x"],
      ["https://b.com", "https://b.com"],
      ["https://c.com", "https://c.com"],
    ]);
  });

  it("drops an unbalanced closing parenthesis but keeps a balanced one", () => {
    expect(links("(bkz. https://a.com/doc)")).toEqual([["https://a.com/doc", "https://a.com/doc"]]);
    expect(links("https://en.wikipedia.org/wiki/Go_(programming_language)")).toEqual([
      [
        "https://en.wikipedia.org/wiki/Go_(programming_language)",
        "https://en.wikipedia.org/wiki/Go_(programming_language)",
      ],
    ]);
  });

  it("finds several URLs and multi-line text", () => {
    expect(links("1) https://a.com\n2) http://b.com/q?x=1&y=2#h")).toEqual([
      ["https://a.com", "https://a.com"],
      ["http://b.com/q?x=1&y=2#h", "http://b.com/q?x=1&y=2#h"],
    ]);
  });

  it("never links non-http schemes", () => {
    expect(links("javascript:alert(1) mailto:a@b.com file:///etc/passwd")).toEqual([]);
  });
});

describe("linkLabel", () => {
  it("shows the host without www", () => {
    expect(linkLabel("https://www.postgresql.org/docs/16/")).toBe("postgresql.org");
  });

  it("falls back to the raw value when the URL does not parse", () => {
    expect(linkLabel("https://")).toBe("https://");
  });
});
