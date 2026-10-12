import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

function scanSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        files.push(...scanSourceFiles(full));
      }
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("i18n static validation", () => {
  const srcDir = path.resolve(__dirname, "..");
  const trPath = path.join(srcDir, "messages", "tr.json");
  const enPath = path.join(srcDir, "messages", "en.json");

  const trJson = JSON.parse(fs.readFileSync(trPath, "utf8"));
  const enJson = JSON.parse(fs.readFileSync(enPath, "utf8"));

  const trKeys = new Set(flattenKeys(trJson));
  const enKeys = new Set(flattenKeys(enJson));

  it("tr.json and en.json have identical key sets", () => {
    const missingInEn = [...trKeys].filter((k) => !enKeys.has(k)).sort();
    const missingInTr = [...enKeys].filter((k) => !trKeys.has(k)).sort();

    expect(missingInEn).toEqual([]);
    expect(missingInTr).toEqual([]);
    expect(trKeys.size).toBe(enKeys.size);
  });

  it("month.panel.deleteSeriesConfirm is fully translated in Turkish (no English fragment)", () => {
    const tr: string = trJson.month.panel.deleteSeriesConfirm;
    const en: string = enJson.month.panel.deleteSeriesConfirm;
    expect(tr).not.toBe(en);
    expect(tr).not.toMatch(/entire series/i);
  });

  it("every literal key passed to t(...) in src/ exists in both tr.json and en.json", () => {
    // Note: dynamic keys using template literals or variables (e.g. t(`status.${s}`))
    // are evaluated at runtime and are out of scope for this static literal check.
    const files = scanSourceFiles(srcDir);
    const literalKeyRegex = /\bt\(\s*["']([a-zA-Z0-9_.-]+)["']/g;

    const usedKeys = new Set<string>();
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      let match;
      while ((match = literalKeyRegex.exec(content)) !== null) {
        usedKeys.add(match[1]);
      }
    }

    const missingInTr: string[] = [];
    const missingInEn: string[] = [];

    for (const key of usedKeys) {
      if (!trKeys.has(key)) missingInTr.push(key);
      if (!enKeys.has(key)) missingInEn.push(key);
    }

    expect(missingInTr.sort()).toEqual([]);
    expect(missingInEn.sort()).toEqual([]);
  });
});
