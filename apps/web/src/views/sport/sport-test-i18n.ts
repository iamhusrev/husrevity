// Test-only `t` that resolves keys against the real Turkish bundle (the
// primary language) and interpolates `{{name}}`, so component tests assert
// the strings the owner sees and prove the keys exist. Missing keys fall back
// to the default value, then to the key itself, like i18next.
import tr from "@/messages/tr.json";

function lookup(key: string): string | undefined {
  let node: unknown = tr;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) =>
    name in values ? String(values[name]) : `{{${name}}}`,
  );
}

export function trT(key: string, a?: unknown, b?: unknown): string {
  const fallback = typeof a === "string" ? a : undefined;
  const options =
    a && typeof a === "object"
      ? (a as Record<string, unknown>)
      : b && typeof b === "object"
        ? (b as Record<string, unknown>)
        : {};
  return interpolate(lookup(key) ?? fallback ?? key, options);
}

/** Drop-in `useTranslation` mock: `vi.mock("react-i18next", () => trI18nMock())`. */
export function trUseTranslation() {
  return { t: trT, i18n: { language: "tr" } };
}
