import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GoogleSignInButton from "./GoogleSignInButton";

const isEnabled = vi.fn();
const startLogin = vi.fn();

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/services/google-login-service", () => ({
  GoogleLoginService: {
    isEnabled: () => isEnabled(),
    startLogin: () => startLogin(),
  },
}));

beforeEach(() => {
  isEnabled.mockReset();
  startLogin.mockReset();
});
afterEach(cleanup);

describe("GoogleSignInButton visibility", () => {
  it("shows the button only when the API reports the feature enabled", async () => {
    isEnabled.mockResolvedValue(true);
    render(<GoogleSignInButton />);
    expect(await screen.findByRole("button", { name: "googleLogin.continue" })).toBeInTheDocument();
  });

  it("renders nothing when the feature is disabled", async () => {
    isEnabled.mockResolvedValue(false);
    const { container } = render(<GoogleSignInButton />);
    await waitFor(() => expect(isEnabled).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and does not throw when the config request fails", async () => {
    isEnabled.mockRejectedValue(new Error("network"));
    const { container } = render(<GoogleSignInButton />);
    await waitFor(() => expect(isEnabled).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("starts the Google flow on click", async () => {
    isEnabled.mockResolvedValue(true);
    startLogin.mockResolvedValue(undefined);
    render(<GoogleSignInButton />);
    fireEvent.click(await screen.findByRole("button", { name: "googleLogin.continue" }));
    await waitFor(() => expect(startLogin).toHaveBeenCalledTimes(1));
  });
});
