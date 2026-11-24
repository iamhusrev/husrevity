import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const headerStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import HomePage from "@/app/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { HOME_REDIRECT_SCRIPT } from "./home-redirect-script";
import { content } from "./content";
import { resolvePublicLanguage } from "./language";
import { fetchLegalIdentity } from "./legal";

const GOOGLE_POLICY = "Google API Services User Data Policy";

function mockLegal(data: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => ({ success: true, data }) })),
  );
}

async function renderPage(
  Page: (p: { searchParams: Promise<Record<string, string | undefined>> }) => Promise<React.ReactElement>,
  params: Record<string, string | undefined> = {},
) {
  const ui = await Page({ searchParams: Promise.resolve(params) });
  return render(ui);
}

beforeEach(() => {
  headerStore.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("home_public_and_redirects_session", () => {
  it("renders the public home without any session and does not call the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage(HomePage);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Husrevity");
    expect(screen.getByRole("link", { name: content.en.home.signIn })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: content.en.nav.privacy })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: content.en.nav.terms })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("embeds the pre-paint redirect script on the home page only", async () => {
    const { container, unmount } = await renderPage(HomePage);
    const script = container.querySelector("script");
    expect(script?.innerHTML).toBe(HOME_REDIRECT_SCRIPT);
    unmount();

    mockLegal({ operatorName: null, contactEmail: null });
    const privacy = await renderPage(PrivacyPage);
    expect(privacy.container.querySelector("script")).toBeNull();
  });

  it("redirects to /dashboard only when a session key is present", () => {
    const run = (stored: Record<string, string>, throws = false) => {
      const location = { replace: vi.fn() };
      const localStorage = {
        getItem: (k: string) => {
          if (throws) throw new Error("denied");
          return stored[k] ?? null;
        },
      };
      new Function("localStorage", "location", HOME_REDIRECT_SCRIPT)(localStorage, location);
      return location.replace;
    };

    expect(run({})).not.toHaveBeenCalled();
    expect(run({ "refresh-token": "x" })).not.toHaveBeenCalled();
    expect(run({ "access-token": "x" })).toHaveBeenCalledWith("/dashboard");
    // Blocked storage must never throw out of the script.
    expect(() => run({}, true)).not.toThrow();
    expect(run({}, true)).not.toHaveBeenCalled();
  });
});

describe("privacy_contains_limited_use_and_no_fabricated_identity", () => {
  it("states the Limited Use requirement and names the exact Google policy", async () => {
    mockLegal({ operatorName: null, contactEmail: null });
    const { container } = await renderPage(PrivacyPage);
    const text = container.textContent ?? "";

    expect(text).toContain(GOOGLE_POLICY);
    expect(text).toContain("Limited Use");
    expect(text).toMatch(/not (sent|shared|transferred)[^.]*(Gemini|AI)/i);
    expect(text).toMatch(/disconnect/i);
    expect(text).toMatch(/retention|retain/i);
    expect(
      container.querySelector('a[href="https://developers.google.com/terms/api-services-user-data-policy"]'),
    ).not.toBeNull();
  });

  it("renders no fabricated name or email when the legal identity is missing", async () => {
    mockLegal({ operatorName: null, contactEmail: null });
    const { container } = await renderPage(PrivacyPage);

    expect(container.textContent).not.toContain("@");
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.textContent).toContain(content.en.legal.notConfigured);
  });

  it("renders no fabricated identity when the API is unreachable or malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const down = await renderPage(PrivacyPage);
    expect(down.container.textContent).not.toContain("@");
    expect(down.container.textContent).toContain(content.en.legal.notConfigured);
    down.unmount();

    mockLegal({ operatorName: 42, contactEmail: { x: 1 } });
    const bad = await renderPage(TermsPage);
    expect(bad.container.textContent).not.toContain("@");
    expect(bad.container.textContent).toContain(content.en.legal.notConfigured);
  });

  it("shows the configured operator name and contact email from the API only", async () => {
    mockLegal({ operatorName: "Example Operator", contactEmail: "privacy@example.test" });
    const { container } = await renderPage(PrivacyPage);

    expect(container.textContent).toContain("Example Operator");
    expect(container.querySelector('a[href="mailto:privacy@example.test"]')).not.toBeNull();
    expect(container.textContent).not.toContain(content.en.legal.notConfigured);
  });

  it("is readable while logged in (no session gate, no redirect script)", async () => {
    localStorage.setItem("access-token", "x");
    mockLegal({ operatorName: null, contactEmail: null });
    const { container } = await renderPage(PrivacyPage);
    expect(container.textContent).toContain(GOOGLE_POLICY);
    expect(container.querySelector("script")).toBeNull();
    localStorage.clear();
  });
});

