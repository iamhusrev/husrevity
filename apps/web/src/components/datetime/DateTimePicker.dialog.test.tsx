import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import DateTimePicker from "./DateTimePicker";
import Dialog from "@/components/ui/Dialog";

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

describe("DateTimePicker inside a dialog", () => {
  it("Escape closes the popover first and keeps the surrounding dialog open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} label="Host" overlayClassName="o" panelClassName="p">
        <DateTimePicker value={null} onChange={() => {}} placeholder="Pick a date" />
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: /Pick a date/ }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Pick a date/ })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
