import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import GoogleCalendarSection from "./GoogleCalendarSection";
import { alertStore } from "@/stores/alert-store";
import type { GoogleCalendarChoice, GoogleStatus } from "@/services/integrations-service";

const googleStatus = vi.fn();
const googleCalendars = vi.fn();
const googleSaveSelection = vi.fn();
const googleConnectUrl = vi.fn();
const googleNarrowUrl = vi.fn();
const googleSetWrite = vi.fn();
const googleMigrateLegacy = vi.fn();
vi.mock("@/services/integrations-service", () => ({
  integrationsService: {
    googleStatus: (...a: unknown[]) => googleStatus(...a),
    googleCalendars: (...a: unknown[]) => googleCalendars(...a),
    googleSaveSelection: (...a: unknown[]) => googleSaveSelection(...a),
    googleConnectUrl: (...a: unknown[]) => googleConnectUrl(...a),
    googleNarrowUrl: (...a: unknown[]) => googleNarrowUrl(...a),
    googleSetWrite: (...a: unknown[]) => googleSetWrite(...a),
    googleMigrateLegacy: (...a: unknown[]) => googleMigrateLegacy(...a),
  },
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) =>
        opts ? `${key}${JSON.stringify(opts)}` : key,
      i18n: { language: "en" },
    }),
  };
});

const status = (over: Partial<GoogleStatus> = {}): GoogleStatus => ({
  configured: true,
  connected: true,
  connectedAt: "2026-06-01T08:00:00.000Z",
  v2Enabled: true,
  mode: "v2_read",
  needsReconnect: false,
  selectedCount: 1,
  lastSyncAt: null,
  lastError: null,
  writeEnabled: false,
  ...over,
});

const cal = (over: Partial<GoogleCalendarChoice> & { id: string }): GoogleCalendarChoice => ({
  summary: over.id,
  backgroundColor: null,
  accessRole: "owner",
  primary: false,
  selected: false,
  managed: false,
  ...over,
});

const CALENDARS: GoogleCalendarChoice[] = [
  cal({ id: "primary", summary: "Personal", primary: true, selected: true, backgroundColor: "#112233" }),
  cal({ id: "work", summary: "Work", backgroundColor: "#445566" }),
  cal({ id: "managed", summary: "Husrevity", managed: true }),
  cal({ id: "busy", summary: "Busy only", accessRole: "freeBusyReader" }),
];

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GoogleCalendarSection />
    </QueryClientProvider>,
  );
}

