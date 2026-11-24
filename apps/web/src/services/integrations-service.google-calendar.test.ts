import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationsService } from "./integrations-service";
import { challengeFor, GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY as KEY } from "@/utils/google-pkce";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();

vi.mock("./api-client", () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    put: (...a: unknown[]) => put(...a),
  },
}));

const ok = <T,>(data: T) => ({ data: { success: true, message: "OK", code: 200, data } });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  put.mockReset();
  sessionStorage.clear();
});

describe("google calendar consent starts with a PKCE challenge", () => {
  it("connect-url sends only the challenge and keeps the verifier in sessionStorage", async () => {
    get.mockResolvedValue(ok({ url: "https://api.example.test/start?ticket=t" }));

    await expect(integrationsService.googleConnectUrl()).resolves.toBe("https://api.example.test/start?ticket=t");

    const verifier = sessionStorage.getItem(KEY)!;
    expect(verifier).toBeTruthy();
    const params = get.mock.calls[0][1].params as { codeChallenge: string };
    expect(params.codeChallenge).toBe(await challengeFor(verifier));
    expect(JSON.stringify(get.mock.calls)).not.toContain(verifier);
  });

  it("narrow sends the challenge in the body", async () => {
    post.mockResolvedValue(ok({ url: "https://api.example.test/start?ticket=n" }));
    await integrationsService.googleNarrowUrl();
    const verifier = sessionStorage.getItem(KEY)!;
    expect(post.mock.calls[0][1]).toEqual({ codeChallenge: await challengeFor(verifier) });
  });

  it("enabling write sends the challenge and keeps the verifier only when a consent URL comes back", async () => {
    put.mockResolvedValueOnce(ok({ enabled: false, consentUrl: "https://api.example.test/start?ticket=w" }));
    await integrationsService.googleSetWrite(true);
    const verifier = sessionStorage.getItem(KEY)!;
    expect(put.mock.calls[0][1]).toEqual({ enabled: true, codeChallenge: await challengeFor(verifier) });

    sessionStorage.clear();
    put.mockResolvedValueOnce(ok({ enabled: true, consentUrl: null }));
    await integrationsService.googleSetWrite(true);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("disabling write sends no challenge and stores no verifier", async () => {
    put.mockResolvedValue(ok({ enabled: false, consentUrl: null }));
    await integrationsService.googleSetWrite(false);
    expect(put.mock.calls[0][1]).toEqual({ enabled: false });
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("leaves no verifier behind when the start request fails", async () => {
    get.mockRejectedValue(new Error("500"));
    await expect(integrationsService.googleConnectUrl()).rejects.toThrow();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("exchange posts the handoff code and verifier to the Bearer-authenticated route", async () => {
    post.mockResolvedValue(ok({ kind: "connect", connected: true }));
    await expect(integrationsService.googleExchange("h", "v".repeat(43))).resolves.toEqual({
      kind: "connect",
      connected: true,
    });
    expect(post).toHaveBeenCalledWith("/integrations/google-calendar/exchange", { code: "h", verifier: "v".repeat(43) });
  });
});
