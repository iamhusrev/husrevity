import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GoogleSignInCard from "./GoogleSignInCard";

const svc = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  getIdentity: vi.fn(),
  startLink: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/stores/alert-store", () => ({
  alertStore: (selector: (s: { show: () => void }) => unknown) => selector({ show: () => {} }),
}));
vi.mock("@/utils/handleError", () => ({ parseAxiosError: () => ({ title: "", message: "" }) }));
vi.mock("@/services/google-login-service", () => ({ GoogleLoginService: svc }));

beforeEach(() => {
  Object.values(svc).forEach((m) => m.mockReset());
  svc.isEnabled.mockResolvedValue(true);
  window.history.replaceState(null, "", "/settings/profile");
});
afterEach(cleanup);

describe("GoogleSignInCard", () => {
  it("renders nothing when the feature is disabled", async () => {
    svc.isEnabled.mockResolvedValue(false);
    const { container } = render(<GoogleSignInCard />);
    await waitFor(() => expect(svc.isEnabled).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(svc.getIdentity).not.toHaveBeenCalled();
  });

  it("offers linking when nothing is linked", async () => {
    svc.getIdentity.mockResolvedValue({ linked: false, email: null, passwordLoginEnabled: true });
    svc.startLink.mockResolvedValue(undefined);
    render(<GoogleSignInCard />);
    fireEvent.click(await screen.findByRole("button", { name: "googleLogin.settings.link" }));
    await waitFor(() => expect(svc.startLink).toHaveBeenCalledTimes(1));
  });

  it("lets a user with a password unlink", async () => {
    svc.getIdentity.mockResolvedValue({ linked: true, email: "u@example.test", passwordLoginEnabled: true });
    svc.unlink.mockResolvedValue(undefined);
    render(<GoogleSignInCard />);
    const btn = await screen.findByRole("button", { name: "googleLogin.settings.unlink" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(svc.unlink).toHaveBeenCalledTimes(1));
  });

  it("disables unlink with an explanation when password login is not enabled", async () => {
    svc.getIdentity.mockResolvedValue({ linked: true, email: "u@example.test", passwordLoginEnabled: false });
    render(<GoogleSignInCard />);
    const btn = await screen.findByRole("button", { name: "googleLogin.settings.unlink" });
    expect(btn).toBeDisabled();
    expect(screen.getByText("googleLogin.settings.unlinkDisabled")).toBeInTheDocument();
  });
});