describe("GoogleCalendarSection", () => {
  let showSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    googleStatus.mockResolvedValue(status());
    googleCalendars.mockResolvedValue(CALENDARS);
    googleSaveSelection.mockResolvedValue({ selected: ["primary", "work"] });
    showSpy = vi.spyOn(alertStore.getState(), "show");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("visibility", () => {
    it.each([
      ["v2 is disabled", status({ v2Enabled: false })],
      ["an older API does not report v2 at all", { configured: true, connected: true, connectedAt: null } as GoogleStatus],
      ["Google is not connected", status({ connected: false })],
      ["Google is not configured", status({ configured: false })],
    ])("is hidden and never loads calendars when %s", async (_label, s) => {
      googleStatus.mockResolvedValue(s);
      const { container } = renderSection();
      await waitFor(() => expect(googleStatus).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(container).toBeEmptyDOMElement();
      expect(googleCalendars).not.toHaveBeenCalled();
    });
  });

  describe("calendar picker", () => {
    it("loads the calendars with their selection state and the read-only note", async () => {
      renderSection();
      expect(await screen.findByRole("checkbox", { name: /Personal/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Work/ })).not.toBeChecked();
      expect(screen.getByText("integrations.googleCalendars.note")).toBeInTheDocument();
      expect(screen.getByText("integrations.googleCalendars.primary")).toBeInTheDocument();
    });

    it("is shown to a legacy-mode user with the flag on so they can move to the new model", async () => {
      googleStatus.mockResolvedValue(status({ mode: "legacy" }));
      renderSection();
      expect(await screen.findByRole("checkbox", { name: /Work/ })).toBeInTheDocument();
    });

    it("shows a colour dot per calendar", async () => {
      renderSection();
      await screen.findByRole("checkbox", { name: /Personal/ });
      expect(screen.getByTestId("color-dot-primary")).toHaveStyle({ backgroundColor: "#112233" });
      expect(screen.getByTestId("color-dot-work")).toHaveStyle({ backgroundColor: "#445566" });
    });

    it("disables the managed and free/busy-only calendars and explains why", async () => {
      renderSection();
      const managed = await screen.findByRole("checkbox", { name: /Husrevity/ });
      const busy = screen.getByRole("checkbox", { name: /Busy only/ });
      expect(managed).toBeDisabled();
      expect(busy).toBeDisabled();
      expect(screen.getByText("integrations.googleCalendars.managed")).toBeInTheDocument();
      expect(screen.getByText("integrations.googleCalendars.freeBusy")).toBeInTheDocument();
    });

    it("keeps the save button disabled until the selection changes", async () => {
      renderSection();
      await screen.findByRole("checkbox", { name: /Work/ });
      const save = screen.getByRole("button", { name: "integrations.googleCalendars.save" });
      expect(save).toBeDisabled();
      await userEvent.click(screen.getByRole("checkbox", { name: /Work/ }));
      expect(save).toBeEnabled();
      await userEvent.click(screen.getByRole("checkbox", { name: /Work/ }));
      expect(save).toBeDisabled();
    });

    it("toggles and saves the selected ids, then confirms with a toast", async () => {
      renderSection();
      await userEvent.click(await screen.findByRole("checkbox", { name: /Work/ }));
      await userEvent.click(screen.getByRole("button", { name: "integrations.googleCalendars.save" }));

      await waitFor(() => expect(googleSaveSelection).toHaveBeenCalledTimes(1));
      expect([...googleSaveSelection.mock.calls[0][0]].sort()).toEqual(["primary", "work"]);
      await waitFor(() =>
        expect(showSpy).toHaveBeenCalledWith(
          expect.objectContaining({ title: "integrations.googleCalendars.saved", type: "success" }),
        ),
      );
    });

    it("can deselect everything", async () => {
      googleSaveSelection.mockResolvedValue({ selected: [] });
      renderSection();
      await userEvent.click(await screen.findByRole("checkbox", { name: /Personal/ }));
      await userEvent.click(screen.getByRole("button", { name: "integrations.googleCalendars.save" }));
      await waitFor(() => expect(googleSaveSelection).toHaveBeenCalledWith([]));
    });

    it("refreshes the calendars and the status after a successful save", async () => {
      renderSection();
      await userEvent.click(await screen.findByRole("checkbox", { name: /Work/ }));
      const listCalls = googleCalendars.mock.calls.length;
      const statusCalls = googleStatus.mock.calls.length;
      await userEvent.click(screen.getByRole("button", { name: "integrations.googleCalendars.save" }));
      await waitFor(() => expect(googleCalendars.mock.calls.length).toBeGreaterThan(listCalls));
      await waitFor(() => expect(googleStatus.mock.calls.length).toBeGreaterThan(statusCalls));
    });

    it("keeps the draft and raises an error alert when saving fails", async () => {
      googleSaveSelection.mockRejectedValue(new Error("boom"));
      renderSection();
      await userEvent.click(await screen.findByRole("checkbox", { name: /Work/ }));
      await userEvent.click(screen.getByRole("button", { name: "integrations.googleCalendars.save" }));

      await waitFor(() =>
        expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })),
      );
      expect(screen.getByRole("checkbox", { name: /Work/ })).toBeChecked();
      expect(screen.getByRole("button", { name: "integrations.googleCalendars.save" })).toBeEnabled();
    });
  });

  describe("error and empty states", () => {
    it("shows an error with a retry when the calendar list cannot be loaded", async () => {
      googleCalendars.mockRejectedValueOnce(new Error("502"));
      renderSection();
      expect(await screen.findByText("integrations.googleCalendars.loadError")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "integrations.googleCalendars.retry" }));
      expect(await screen.findByRole("checkbox", { name: /Personal/ })).toBeInTheDocument();
      expect(googleCalendars).toHaveBeenCalledTimes(2);
    });

    it("shows an empty message when Google returns no calendars", async () => {
      googleCalendars.mockResolvedValue([]);
      renderSection();
      expect(await screen.findByText("integrations.googleCalendars.empty")).toBeInTheDocument();
    });
  });

  describe("status", () => {
    it("shows the selected count and the last sync time", async () => {
      googleStatus.mockResolvedValue(status({ selectedCount: 2, lastSyncAt: "2026-06-12T10:00:00.000Z" }));
      renderSection();
      await screen.findByRole("checkbox", { name: /Personal/ });
      expect(screen.getByText(/integrations\.googleCalendars\.selectedCount\{"count":2\}/)).toBeInTheDocument();
      expect(screen.getByText(/integrations\.googleCalendars\.lastSync\{"time":/)).toBeInTheDocument();
    });

    it("says so when nothing has synced yet", async () => {
      renderSection();
      await screen.findByRole("checkbox", { name: /Personal/ });
      expect(screen.getByText("integrations.googleCalendars.neverSynced")).toBeInTheDocument();
    });

    it("shows the sanitized last error", async () => {
      googleStatus.mockResolvedValue(status({ lastError: "google_500" }));
      renderSection();
      expect(await screen.findByText(/integrations\.googleCalendars\.lastError\{"error":"google_500"\}/)).toBeInTheDocument();
    });

    it("shows the reconnect banner with a working action when access must be renewed", async () => {
      googleStatus.mockResolvedValue(status({ needsReconnect: true }));
      googleConnectUrl.mockResolvedValue("https://api.example.test/start?ticket=t");
      const assign = vi.fn();
      Object.defineProperty(window, "location", { value: { href: "", assign }, writable: true });
      renderSection();

      const banner = await screen.findByRole("alert");
      expect(within(banner).getByText("integrations.googleCalendars.needsReconnect")).toBeInTheDocument();
      await userEvent.click(within(banner).getByRole("button", { name: "integrations.googleCalendars.reconnect" }));
      await waitFor(() => expect(googleConnectUrl).toHaveBeenCalled());
      await waitFor(() => expect(window.location.href).toBe("https://api.example.test/start?ticket=t"));
    });

    it("does not show the banner when no reconnect is needed", async () => {
      renderSection();
      await screen.findByRole("checkbox", { name: /Personal/ });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("narrow permissions", () => {
    it("is offered with an explanation only in v2_read mode", async () => {
      renderSection();
      expect(await screen.findByText("integrations.googleNarrow.title")).toBeInTheDocument();
      expect(screen.getByText("integrations.googleNarrow.explain")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "integrations.googleNarrow.action" })).toBeInTheDocument();
    });

    it.each(["narrowed", "legacy"] as const)("is not offered in %s mode", async (mode) => {
      googleStatus.mockResolvedValue(status({ mode }));
      renderSection();
      await screen.findByRole("checkbox", { name: /Personal/ });
      expect(screen.queryByText("integrations.googleNarrow.title")).not.toBeInTheDocument();
    });

    it("asks for a confirmation first and does nothing when cancelled", async () => {
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "integrations.googleNarrow.action" }));
      expect(googleNarrowUrl).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "integrations.googleNarrow.cancel" }));
      expect(screen.getByRole("button", { name: "integrations.googleNarrow.action" })).toBeInTheDocument();
      expect(googleNarrowUrl).not.toHaveBeenCalled();
    });

    it("calls the narrow endpoint on confirmation and navigates to the returned start URL", async () => {
      googleNarrowUrl.mockResolvedValue("https://api.example.test/start?ticket=n");
      Object.defineProperty(window, "location", { value: { href: "", assign: vi.fn() }, writable: true });
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "integrations.googleNarrow.action" }));
      await userEvent.click(screen.getByRole("button", { name: "integrations.googleNarrow.confirm" }));

      await waitFor(() => expect(googleNarrowUrl).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(window.location.href).toBe("https://api.example.test/start?ticket=n"));
    });

    it("raises an error alert and returns to the action when the request fails", async () => {
      googleNarrowUrl.mockRejectedValue(new Error("boom"));
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "integrations.googleNarrow.action" }));
      await userEvent.click(screen.getByRole("button", { name: "integrations.googleNarrow.confirm" }));

      await waitFor(() => expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })));
      expect(await screen.findByRole("button", { name: "integrations.googleNarrow.action" })).toBeInTheDocument();
    });
  });

  describe("optional write to Google", () => {
    it("is offered, default off, with an explanation, only once permissions are narrowed", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed" }));
      renderSection();

      const toggle = await screen.findByRole("switch", { name: "integrations.googleWrite.toggle" });
      expect(toggle).not.toBeChecked();
      expect(screen.getByText("integrations.googleWrite.title")).toBeInTheDocument();
      expect(screen.getByText("integrations.googleWrite.explain")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "integrations.googleWrite.migrateAction" })).not.toBeInTheDocument();
    });

    it.each(["v2_read", "legacy"] as const)("shows no switch in %s mode, only a hint to narrow first", async (mode) => {
      googleStatus.mockResolvedValue(status({ mode }));
      renderSection();
      await screen.findByRole("checkbox", { name: /Personal/ });
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
      if (mode === "v2_read") {
        expect(screen.getByText("integrations.googleWrite.needsNarrow")).toBeInTheDocument();
      }
    });

    it("turning it on without the extra permission sends the browser to the consent URL", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed" }));
      googleSetWrite.mockResolvedValue({ enabled: false, consentUrl: "https://api.example.test/start?ticket=w" });
      Object.defineProperty(window, "location", { value: { href: "", assign: vi.fn() }, writable: true });
      renderSection();

      await userEvent.click(await screen.findByRole("switch", { name: "integrations.googleWrite.toggle" }));

      await waitFor(() => expect(googleSetWrite).toHaveBeenCalledWith(true));
      await waitFor(() => expect(window.location.href).toBe("https://api.example.test/start?ticket=w"));
    });

    it("turning it on when the permission is already granted refreshes the status and confirms", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed" }));
      googleSetWrite.mockResolvedValue({ enabled: true, consentUrl: null });
      renderSection();

      await userEvent.click(await screen.findByRole("switch", { name: "integrations.googleWrite.toggle" }));

      await waitFor(() => expect(googleSetWrite).toHaveBeenCalledWith(true));
      await waitFor(() => expect(googleStatus.mock.calls.length).toBeGreaterThan(1));
      await waitFor(() =>
        expect(showSpy).toHaveBeenCalledWith(
          expect.objectContaining({ title: "integrations.googleWrite.enabledToast", type: "success" }),
        ),
      );
    });

    it("reflects the saved state and turns it off", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed", writeEnabled: true }));
      googleSetWrite.mockResolvedValue({ enabled: false, consentUrl: null });
      renderSection();

      const toggle = await screen.findByRole("switch", { name: "integrations.googleWrite.toggle" });
      expect(toggle).toBeChecked();
      await userEvent.click(toggle);

      await waitFor(() => expect(googleSetWrite).toHaveBeenCalledWith(false));
      await waitFor(() =>
        expect(showSpy).toHaveBeenCalledWith(
          expect.objectContaining({ title: "integrations.googleWrite.disabledToast", type: "success" }),
        ),
      );
    });

    it("raises an error alert and changes nothing when the request fails", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed" }));
      googleSetWrite.mockRejectedValue(new Error("boom"));
      renderSection();

      await userEvent.click(await screen.findByRole("switch", { name: "integrations.googleWrite.toggle" }));

      await waitFor(() => expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })));
      expect(screen.getByRole("switch", { name: "integrations.googleWrite.toggle" })).not.toBeChecked();
    });

    it("offers Move to new calendar only while write is on, and runs it only on click", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed", writeEnabled: true }));
      googleMigrateLegacy.mockResolvedValue({ published: 3, skipped: 0, failed: 0, remaining: 0 });
      renderSection();

      const button = await screen.findByRole("button", { name: "integrations.googleWrite.migrateAction" });
      expect(screen.getByText("integrations.googleWrite.migrateExplain")).toBeInTheDocument();
      expect(googleMigrateLegacy).not.toHaveBeenCalled();

      await userEvent.click(button);

      await waitFor(() => expect(googleMigrateLegacy).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(showSpy).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'integrations.googleWrite.migrated{"published":3}', type: "success" }),
        ),
      );
    });

    it("tells the user to run it again when some events are still pending", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed", writeEnabled: true }));
      googleMigrateLegacy.mockResolvedValue({ published: 1, skipped: 0, failed: 1, remaining: 2 });
      renderSection();

      await userEvent.click(await screen.findByRole("button", { name: "integrations.googleWrite.migrateAction" }));

      await waitFor(() =>
        expect(showSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'integrations.googleWrite.migratedPartial{"published":1,"pending":2}',
          }),
        ),
      );
    });

    it("raises an error alert when Move to new calendar fails", async () => {
      googleStatus.mockResolvedValue(status({ mode: "narrowed", writeEnabled: true }));
      googleMigrateLegacy.mockRejectedValue(new Error("boom"));
      renderSection();

      await userEvent.click(await screen.findByRole("button", { name: "integrations.googleWrite.migrateAction" }));

      await waitFor(() => expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })));
    });
  });
});
