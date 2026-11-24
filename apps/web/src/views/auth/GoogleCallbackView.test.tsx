import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React, { StrictMode } from "react";
import GoogleCallbackView, { resetGoogleCallbackGuardForTests } from "./GoogleCallbackView";
import { GOOGLE_VERIFIER_STORAGE_KEY } from "@/utils/google-pkce";

const exchange = vi.fn();
const acceptSession = vi.fn();
const replace = vi.fn();
const refreshSession = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/providers/AuthProvider", () => ({ useAuth: () => ({ acceptSession }) }));
vi.mock("@/services/api-client", () => ({
  refreshSession: (...args: unknown[]) => refreshSession(...args),
}));
vi.mock("@/services/google-login-service", () => ({
  GoogleLoginService: { exchange: (...args: unknown[]) => exchange(...args) },
}));

const session = {
  purpose: "login" as const,
  accessToken: "a",
  refreshToken: "r",
  user: { id: 1, email: "u@example.test" },
};

function visit(hash: string) {
  window.history.replaceState(null, "", `/auth/google/callback${hash}`);
}

beforeEach(() => {
  exchange.mockReset();
  acceptSession.mockReset();
  replace.mockReset();
  refreshSession.mockReset();
  sessionStorage.clear();
  resetGoogleCallbackGuardForTests();
});
afterEach(cleanup);

describe("handoff_clears_fragment_once", () => {
  it("clears the fragment before the exchange call, posts exactly once under Strict Mode and removes the verifier", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=handoff-1");
    let hashAtExchange: string | null = null;
    exchange.mockImplementation(async () => {
      hashAtExchange = window.location.hash;
      return session;
    });

    render(
      <StrictMode>
        <GoogleCallbackView />
      </StrictMode>,
    );

    await waitFor(() => expect(acceptSession).toHaveBeenCalledTimes(1));
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith("handoff-1", "v".repeat(43));
    expect(hashAtExchange).toBe("");
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBeNull();
    expect(acceptSession).toHaveBeenCalledWith({
      accessToken: "a",
      refreshToken: "r",
      user: session.user,
    });
  });

  it("does not call exchange when the fragment is missing", async () => {
    visit("");
    render(
      <StrictMode>
        <GoogleCallbackView />
      </StrictMode>,
    );
    expect(await screen.findByText("googleLogin.errors.missingCode")).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/login");
  });

  it("does not exchange again on a repeat visit after the fragment was consumed", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=once");
    exchange.mockResolvedValue(session);
    const first = render(<GoogleCallbackView />);
    await waitFor(() => expect(acceptSession).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<GoogleCallbackView />);
    expect(await screen.findByText("googleLogin.errors.missingCode")).toBeInTheDocument();
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("shows the denied message without exchanging when Google reports an error", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#error=google_denied");
    render(<GoogleCallbackView />);
    expect(await screen.findByText("googleLogin.errors.denied")).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBeNull();
  });

  it("shows the existing-email guidance on a 409 and still removes the verifier", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=c");
    exchange.mockRejectedValue(
      Object.assign(new Error("conflict"), {
        isAxiosError: true,
        response: { status: 409, data: { message: "An account with this email already exists." } },
      }),
    );
    render(<GoogleCallbackView />);
    expect(await screen.findByText("googleLogin.errors.existingEmail")).toBeInTheDocument();
    expect(acceptSession).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/login");
  });

  it("returns to settings with a success state for the link purpose", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=c");
    exchange.mockResolvedValue({ purpose: "link", linked: true, email: "u@example.test" });
    render(<GoogleCallbackView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/profile?google=linked"));
    expect(acceptSession).not.toHaveBeenCalled();
  });
});

function axiosFailure(status: number, message = "") {
  return Object.assign(new Error(String(status)), {
    isAxiosError: true,
    response: { status, data: { message } },
  });
}

describe("link_exchange_refreshes_session_once", () => {
  it("refreshes the session after a 401 and retries with the same verifier, keeping it until success", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=link-1");
    const verifierAtCall: Array<string | null> = [];
    exchange
      .mockImplementationOnce(async () => {
        verifierAtCall.push(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY));
        throw axiosFailure(401);
      })
      .mockImplementationOnce(async () => {
        verifierAtCall.push(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY));
        return { purpose: "link", linked: true, email: "u@example.test" };
      });
    refreshSession.mockResolvedValue("new-token");

    render(
      <StrictMode>
        <GoogleCallbackView />
      </StrictMode>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/profile?google=linked"));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledTimes(2);
    expect(exchange).toHaveBeenNthCalledWith(1, "link-1", "v".repeat(43));
    expect(exchange).toHaveBeenNthCalledWith(2, "link-1", "v".repeat(43));
    expect(verifierAtCall).toEqual(["v".repeat(43), "v".repeat(43)]);
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBeNull();
  });

  it("treats a second 401 as final: no loop, error shown, verifier removed", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=link-2");
    exchange.mockRejectedValue(axiosFailure(401));
    refreshSession.mockResolvedValue("new-token");

    render(<GoogleCallbackView />);

    expect(await screen.findByText("googleLogin.errors.failed")).toBeInTheDocument();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBeNull();
  });

  it("fails without a retry when the session cannot be refreshed", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=link-3");
    exchange.mockRejectedValue(axiosFailure(401));
    refreshSession.mockRejectedValue(new Error("No refresh token"));

    render(<GoogleCallbackView />);

    expect(await screen.findByText("googleLogin.errors.failed")).toBeInTheDocument();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBeNull();
  });

  it("does not refresh for non-401 failures", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=c");
    exchange.mockRejectedValue(axiosFailure(400));
    render(<GoogleCallbackView />);
    expect(await screen.findByText("googleLogin.errors.badCode")).toBeInTheDocument();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("strict_mode_shows_real_outcome", () => {
  it("shows the real error of a failing exchange on both mounts with one exchange call", async () => {
    sessionStorage.setItem(GOOGLE_VERIFIER_STORAGE_KEY, "v".repeat(43));
    visit("#code=c");
    exchange.mockRejectedValue(axiosFailure(409, "An account with this email already exists."));
    render(
      <StrictMode>
        <GoogleCallbackView />
      </StrictMode>,
    );
    expect(await screen.findByText("googleLogin.errors.existingEmail")).toBeInTheDocument();
    expect(screen.queryByText("googleLogin.errors.missingCode")).toBeNull();
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("shows the denied message under Strict Mode", async () => {
    visit("#error=google_denied");
    render(
      <StrictMode>
        <GoogleCallbackView />
      </StrictMode>,
    );
    expect(await screen.findByText("googleLogin.errors.denied")).toBeInTheDocument();
    expect(screen.queryByText("googleLogin.errors.missingCode")).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });

  it("shows the bad-verifier message under Strict Mode", async () => {
    visit("#code=c");
    render(
      <StrictMode>
        <GoogleCallbackView />
      </StrictMode>,
    );
    expect(await screen.findByText("googleLogin.errors.badCode")).toBeInTheDocument();
    expect(screen.queryByText("googleLogin.errors.missingCode")).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });
});
