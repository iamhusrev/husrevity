import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import ProfilePage from "./ProfilePage";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
      i18n: { language: "en" },
    }),
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "1",
      email: "owner@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      enabled: true,
      emailNotificationsEnabled: false,
    },
    applyUser: vi.fn(),
  }),
}));

vi.mock("@/services/auth-service", () => ({
  AuthService: { updateProfile: vi.fn(), changePassword: vi.fn() },
}));
vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => <div>crumb</div> }));
vi.mock("@/components/notifications/NotificationDiagnosticsPanel", () => ({
  default: () => null,
}));

afterEach(cleanup);

describe("ProfilePage recently deleted link", () => {
  it("links to the trash screen so deleted items can be found from settings", () => {
    render(<ProfilePage />);
    const link = screen.getByRole("link", { name: /Recently deleted/ });
    expect(link.getAttribute("href")).toBe("/settings/trash");
  });
});
