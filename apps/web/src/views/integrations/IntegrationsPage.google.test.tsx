import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import IntegrationsPage from "./IntegrationsPage";

const googleStatus = vi.fn();
const disconnect = vi.fn();
const legacyCopies = vi.fn();
vi.mock("@/services/integrations-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/integrations-service")>();
  return {
    ...actual,
    integrationsService: {
      linkStatus: vi.fn().mockResolvedValue({ configured: false, linked: false }),
      listPats: vi.fn().mockResolvedValue([]),
      googleStatus: (...a: unknown[]) => googleStatus(...a),
      googleDisconnect: (...a: unknown[]) => disconnect(...a),
      googleLegacyCopies: (...a: unknown[]) => legacyCopies(...a),
      googleLegacyCopiesPurge: vi.fn(),
    },
  };
});

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("./GoogleCalendarSection", () => ({ default: () => <div data-testid="picker-section" /> }));
vi.mock("./IcsExportCard", () => ({ default: () => null }));
vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => null }));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}${JSON.stringify(opts)}` : key),
      i18n: { language: "en" },
    }),
  };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <IntegrationsPage />
    </QueryClientProvider>,
  );
}

const connected = (over: Record<string, unknown> = {}) => ({
  configured: true,
  connected: true,
  connectedAt: null,
  ...over,
});

describe("IntegrationsPage Google card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    legacyCopies.mockResolvedValue({ legacyCopyCount: 4 });
    disconnect.mockResolvedValue(undefined);
  });

  it("with the new calendar feature off (status.v2Enabled false), the count comes from the ungated legacy-copies endpoint and the checkbox is usable: disconnect shows the copy count and an unchecked checkbox instead of disconnecting at once", async () => {
    googleStatus.mockResolvedValue(connected({ v2Enabled: false, mode: "legacy" }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "integrations.disconnect" }));
    expect(disconnect).not.toHaveBeenCalled();
    const box = await screen.findByRole("checkbox", {
      name: /integrations\.googleDisconnect\.deleteCopies\{"count":4\}/,
    });
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleDisconnect.confirm" }));
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it("with the feature on, the same confirmation with the checkbox is shown", async () => {
    googleStatus.mockResolvedValue(connected({ v2Enabled: true, mode: "narrowed" }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "integrations.disconnect" }));
    expect(
      await screen.findByRole("checkbox", { name: /integrations\.googleDisconnect\.deleteCopies/ }),
    ).not.toBeChecked();
  });

  it("shows the purge section even when Google is disconnected", async () => {
    googleStatus.mockResolvedValue({ configured: true, connected: false, connectedAt: null });
    renderPage();
    await screen.findByText(/integrations\.googleLegacyCopies\.count\{"count":4\}/);
    expect(screen.getByRole("button", { name: "integrations.googleLegacyCopies.action" })).toBeEnabled();
  });

  it("disables the purge with a disconnect-first hint while connected on the legacy engine, and enables it otherwise", async () => {
    googleStatus.mockResolvedValue(connected({ v2Enabled: false, mode: "legacy", paused: false }));
    renderPage();
    await screen.findByText(/integrations\.googleLegacyCopies\.count/);
    expect(screen.getByRole("button", { name: "integrations.googleLegacyCopies.action" })).toBeDisabled();
    expect(screen.getByText("integrations.googleLegacyCopies.disconnectFirst")).toBeInTheDocument();
  });

  it.each([
    ["a v2 connection", connected({ v2Enabled: true, mode: "v2_read" })],
    ["a paused narrowed owner", connected({ v2Enabled: false, mode: "legacy", paused: true })],
    ["a disconnected owner", { configured: true, connected: false, connectedAt: null, mode: "legacy" }],
  ])("keeps the purge enabled for %s", async (_label, s) => {
    googleStatus.mockResolvedValue(s);
    renderPage();
    await screen.findByText(/integrations\.googleLegacyCopies\.count/);
    expect(screen.getByRole("button", { name: "integrations.googleLegacyCopies.action" })).toBeEnabled();
    expect(screen.queryByText("integrations.googleLegacyCopies.disconnectFirst")).not.toBeInTheDocument();
  });

  it("shows the paused notice when the legacy sync is paused, and not otherwise", async () => {
    googleStatus.mockResolvedValue(connected({ v2Enabled: false, mode: "narrowed", paused: true }));
    renderPage();
    expect(await screen.findByText("integrations.googlePaused.title")).toBeInTheDocument();
    expect(screen.getByText("integrations.googlePaused.body")).toBeInTheDocument();
  });

  it("hides the paused notice when not paused", async () => {
    googleStatus.mockResolvedValue(connected({ paused: false }));
    renderPage();
    await screen.findByRole("button", { name: "integrations.disconnect" });
    expect(screen.queryByText("integrations.googlePaused.title")).not.toBeInTheDocument();
  });

  describe("description text by connection mode", () => {
    const keys = [
      "integrations.google.descLegacy",
      "integrations.google.descReadOnly",
      "integrations.google.descDisconnected",
    ];
    const expectOnly = (key: string) => {
      expect(screen.getByText(key)).toBeInTheDocument();
      for (const other of keys.filter((k) => k !== key)) {
        expect(screen.queryByText(other)).not.toBeInTheDocument();
      }
      expect(screen.queryByText("integrations.google.desc")).not.toBeInTheDocument();
    };

    it("legacy connection gets the two-way wording", async () => {
      googleStatus.mockResolvedValue(connected({ mode: "legacy" }));
      renderPage();
      await screen.findByRole("button", { name: "integrations.disconnect" });
      expectOnly("integrations.google.descLegacy");
    });

    it("v2_read connection gets the read-only wording", async () => {
      googleStatus.mockResolvedValue(connected({ mode: "v2_read", v2Enabled: true }));
      renderPage();
      await screen.findByRole("button", { name: "integrations.disconnect" });
      expectOnly("integrations.google.descReadOnly");
    });

    it("narrowed connection gets the read-only wording", async () => {
      googleStatus.mockResolvedValue(connected({ mode: "narrowed" }));
      renderPage();
      await screen.findByRole("button", { name: "integrations.disconnect" });
      expectOnly("integrations.google.descReadOnly");
    });

    it("a legacy user with the flag on (mode legacy) gets the two-way wording while the picker section is still rendered", async () => {
      googleStatus.mockResolvedValue(connected({ mode: "legacy", v2Enabled: true }));
      renderPage();
      await screen.findByRole("button", { name: "integrations.disconnect" });
      expectOnly("integrations.google.descLegacy");
      expect(screen.getByTestId("picker-section")).toBeInTheDocument();
    });

    it("a paused connection (flag off, narrowed token) gets the neutral wording, not the two-way one", async () => {
      googleStatus.mockResolvedValue(connected({ mode: "legacy", v2Enabled: false, paused: true }));
      renderPage();
      expect(await screen.findByText("integrations.googlePaused.title")).toBeInTheDocument();
      expectOnly("integrations.google.descDisconnected");
    });

    it("not connected gets the neutral wording even if a stale mode is present", async () => {
      googleStatus.mockResolvedValue({ configured: true, connected: false, connectedAt: null, mode: "legacy" });
      renderPage();
      await screen.findByText(/integrations\.googleLegacyCopies\.count/);
      expectOnly("integrations.google.descDisconnected");
    });

    it("status not yet loaded gets the neutral wording", async () => {
      googleStatus.mockReturnValue(new Promise(() => {}));
      renderPage();
      expectOnly("integrations.google.descDisconnected");
    });
  });
});