describe("language selection", () => {
  it("defaults to English, honours Accept-Language and lets ?lang= win", async () => {
    expect(resolvePublicLanguage(undefined, null)).toBe("en");
    expect(resolvePublicLanguage(undefined, "de-DE,de;q=0.9")).toBe("en");
    expect(resolvePublicLanguage(undefined, "tr-TR,tr;q=0.9,en;q=0.8")).toBe("tr");
    expect(resolvePublicLanguage(undefined, "en;q=0.5,tr;q=0.9")).toBe("tr");
    expect(resolvePublicLanguage("en", "tr-TR")).toBe("en");
    expect(resolvePublicLanguage("tr", "en-US")).toBe("tr");
    expect(resolvePublicLanguage("xx", "tr")).toBe("tr");

    headerStore.set("accept-language", "tr-TR,tr;q=0.9");
    mockLegal({ operatorName: null, contactEmail: null });
    const { container } = await renderPage(PrivacyPage);
    expect(container.textContent).toContain(GOOGLE_POLICY);
    expect(container.textContent).toContain(content.tr.legal.notConfigured);
  });
});

describe("fetchLegalIdentity", () => {
  it("returns nulls on a non-OK response", async () => {
    mockLegal({ operatorName: "X", contactEmail: "x@example.test" }, false);
    expect(await fetchLegalIdentity()).toEqual({ operatorName: null, contactEmail: null });
  });
});

describe("public content en/tr parity", () => {
  function shape(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(shape);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shape(x)]),
      );
    }
    return typeof v;
  }

  it("en and tr have identical structure and no empty strings", () => {
    expect(shape(content.tr)).toEqual(shape(content.en));
    const walk = (v: unknown) => {
      if (typeof v === "string") expect(v.trim().length).toBeGreaterThan(0);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(content.en);
    walk(content.tr);
  });

  it("the Turkish privacy text also names the policy and Limited Use", () => {
    const text = JSON.stringify(content.tr.privacy);
    expect(text).toContain(GOOGLE_POLICY);
    expect(text).toContain("Limited Use");
  });
});

