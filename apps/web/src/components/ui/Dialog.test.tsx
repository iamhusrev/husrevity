import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import Dialog from "./Dialog";
import { verifyDialogContract } from "@/test/dialog-contract";

function Harness({
  onClose,
  closeOnBackdrop,
  closeOnEscape,
  initiallyOpen = true,
}: {
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        overlayClassName="overlay-class"
        panelClassName="panel-class"
        label="Test dialog"
        closeOnBackdrop={closeOnBackdrop}
        closeOnEscape={closeOnEscape}
      >
        <button type="button">first</button>
        <input aria-label="field" />
        <button type="button">last</button>
      </Dialog>
    </div>
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    render(<Harness initiallyOpen={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders role, aria-modal, label and the caller class names", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.className).toBe("panel-class");
    expect(dialog.parentElement?.className).toBe("overlay-class");
  });

  it("supports alertdialog and aria-labelledby", () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        role="alertdialog"
        labelledBy="t"
        overlayClassName="o"
        panelClassName="p"
      >
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("moves focus to the first focusable on open and restores it on close", async () => {
    const user = userEvent.setup();
    render(<Harness initiallyOpen={false} />);
    const opener = screen.getByText("opener");
    await user.click(opener);
    expect(screen.getByText("first")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("prefers [data-autofocus] and falls back to the panel itself", () => {
    const { unmount } = render(
      <Dialog open onClose={() => {}} label="a" overlayClassName="o" panelClassName="p">
        <button type="button">one</button>
        <input aria-label="wanted" data-autofocus />
      </Dialog>,
    );
    expect(screen.getByLabelText("wanted")).toHaveFocus();
    unmount();

    render(
      <Dialog open onClose={() => {}} label="b" overlayClassName="o" panelClassName="p">
        <p>no controls</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab inside the panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByText("first");
    const last = screen.getByText("last");
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("closes only the topmost of two stacked dialogs on Escape", async () => {
    const user = userEvent.setup();
    const closeA = vi.fn();
    const closeB = vi.fn();
    render(
      <>
        <Dialog open onClose={closeA} label="A" overlayClassName="o" panelClassName="p">
          <button type="button">a</button>
        </Dialog>
        <Dialog open onClose={closeB} label="B" overlayClassName="o" panelClassName="p">
          <button type="button">b</button>
        </Dialog>
      </>,
    );
    await user.keyboard("{Escape}");
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
  });

  it("closes on a plain backdrop click but not on a panel click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    await user.click(screen.getByText("first"));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when a drag starts inside the panel and ends on the backdrop", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.mouseDown(screen.getByLabelText("field"));
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when a drag starts on the backdrop and ends inside the panel", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(screen.getByLabelText("field"));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("honours closeOnBackdrop={false} and closeOnEscape={false}", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeOnBackdrop={false} closeOnEscape={false} />);
    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a separate backdrop marked data-dialog-backdrop closes the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog
        open
        onClose={onClose}
        label="sibling"
        overlayClassName="o"
        panelClassName="p"
        beforePanel={<div data-testid="bd" data-dialog-backdrop />}
      >
        <button type="button">x</button>
      </Dialog>,
    );
    await user.click(screen.getByTestId("bd"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reference counts the body scroll lock and restores the previous value", () => {
    document.body.style.overflow = "scroll";
    const a = render(
      <Dialog open onClose={() => {}} label="A" overlayClassName="o" panelClassName="p">
        <button type="button">a</button>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    const b = render(
      <Dialog open onClose={() => {}} label="B" overlayClassName="o" panelClassName="p">
        <button type="button">b</button>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    b.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    a.unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("leaves no scroll lock behind after unmount", () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("renders the panel as a form with submit handling when asked", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <Dialog
        open
        onClose={() => {}}
        label="form"
        overlayClassName="o"
        panelClassName="p"
        panelAs="form"
        panelProps={{ onSubmit, noValidate: true, autoComplete: "off" }}
      >
        <button type="submit">go</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.tagName).toBe("FORM");
    expect(dialog).toHaveAttribute("novalidate");
    expect(dialog).toHaveAttribute("autocomplete", "off");
    fireEvent.click(screen.getByText("go"));
    expect(onSubmit).toHaveBeenCalled();
  });
  describe("portal", () => {
    it("renders the overlay under document.body instead of the render container", () => {
      const { container } = render(
        <Dialog
          open
          onClose={() => {}}
          label="portal"
          overlayClassName="overlay-class"
          panelClassName="panel-class"
          portal
        >
          <button type="button">inside</button>
        </Dialog>,
      );
      const dialog = screen.getByRole("dialog");
      expect(container.contains(dialog)).toBe(false);
      expect(dialog.parentElement?.parentElement).toBe(document.body);
      expect(dialog.className).toBe("panel-class");
      expect(dialog.parentElement?.className).toBe("overlay-class");
    });

    it("keeps focus in, the Tab trap, Escape, backdrop close and focus restore", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      function PortalHarness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              opener
            </button>
            <Dialog
              open={open}
              onClose={() => {
                onClose();
                setOpen(false);
              }}
              label="portal"
              overlayClassName="o"
              panelClassName="p"
              portal
            >
              <button type="button">first</button>
              <button type="button">last</button>
            </Dialog>
          </>
        );
      }
      render(<PortalHarness />);
      const opener = screen.getByText("opener");
      await user.click(opener);
      expect(screen.getByText("first")).toHaveFocus();
      expect(document.body.style.overflow).toBe("hidden");
      screen.getByText("last").focus();
      await user.tab();
      expect(screen.getByText("first")).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(opener).toHaveFocus();
      expect(document.body.style.overflow).toBe("");

      await user.click(opener);
      await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
      expect(onClose).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("accessible name warning", () => {
    afterEach(() => vi.restoreAllMocks());

    it("warns once per mount when neither label nor labelledBy is given", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { rerender } = render(
        <Dialog open onClose={() => {}} overlayClassName="o" panelClassName="p">
          <button type="button">x</button>
        </Dialog>,
      );
      rerender(
        <Dialog open onClose={() => {}} overlayClassName="o" panelClassName="p">
          <button type="button">y</button>
        </Dialog>,
      );
      const calls = warn.mock.calls.filter((c) => String(c[0]).includes("Dialog"));
      expect(calls).toHaveLength(1);
    });

    it("makes the dialog contract fail for an unnamed dialog and pass for a named one", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const unnamed = (open: boolean, close: () => void) => (
        <Dialog open={open} onClose={close} overlayClassName="o" panelClassName="p">
          <button type="button">x</button>
        </Dialog>
      );
      await expect(verifyDialogContract(unnamed)).rejects.toThrow(/accessible name/);
      cleanup();
      document.body.style.overflow = "";
      const named = (open: boolean, close: () => void) => (
        <Dialog open={open} onClose={close} overlayClassName="o" panelClassName="p" label="Named">
          <button type="button">x</button>
        </Dialog>
      );
      await verifyDialogContract(named);
    });

    it("does not warn when the dialog is named", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(
        <Dialog open onClose={() => {}} overlayClassName="o" panelClassName="p" label="Named">
          <button type="button">x</button>
        </Dialog>,
      );
      render(
        <Dialog open onClose={() => {}} overlayClassName="o" panelClassName="p" labelledBy="t">
          <h2 id="t">T</h2>
        </Dialog>,
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("default focus target", () => {
    it("skips a close button marked data-dialog-close", () => {
      render(
        <Dialog open onClose={() => {}} label="c" overlayClassName="o" panelClassName="p">
          <button type="button" data-dialog-close>
            close
          </button>
          <input aria-label="field" />
        </Dialog>,
      );
      expect(screen.getByLabelText("field")).toHaveFocus();
    });

    it("falls back to the panel when only a close button exists", () => {
      render(
        <Dialog open onClose={() => {}} label="c" overlayClassName="o" panelClassName="p">
          <button type="button" data-dialog-close>
            close
          </button>
        </Dialog>,
      );
      expect(screen.getByRole("dialog")).toHaveFocus();
    });
  });

  it("does not close on Escape while an IME composition is active", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} label="ime" overlayClassName="o" panelClassName="p">
        <button type="button">x</button>
      </Dialog>,
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("merges a caller style with the outline reset", () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        label="s"
        overlayClassName="o"
        panelClassName="p"
        panelProps={{ style: { color: "red" } }}
      >
        <button type="button">x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.color).toBe("red");
    expect(dialog.style.outline).toBe("none");
  });

  it("describes the dialog through describedBy", () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        label="d"
        describedBy="desc"
        overlayClassName="o"
        panelClassName="p"
      >
        <p id="desc">Explanation</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Explanation");
  });
});
