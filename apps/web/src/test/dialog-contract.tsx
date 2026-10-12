import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface DialogContractOptions {
  /** Wraps the host (query client, i18n provider, ...). */
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
  /** Accessible name the dialog must expose, when the overlay has one. */
  name?: string | RegExp;
  /**
   * Set when the trigger unmounts while the dialog is open (a menu item that closes its
   * menu), so there is no element left to hand focus back to.
   */
  triggerUnmounts?: boolean;
}

/**
 * Proves the shared overlay behaviour on one concrete overlay: it opens from a trigger, is a
 * modal dialog, keeps Tab inside, closes on Escape and gives focus back to the trigger.
 * `renderOverlay` receives the open state and a close callback; components that are mounted
 * only while open should return null when `open` is false.
 */
export async function verifyDialogContract(
  renderOverlay: (open: boolean, onClose: () => void) => React.ReactNode,
  options: DialogContractOptions = {},
): Promise<void> {
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          dialog-contract-opener
        </button>
        {renderOverlay(open, () => setOpen(false))}
      </>
    );
  }

  const Wrapper = options.wrapper ?? React.Fragment;
  render(
    <Wrapper>
      <Host />
    </Wrapper>,
  );

  const opener = screen.getByRole("button", { name: "dialog-contract-opener" });
  await verifyDialogFromTrigger(opener, options);
}

/**
 * Same contract for an overlay that a rendered page opens through its own trigger: clicks
 * `opener`, then checks role/aria-modal, focus in, the Tab trap, Escape and focus restore.
 */
export async function verifyDialogFromTrigger(
  opener: HTMLElement,
  options: Pick<DialogContractOptions, "name" | "triggerUnmounts"> = {},
): Promise<void> {
  const user = userEvent.setup();
  const before = document.body.style.overflow;
  // Generic assertion: the shared Dialog warns (development only) when it has no accessible
  // name, so any overlay run through this contract must be named.
  const warn = vi.spyOn(console, "warn");
  try {
    await runDialogContract(user, opener, options, before);
    const unnamed = warn.mock.calls.filter((c) =>
      String(c[0]).startsWith("Dialog: no accessible name"),
    );
    expect(unnamed, "the dialog has no accessible name (label or labelledBy)").toHaveLength(0);
  } finally {
    warn.mockRestore();
  }
}

async function runDialogContract(
  user: ReturnType<typeof userEvent.setup>,
  opener: HTMLElement,
  options: Pick<DialogContractOptions, "name" | "triggerUnmounts">,
  before: string,
): Promise<void> {
  await user.click(opener);

  const dialog = await screen.findByRole("dialog", options.name ? { name: options.name } : {});
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(document.body.style.overflow).toBe("hidden");

  // Focus moved into the dialog.
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

  // Tab stays inside: from the last focusable it wraps to the first, and back.
  const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  expect(focusables.length).toBeGreaterThan(0);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  last.focus();
  await user.tab();
  expect(first).toHaveFocus();
  await user.tab({ shift: true });
  expect(last).toHaveFocus();

  // Escape closes it and focus returns to the trigger.
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  if (!options.triggerUnmounts) expect(opener).toHaveFocus();
  expect(document.body.style.overflow).toBe(before);
}

/** A plain backdrop click closes the dialog, a click inside the panel does not. */
export async function verifyBackdropClose(
  renderOverlay: (open: boolean, onClose: () => void) => React.ReactNode,
  options: Pick<DialogContractOptions, "wrapper"> = {},
): Promise<void> {
  const user = userEvent.setup();
  function Host() {
    const [open, setOpen] = useState(true);
    return <>{renderOverlay(open, () => setOpen(false))}</>;
  }
  const Wrapper = options.wrapper ?? React.Fragment;
  render(
    <Wrapper>
      <Host />
    </Wrapper>,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(dialog);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.click(dialog.parentElement as HTMLElement);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

/** Page overlay variant: open it through `opener`, then a backdrop click closes it. */
export async function verifyBackdropCloseFromTrigger(opener: HTMLElement): Promise<void> {
  const user = userEvent.setup();
  await user.click(opener);
  const dialog = await screen.findByRole("dialog");
  await user.click(dialog);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.click(dialog.parentElement as HTMLElement);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