describe("public content accuracy across Google Calendar modes", () => {
  const PERMISSIONS_URL = "https://myaccount.google.com/permissions";
  const privacy = {
    en: JSON.stringify(content.en.privacy),
    tr: JSON.stringify(content.tr.privacy),
  };
  const terms = { en: JSON.stringify(content.en.terms), tr: JSON.stringify(content.tr.terms) };
  const home = { en: JSON.stringify(content.en.home), tr: JSON.stringify(content.tr.home) };

  it("does not promise read-only access without the legacy-connection exception", () => {
    for (const lang of ["en", "tr"] as const) {
      const all = privacy[lang] + terms[lang] + home[lang];
      // A blanket "always read-only" claim is false for legacy connections.
      expect(all).not.toMatch(/Access is read-only and optional|Erişim salt okunurdur/);
      expect(all).not.toMatch(/Optional Google features are read-only|İsteğe bağlı Google özellikleri salt okunurdur/);
    }
  });

  it("states that legacy connections may write Husrevity events to the Google calendar", () => {
    expect(privacy.en).toMatch(/legacy[^"]*(write|create|update)[^"]*Google calendar/i);
    expect(privacy.tr).toMatch(/eski[^"]*Google takvim[^"]*(yazabilir|oluşturabilir)/i);
    expect(terms.en).toMatch(/legacy/i);
    expect(terms.tr).toMatch(/eski/i);
  });

  it("states that legacy sync may store event descriptions and expose copies through MCP / tokens", () => {
    expect(privacy.en).toMatch(/legacy[^"]*description/i);
    expect(privacy.en).toMatch(/MCP/);
    expect(privacy.en).toMatch(/personal access token/i);
    expect(privacy.tr).toMatch(/eski[^"]*açıklama/i);
    expect(privacy.tr).toMatch(/MCP/);
    expect(privacy.tr).toMatch(/kişisel erişim belirteci/i);
  });

  it("limits the no-descriptions claim to the new read-only engine", () => {
    expect(privacy.en).toMatch(/new read-only[^"]*(titles|times)[^"]*(do not store|no)[^"]*descriptions[^"]*attendees[^"]*locations/i);
    expect(privacy.tr).toMatch(/yeni salt okunur[^"]*başlık[^"]*(saklamayız|saklanmaz)[^"]*açıklama[^"]*katılımcı[^"]*konum/i);
  });

  it("says disconnect keeps existing Husrevity copies unless the user confirms deleting them", () => {
    expect(privacy.en).toMatch(/does not delete[^"]*(copies|events)[^"]*unless you (explicitly )?confirm/i);
    expect(privacy.tr).toMatch(/onaylamadıkça[^"]*silmeyiz|silmeyiz[^"]*onaylamadıkça/i);
    expect(privacy.en).not.toMatch(/permanently delete the Google calendar data we stored\./i);
  });

  it("says revocation can fail, the grant may stay active, and links the Google permissions page", () => {
    expect(privacy.en).toMatch(/revoc?k?ation[^"]*(fail|not succeed)|fail[^"]*revok|revoke[^"]*fail/i);
    expect(privacy.en).toMatch(/may (still )?(stay|remain) active/i);
    expect(privacy.en).toContain(PERMISSIONS_URL);
    expect(privacy.tr).toMatch(/iptal[^"]*başarısız|başarısız[^"]*iptal/i);
    expect(privacy.tr).toMatch(/aktif kalabilir/i);
    expect(privacy.tr).toContain(PERMISSIONS_URL);
  });

  it("describes the disconnect steps: stop channels, revoke, remove stored tokens", () => {
    expect(privacy.en).toMatch(/stop[^"]*notification channels/i);
    expect(privacy.en).toMatch(/revoke[^"]*token/i);
    expect(privacy.en).toMatch(/remove[^"]*stored tokens/i);
    expect(privacy.tr).toMatch(/bildirim kanallarını durdururuz/i);
    expect(privacy.tr).toMatch(/belirteç/i);
  });

  it("says the Husrevity Planner calendar write is optional, off by default and opt-in", () => {
    expect(privacy.en).toMatch(/Husrevity Planner/);
    expect(privacy.en).toMatch(/off by default/i);
    expect(privacy.en).toMatch(/only after you (opt in|turn it on)/i);
    expect(privacy.tr).toMatch(/Husrevity Planner/);
    expect(privacy.tr).toMatch(/varsayılan olarak kapalı/i);
    expect(privacy.tr).toMatch(/yalnızca sen (açtıktan|etkinleştirdikten) sonra/i);
  });

  it("states Google Calendar data is not sent to Gemini or used to train models, in both languages", () => {
    expect(privacy.en).toMatch(/Google Calendar data is not sent to Gemini and is not used to train AI models/i);
    expect(privacy.tr).toMatch(/Gemini/);
    expect(privacy.tr).toMatch(/Google Takvim verileri Gemini'ye gönderilmez/);
    expect(privacy.tr).toMatch(/yapay zeka modellerini eğitmek için kullanılmaz/);
    expect(privacy.en).toMatch(/excludes Google-sourced/i);
    expect(privacy.tr).toMatch(/hariç tutar/i);
  });

  it("says legacy copies are reachable by an AI or MCP client only with the user's own access token", () => {
    expect(privacy.en).toMatch(/legacy synced copies are reachable by an AI or MCP client only if you connect that client with your own access token/i);
    expect(privacy.tr).toMatch(/eski senkronize kopyalara[^"]*yapay zeka veya MCP istemcisi[^"]*yalnızca[^"]*kendi erişim belirteciyle bağlarsan/i);
    // The blanket "never sent to any other AI service" claim is no longer made.
    expect(privacy.en).not.toMatch(/never sent to Gemini/i);
    expect(privacy.en).not.toMatch(/not sent to any other AI/i);
  });

  it("says new-engine connections are read-only unless the user opts in to writing to the Husrevity Planner calendar", () => {
    expect(privacy.en).toMatch(/new read-only connection[^"]*read-only unless you opt in to writing Husrevity events to the managed Husrevity Planner calendar/i);
    expect(privacy.tr).toMatch(/yeni salt okunur bağlantı[^"]*Husrevity Planner[^"]*yazmayı açmadıkça salt okunurdur/i);
    expect(home.en).toMatch(/read-only unless you opt in/i);
    expect(home.tr).toMatch(/açmadıkça salt okunurdur/i);
    expect(terms.en).toMatch(/read-only unless you opt in/i);
    expect(terms.tr).toMatch(/açmadıkça salt okunurdur/i);
  });

  it("says events Husrevity wrote to Google stay after disconnect and explains how to remove them", () => {
    expect(privacy.en).toMatch(/events Husrevity wrote to Google stay in your Google account after you disconnect/i);
    expect(privacy.en).toMatch(/delete the Husrevity Planner calendar or the events in Google Calendar/i);
    expect(privacy.en).toMatch(/Google Account permissions/i);
    expect(privacy.en).toMatch(/turning write off deletes those managed copies from the Husrevity Planner calendar shortly afterwards/i);
    expect(privacy.tr).toMatch(/Husrevity'nin Google'a yazdığı etkinlikler[^"]*bağlantıyı kestikten sonra[^"]*Google hesabında kalır/i);
    expect(privacy.tr).toMatch(/Husrevity Planner takvimini veya etkinlikleri Google Takvim'den sil/i);
    expect(privacy.tr).toMatch(/Google Hesap izinleri/i);
    expect(privacy.tr).toMatch(/yazmayı kapatmak[^"]*Husrevity Planner takviminden[^"]*kısa süre sonra siler/i);
  });

  it("orders the Deletion paragraphs the same way in en and tr (copies kept unless confirmed, then the technical record)", () => {
    const orderOf = (lang: "en" | "tr", keepCopies: RegExp, record: RegExp) => {
      const section = content[lang].privacy.sections.find((x) => /deletion|silme/i.test(x.heading))!;
      const at = (re: RegExp) => section.paragraphs.findIndex((x) => re.test(x));
      return [at(keepCopies), at(record)];
    };
    const en = orderOf("en", /does not delete the synced copies/i, /technical record remains/i);
    const tr = orderOf("tr", /senkronize kopyaları silmeyiz/i, /teknik bir kayıt kalır/i);
    expect(en[0]).toBeGreaterThan(-1);
    expect(tr[0]).toBeGreaterThan(-1);
    expect(en[0]).toBeLessThan(en[1]);
    expect(tr[0]).toBeLessThan(tr[1]);
  });

  it("says disconnect keeps synced copies unless confirmed and they can be deleted later from Settings > Integrations", () => {
    expect(privacy.en).toMatch(/can delete them at any time later from Settings > Integrations/i);
    expect(privacy.tr).toMatch(/Ayarlar > Entegrasyonlar/);
    expect(privacy.tr).toMatch(/daha sonra istediğin zaman[^"]*silebilirsin/i);
  });

  it("states that a technical record remains after disconnecting and how to remove it, in both languages", () => {
    expect(privacy.en).toMatch(/a technical record remains/i);
    expect(privacy.en).toMatch(/calendar identifier/i);
    expect(privacy.en).toMatch(/sync cursor/i);
    expect(privacy.en).toMatch(/event link identifiers/i);
    expect(privacy.en).toMatch(/no access or refresh token/i);
    expect(privacy.en).toMatch(/reconnect/i);
    expect(privacy.en).toMatch(/account deletion request/i);
    expect(privacy.en).toMatch(/keeps the calendar identifier/i);
    expect(privacy.tr).toMatch(/teknik bir kayıt kalır/i);
    expect(privacy.tr).toMatch(/takvim kimliği/i);
    expect(privacy.tr).toMatch(/senkron imleci/i);
    expect(privacy.tr).toMatch(/etkinlik bağlantı kimlikleri/i);
    expect(privacy.tr).toMatch(/erişim veya yenileme belirteci içermez/i);
    expect(privacy.tr).toMatch(/yeniden bağlan/i);
    expect(privacy.tr).toMatch(/hesap silme talebi/i);
    expect(privacy.tr).toMatch(/takvim kimliği (korunur|kalır)/i);
  });

  it("keeps the Limited Use statement and policy name", () => {
    for (const lang of ["en", "tr"] as const) {
      expect(privacy[lang]).toContain("Google API Services User Data Policy");
      expect(privacy[lang]).toMatch(/Limited Use/);
    }
  });

  it("keeps deletion requests on the contact email and invents no identity", () => {
    expect(privacy.en).toMatch(/contact email shown below/i);
    expect(privacy.tr).toMatch(/aşağıda gösterilen iletişim e-postası/i);
    for (const lang of ["en", "tr"] as const) {
      expect(privacy[lang]).not.toContain("@");
    }
  });

  it("terms point to the privacy policy for Google features in both languages", () => {
    expect(terms.en).toMatch(/Privacy Policy/);
    expect(terms.tr).toMatch(/Gizlilik Politikası/);
    expect(terms.en).toMatch(/optional/i);
    expect(terms.tr).toMatch(/isteğe bağlı/i);
  });
});
