import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import GoogleLegacyCopiesCard from "./GoogleLegacyCopiesCard";
import { alertStore } from "@/stores/alert-store";

const legacyCopies = vi.fn();
const purge = vi.fn();
vi.mock("@/services/integrations-service", () => ({
  integrationsService: {
    googleLegacyCopies: (...a: unknown[]) => legacyCopies(...a),
    googleLegacyCopiesPurge: (...a: unknown[]) => purge(...a),
  },
}));

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

function renderCard(props: { legacyEngineActive?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <GoogleLegacyCopiesCard {...props} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("GoogleLegacyCopiesCard", () => {
  let showSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    legacyCopies.mockResolvedValue({ legacyCopyCount: 7 });
    purge.mockResolvedValue({ deleted: 7 });
    showSpy = vi.spyOn(alertStore.getState(), "show");
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the count and the explanation, and does not call the purge on load", async () => {
    renderCard();
    expect(await screen.findByText(/integrations\.googleLegacyCopies\.count\{"count":7\}/)).toBeInTheDocument();
    expect(screen.getByText("integrations.googleLegacyCopies.explain")).toBeInTheDocument();
    expect(purge).not.toHaveBeenCalled();
  });

  it("needs an explicit confirmation step before purging", async () => {
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "integrations.googleLegacyCopies.action" }));
    expect(purge).not.toHaveBeenCalled();
    expect(screen.getByText(/integrations\.googleLegacyCopies\.confirmText\{"count":7\}/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleLegacyCopies.cancel" }));
    expect(purge).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "integrations.googleLegacyCopies.action" })).toBeInTheDocument();
  });

  it("calls the purge endpoint exactly once, reports the deleted count and refreshes items", async () => {
    const { invalidate } = renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "integrations.googleLegacyCopies.action" }));
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleLegacyCopies.confirm" }));
    await waitFor(() => expect(purge).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: 'integrations.googleLegacyCopies.deleted{"count":7}',
        }),
      ),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["items"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["integrations", "google", "legacy-copies"] });
  });

  it("is disabled when there are no copies", async () => {
    legacyCopies.mockResolvedValue({ legacyCopyCount: 0 });
    renderCard();
    expect(await screen.findByText("integrations.googleLegacyCopies.none")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "integrations.googleLegacyCopies.action" })).toBeDisabled();
  });

  it("enables the purge whenever the count is above zero and the confirmation carries the soft-deleted note", async () => {
    legacyCopies.mockResolvedValue({ legacyCopyCount: 2 });
    renderCard();
    await screen.findByText(/integrations\.googleLegacyCopies\.count\{"count":2\}/);
    const btn = screen.getByRole("button", { name: "integrations.googleLegacyCopies.action" });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(screen.getByText("integrations.googleLegacyCopies.confirmNote")).toBeInTheDocument();
  });

  it("the real en and tr texts say the count includes copies already deleted in Husrevity and removal is permanent", () => {
    const e = en.integrations.googleLegacyCopies;
    const t = tr.integrations.googleLegacyCopies;
    expect(e.confirmNote).toMatch(/already deleted in Husrevity/i);
    expect(e.confirmNote).toMatch(/permanently/i);
    expect(t.confirmNote).toMatch(/Husrevity'de (zaten )?sil/i);
    expect(t.confirmNote).toMatch(/kalıcı/i);
    expect(en.integrations.googleDisconnect.deleteCopies).toMatch(/already deleted in Husrevity/i);
    expect(tr.integrations.googleDisconnect.deleteCopies).toMatch(/Husrevity'de (zaten )?sil/i);
  });

  it("shows an error alert and keeps the section when the purge fails", async () => {
    purge.mockRejectedValue(new Error("boom"));
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "integrations.googleLegacyCopies.action" }));
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleLegacyCopies.confirm" }));
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })));
  });

  it("disables the purge and tells the user to disconnect first while the legacy engine is active", async () => {
    renderCard({ legacyEngineActive: true });
    await screen.findByText(/integrations\.googleLegacyCopies\.count\{"count":7\}/);
    expect(screen.getByRole("button", { name: "integrations.googleLegacyCopies.action" })).toBeDisabled();
    expect(screen.getByText("integrations.googleLegacyCopies.disconnectFirst")).toBeInTheDocument();
  });

  it("shows the API conflict message and keeps the card usable when the purge is refused with 409", async () => {
    purge.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: "Disconnect first" } } });
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "integrations.googleLegacyCopies.action" }));
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleLegacyCopies.confirm" }));
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })));
    expect(screen.getByRole("button", { name: "integrations.googleLegacyCopies.confirm" })).toBeEnabled();
  });

  it("has the disconnect-first hint in en and tr", () => {
    expect(en.integrations.googleLegacyCopies.disconnectFirst).toMatch(/disconnect/i);
    expect(tr.integrations.googleLegacyCopies.disconnectFirst).toMatch(/bağlantı/i);
  });
});
