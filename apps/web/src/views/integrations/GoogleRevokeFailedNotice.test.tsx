import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import GoogleRevokeFailedNotice from "./GoogleRevokeFailedNotice";
import enMessages from "@/messages/en.json";
import trMessages from "@/messages/tr.json";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: "en" },
    }),
  };
});

describe("GoogleRevokeFailedNotice", () => {
  it("tells the user the grant may still be active and links to the Google Account permissions page", () => {
    render(<GoogleRevokeFailedNotice revokeFailed connected={false} />);

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent("integrations.googleRevokeFailed.title");
    expect(notice).toHaveTextContent("integrations.googleRevokeFailed.body");
    const link = screen.getByRole("link", { name: "integrations.googleRevokeFailed.link" });
    expect(link).toHaveAttribute("href", "https://myaccount.google.com/permissions");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it.each([
    ["flag false", { revokeFailed: false, connected: false }],
    ["flag missing (older API)", { revokeFailed: undefined, connected: false }],
    ["connected again", { revokeFailed: true, connected: true }],
  ])("renders nothing when %s", (_name, props) => {
    const { container } = render(<GoogleRevokeFailedNotice {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has English and Turkish copy for the notice and the write-off removal", () => {
    for (const messages of [enMessages, trMessages]) {
      const i = (messages as unknown as { integrations: Record<string, Record<string, string>> }).integrations;
      expect(i.googleRevokeFailed.title.length).toBeGreaterThan(0);
      expect(i.googleRevokeFailed.body).toMatch(/Google/);
      expect(i.googleRevokeFailed.link.length).toBeGreaterThan(0);
      expect(i.googleWrite.explain).toMatch(/Husrevity Planner/);
      expect(i.googleWrite.explain).not.toMatch(/does not delete anything|silmez\.$/);
    }
  });
});
