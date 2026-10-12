import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { Modal } from "./index";
import DeleteConfirmModal from "./DeleteConfirmModal";
import DetailModal from "./DetailModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function WithOpener({
  render: renderModal,
}: {
  render: (open: boolean, close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {renderModal(open, () => setOpen(false))}
    </>
  );
}

describe("Modal", () => {
  function setup() {
    return render(
      <WithOpener
        render={(open, close) => (
          <Modal isOpen={open} onClose={close}>
            <input aria-label="field" />
          </Modal>
        )}
      />,
    );
  }

  it("is a modal dialog, closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    setup();
    const opener = screen.getByText("opener");
    await user.click(opener);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("keeps Tab inside the panel", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText("opener"));
    const close = screen.getByLabelText("Close");
    const field = screen.getByLabelText("field");
    field.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(field).toHaveFocus();
  });

  it("closes on a backdrop click and not on a panel click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose}>
        <input aria-label="field" />
      </Modal>,
    );
    await user.click(screen.getByLabelText("field"));
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = document.querySelector("[data-dialog-backdrop]") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close fullscreen modals from the backdrop area", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} isFullscreen>
        <input aria-label="field" />
      </Modal>,
    );
    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DeleteConfirmModal", () => {
  it("is a labelled dialog, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(
      <WithOpener
        render={(open, close) => (
          <DeleteConfirmModal
            isOpen={open}
            onClose={close}
            onConfirm={() => {}}
            title="Remove it?"
          />
        )}
      />,
    );
    const opener = screen.getByText("opener");
    await user.click(opener);
    const dialog = screen.getByRole("alertdialog", { name: "Remove it?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("dataTable.confirmDeleteMessage");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("ignores Escape and backdrop while pending", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DeleteConfirmModal isOpen onClose={onClose} onConfirm={() => {}} isPending />);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("alertdialog").parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("describes the dialog with a custom message", () => {
    render(
      <DeleteConfirmModal isOpen onClose={() => {}} onConfirm={() => {}} message="Really gone?" />,
    );
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription("Really gone?");
  });

  it("renders outside the render container so a transformed ancestor cannot clip it", () => {
    const { container } = render(
      <DeleteConfirmModal isOpen onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(container.contains(screen.getByRole("alertdialog"))).toBe(false);
  });

  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<DeleteConfirmModal isOpen onClose={() => {}} onConfirm={() => {}} />);
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
  });
});

describe("Modal default focus", () => {
  it("does not land on the close button, so Enter right after opening keeps it open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose}>
        <input aria-label="field" />
      </Modal>,
    );
    expect(screen.getByLabelText("field")).toHaveFocus();
    expect(screen.getByLabelText("Close")).toHaveAttribute("data-dialog-close");
    await user.keyboard("{Enter}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses the panel when the close button is the only control", () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <p>read only</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });
});

describe("DetailModal", () => {
  it("is named by its title, or by label when there is no visible title", () => {
    const { unmount } = render(
      <DetailModal isOpen onClose={() => {}} title="Detail">
        <p>body</p>
      </DetailModal>,
    );
    expect(screen.getByRole("dialog", { name: "Detail" })).toBeInTheDocument();
    unmount();
    render(
      <DetailModal isOpen onClose={() => {}} label="Note editor">
        <p>body</p>
      </DetailModal>,
    );
    expect(screen.getByRole("dialog", { name: "Note editor" })).toBeInTheDocument();
  });

  it("does not focus its own close button first", () => {
    render(
      <DetailModal isOpen onClose={() => {}} title="Detail">
        <p>body</p>
      </DetailModal>,
    );
    expect(screen.getByLabelText("common.cancel")).not.toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("is a dialog that closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(
      <WithOpener
        render={(open, close) => (
          <DetailModal isOpen={open} onClose={close} title="Detail">
            <p>body</p>
          </DetailModal>
        )}
      />,
    );
    const opener = screen.getByText("opener");
    await user.click(opener);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <DetailModal isOpen onClose={() => {}} onExpand={() => {}} title="Detail">
        <button type="button">inside</button>
      </DetailModal>,
    );
    screen.getByText("inside").focus();
    await user.tab();
    expect(screen.getByLabelText("common.openFull")).toHaveFocus();
  });
});
