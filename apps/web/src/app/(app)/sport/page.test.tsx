import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import SportPage from "./page";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
      i18n: { language: "tr" },
    }),
  };
});

vi.mock("@/components/common/PageBreadcrumb", () => ({
  default: ({ pageTitle }: { pageTitle: string }) => <h1>{pageTitle}</h1>,
}));

vi.mock("@/views/sport/SportHome", () => ({
  default: () => <div data-testid="sport-home" />,
}));

afterEach(cleanup);

describe("SportPage", () => {
  it("renders the Sport title and the Today home", () => {
    render(<SportPage />);
    expect(screen.getByRole("heading", { name: "Spor" })).toBeInTheDocument();
    expect(screen.getByTestId("sport-home")).toBeInTheDocument();
  });
});
