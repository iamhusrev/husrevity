import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import MonthPage from "./MonthPage";
import Dialog from "@/components/ui/Dialog";
import * as useItemsModule from "@/hooks/useItems";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: "tr" },
    }),
  };
});

describe("MonthPage day panel in the dialog layer stack", () => {
  it("Escape closes the day panel and not a dialog that was opened beneath it", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const underClose = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <Dialog open onClose={underClose} label="Beneath" overlayClassName="o" panelClassName="p">
          <button type="button">under</button>
        </Dialog>
        <MonthPage initialYear={2026} initialMonth={10} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(screen.getByTestId("day-panel")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("day-panel")).not.toBeInTheDocument();
    expect(underClose).not.toHaveBeenCalled();
  });

  it("locks body scrolling while the day panel is open and releases it on close", async () => {
    vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MonthPage initialYear={2026} initialMonth={10} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("cell-2026-10-12"));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
