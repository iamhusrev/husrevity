import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import React, { StrictMode } from "react";
import GoogleCalendarCallbackView, {
  resetGoogleCalendarCallbackGuardForTests,
} from "./GoogleCalendarCallbackView";
import {
  GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY,
  GOOGLE_VERIFIER_STORAGE_KEY,
} from "@/utils/google-pkce";

const googleExchange = vi.fn();
const replace = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/services/integrations-service", () => ({
  integrationsService: { googleExchange: (...args: unknown[]) => googleExchange(...args) },
}));

function visit(hash: string) {
  window.history.replaceState(null, "", `/settings/integrations/google-callback${hash}`);
}

beforeEach(() => {
  googleExchange.mockReset();
  replace.mockReset();
  sessionStorage.clear();
  resetGoogleCalendarCallbackGuardForTests();
});
afterEach(cleanup);

describe("calendar_handoff_clears_fragment_once", () => {
  it("clears the fragment before the exchange, posts exactly once under Strict Mode, removes the verifier and reports connected", async () => {
    sessionStorage.setItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=handoff-1");
    let hashAtExchange: string | null = null;
    googleExchange.mockImplementation(async () => {
      hashAtExchange = window.location.hash;
      return { kind: "connect", connected: true };
    });

    render(
      <StrictMode>
        <GoogleCalendarCallbackView />
      </StrictMode>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/integrations?google=connected"));
    expect(googleExchange).toHaveBeenCalledTimes(1);
    expect(googleExchange).toHaveBeenCalledWith("handoff-1", "v".repeat(43));
    expect(hashAtExchange).toBe("");
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY)).toBeNull();
  });

  it("never touches the sign-in verifier slot", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "login-verifier");
    sessionStorage.setItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=handoff-1");
    googleExchange.mockResolvedValue({ kind: "narrow", connected: true });
    render(<GoogleCalendarCallbackView />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBe("login-verifier");
  });

  it("exchanges nothing and reports an error when this session holds no verifier (a link someone else started)", async () => {
    visit("#code=attackers-flow");
    render(<GoogleCalendarCallbackView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/integrations?google=error"));
    expect(googleExchange).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("exchanges nothing when Google was denied or the fragment is missing", async () => {
    sessionStorage.setItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#error=google_denied");
    render(<GoogleCalendarCallbackView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/integrations?google=error"));
    expect(googleExchange).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY)).toBeNull();
  });

  it("reports an error when the API rejects the exchange or answers connected false", async () => {
    sessionStorage.setItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=h");
    googleExchange.mockRejectedValue(new Error("400"));
    render(<GoogleCalendarCallbackView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/integrations?google=error"));

    cleanup();
    replace.mockReset();
    resetGoogleCalendarCallbackGuardForTests();
    sessionStorage.setItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=h2");
    googleExchange.mockResolvedValue({ kind: "narrow", connected: false });
    render(<GoogleCalendarCallbackView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/integrations?google=error"));
  });

  it("reports the real outcome under Strict Mode for a failing exchange and for a denied consent, with one exchange", async () => {
    sessionStorage.setItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=h");
    googleExchange.mockRejectedValue(new Error("400"));
    render(
      <StrictMode>
        <GoogleCalendarCallbackView />
      </StrictMode>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/integrations?google=error"));
    expect(googleExchange).toHaveBeenCalledTimes(1);

    cleanup();
    replace.mockReset();
    resetGoogleCalendarCallbackGuardForTests();
    sessionStorage.setItem(GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#error=google_denied");
    render(
      <StrictMode>
        <GoogleCalendarCallbackView />
      </StrictMode>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/integrations?google=error"));
    expect(googleExchange).toHaveBeenCalledTimes(1);
  });
});
