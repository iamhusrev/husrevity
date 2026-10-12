import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every full-screen overlay (a `fixed` element covering the viewport) must go through the shared
 * Dialog component so it gets the same role/aria, focus handling, Tab trap, Escape layering and
 * scroll lock. Overlays are detected by class TOKENS inside a single string literal, so spacing,
 * order and template literals do not hide them. A file may not contain more raw overlays than
 * `<Dialog` elements (each Dialog's own `overlayClassName` is one raw overlay). Files that
 * legitimately do not are listed here, one reason each.
 */
const ALLOW_LIST: Record<string, string> = {
  "components/ui/Dialog.tsx": "The shared component itself renders the overlay.",
  "views/calendar/CalendarPage.tsx":
    "Legacy page, unreferenced and scheduled for deletion (redesign decision D-4).",
  "components/datetime/DateTimePicker.tsx":
    "Desktop: a non-modal anchored popover that closes through useEscapeLayer. MOBILE: the same " +
    "panel gets a `fixed inset-0 z-[100001]` dimming backdrop and a bottom sheet WITHOUT " +
    "role/aria-modal, scroll lock or Tab trap, so the 'non-modal popover' reason covers desktop " +
    "only. Migrating the mobile sheet to Dialog needs a visual check (see " +
    "docs/redesign/ertelenen-adimlar.md).",
};

/** Files whose extra raw overlays are decorative backdrops owned by a Dialog, with the count. */
const EXTRA_BACKDROPS: Record<string, { count: number; reason: string }> = {
  "components/modal/index.tsx": {
    count: 1,
    reason: "The separate `data-dialog-backdrop` element passed to Dialog as beforePanel.",
  },
};

// Double-quoted JSX attributes may span lines; single quotes may not (apostrophes in prose).
const STRING_LITERAL = /"([^"]*)"|'([^'\n]*)'|`([^`]*)`/g;

/** True when one class string, split on whitespace, describes a viewport covering overlay. */
function isOverlayClassString(value: string): boolean {
  const tokens = new Set(
    value
      .split(/\s+/)
      .filter(Boolean)
      // `md:inset-0` still covers the viewport at that breakpoint.
      .map((token) => token.split(":").pop() as string),
  );
  if (!tokens.has("fixed")) return false;
  if (tokens.has("inset-0")) return true;
  if (tokens.has("inset-x-0") && tokens.has("inset-y-0")) return true;
  return (
    tokens.has("top-0") && tokens.has("left-0") && tokens.has("w-full") && tokens.has("h-full")
  );
}

/** Number of string literals in `source` that are raw full-screen overlays. */
export function countRawOverlays(source: string): number {
  let count = 0;
  for (const match of source.matchAll(STRING_LITERAL)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (isOverlayClassString(value)) count += 1;
  }
  return count;
}

/** Number of `<Dialog` elements, matched as a whole word (not `<DialogFoo`). */
export function countDialogs(source: string): number {
  return (source.match(/<Dialog\b/g) ?? []).length;
}

function scan(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") files.push(...scan(full));
    } else if (entry.name.endsWith(".tsx") && !/\.test\.tsx$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("overlay contract", () => {
  const srcDir = path.resolve(__dirname, "..");
  const files = scan(srcDir);

  it("scans the web sources", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no file has more raw full-screen overlays than shared Dialogs", () => {
    const offenders = files
      .map((file) => ({ file, rel: path.relative(srcDir, file).split(path.sep).join("/") }))
      .filter(({ file, rel }) => {
        if (rel in ALLOW_LIST) return false;
        const source = fs.readFileSync(file, "utf8");
        const raw = countRawOverlays(source);
        if (raw === 0) return false;
        const allowed = countDialogs(source) + (EXTRA_BACKDROPS[rel]?.count ?? 0);
        return raw > allowed;
      })
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
  });

  it("every extra-backdrop entry still matches the file", () => {
    for (const [rel, { count }] of Object.entries(EXTRA_BACKDROPS)) {
      const source = fs.readFileSync(path.join(srcDir, rel), "utf8");
      expect(countRawOverlays(source) - countDialogs(source), rel).toBe(count);
    }
  });

  it("every allow-list entry still exists", () => {
    for (const rel of Object.keys(ALLOW_LIST)) {
      expect(fs.existsSync(path.join(srcDir, rel)), rel).toBe(true);
    }
  });
});

describe("overlay detection", () => {
  const overlays: Array<[string, string]> = [
    ["literal", '<div className="fixed inset-0 z-50">'],
    ["reversed order", '<div className="inset-0 z-50 fixed">'],
    ["extra spacing and newline", '<div className="fixed   z-50\n  inset-0">'],
    ["single quotes", "<div className='fixed inset-0'>"],
    ["template literal", "<div className={`fixed inset-0 ${open ? 'a' : 'b'}`}>"],
    ["cn() argument", 'className={cn("flex", "fixed inset-0 bg-black/40")}'],
    ["inset-x and inset-y", '<div className="fixed inset-x-0 inset-y-0">'],
    ["top left full size", '<div className="fixed top-0 left-0 w-full h-full">'],
    ["breakpoint prefix", '<div className="fixed md:inset-0">'],
  ];
  const notOverlays: Array<[string, string]> = [
    ["fixed without inset", '<div className="fixed bottom-4 right-4">'],
    ["inset without fixed", '<div className="absolute inset-0">'],
    ["sticky inset", '<div className="sticky inset-0">'],
    ["fixed top-0 left-0 without size", '<div className="fixed top-0 left-0">'],
    ["tokens in separate literals", '<div className={a ? "fixed" : "inset-0"}>'],
    ["lookalike token", '<div className="fixed inset-0.5">'],
    ["unrelated prose", "// we use fixed here but no overlay"],
  ];

  it.each(overlays)("detects a raw overlay: %s", (_name, source) => {
    expect(countRawOverlays(source)).toBe(1);
  });

  it.each(notOverlays)("ignores: %s", (_name, source) => {
    expect(countRawOverlays(source)).toBe(0);
  });

  it("counts every overlay literal in a file", () => {
    const source = '<a className="fixed inset-0" /><b className="fixed inset-0 z-10" />';
    expect(countRawOverlays(source)).toBe(2);
  });

  it("matches <Dialog as a whole word only", () => {
    expect(countDialogs("<Dialog open />")).toBe(1);
    expect(countDialogs("<Dialog\n  open\n/>")).toBe(1);
    expect(countDialogs("<DialogFoo /><DialogPanel />")).toBe(0);
    expect(countDialogs("<Dialog /><Dialog /><DialogFoo />")).toBe(2);
  });
});
