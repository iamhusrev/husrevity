import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import GoogleDisconnectPanel from "./GoogleDisconnectPanel";

const preview = vi.fn();
vi.mock("@/services/integrations-service", () => ({
  integrationsService: {
    googleLegacyCopies: (...a: unknown[]) => preview(...a),
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

function renderPanel(over: { pending?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GoogleDisconnectPanel pending={over.pending ?? false} onConfirm={onConfirm} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return { onConfirm, onCancel };
}

describe("GoogleDisconnectPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preview.mockResolvedValue({ legacyCopyCount: 10 });
  });

  it("shows the legacy copy count with an unchecked confirmation checkbox", async () => {
    renderPanel();
    const box = await screen.findByRole("checkbox", {
      name: /integrations\.googleDisconnect\.deleteCopies\{"count":10\}/,
    });
    expect(box).not.toBeChecked();
    expect(screen.getByText("integrations.googleDisconnect.explain")).toBeInTheDocument();
  });

  it("confirms without deleting the copies unless the box is checked", async () => {
    const { onConfirm } = renderPanel();
    await screen.findByRole("checkbox");
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleDisconnect.confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("confirms with the deletion when the box is checked", async () => {
    const { onConfirm } = renderPanel();
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleDisconnect.confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("offers no checkbox and never deletes copies when there are none", async () => {
    preview.mockResolvedValue({ legacyCopyCount: 0 });
    const { onConfirm } = renderPanel();
    expect(await screen.findByText("integrations.googleDisconnect.noCopies")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleDisconnect.confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("keeps the copies and still allows disconnecting when the count cannot be loaded", async () => {
    preview.mockRejectedValue(new Error("boom"));
    const { onConfirm } = renderPanel();
    expect(await screen.findByText("integrations.googleDisconnect.previewError")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleDisconnect.confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("disables confirmation while loading the count and cancels without confirming", async () => {
    preview.mockReturnValue(new Promise(() => undefined));
    const { onConfirm, onCancel } = renderPanel();
    expect(screen.getByRole("button", { name: "integrations.googleDisconnect.confirm" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "integrations.googleDisconnect.cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(preview).toHaveBeenCalled());
  });
});
