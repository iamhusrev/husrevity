import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "@/configs/i18n";
import { aiService } from "@/services/ai-service";
import DictateQuickAddModal from "@/components/ai/DictateQuickAddModal";

vi.mock("@/services/ai-service", () => ({
  aiService: {
    splitDictatedText: vi.fn(),
  },
}));

const splitDictatedTextMock = vi.mocked(aiService.splitDictatedText);

function renderModal(overrides?: { onConfirm?: (items: string[]) => Promise<void> | void }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const onConfirm = overrides?.onConfirm ?? vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <DictateQuickAddModal
          isOpen
          onClose={onClose}
          title="Dictate items"
          onConfirm={onConfirm}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return { onClose, onConfirm };
}

describe("DictateQuickAddModal", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    splitDictatedTextMock.mockReset();
  });

  it("splits dictated text and renders the returned items as editable inputs in the review stage", async () => {
    const user = userEvent.setup();
    splitDictatedTextMock.mockResolvedValue({
      success: true,
      message: "",
      code: 200,
      data: { items: ["Buy milk", "Call dentist", "Pay rent"] },
    });

    renderModal();

    const textarea = screen.getByPlaceholderText(
      "Speak or dictate freely — we will split it into separate items.",
    );
    await user.type(textarea, "Buy milk, call dentist, pay rent");
    await user.click(screen.getByRole("button", { name: "Split into items" }));

    await screen.findByRole("heading", { name: "Review items" });

    expect(splitDictatedTextMock).toHaveBeenCalledWith({
      text: "Buy milk, call dentist, pay rent",
    });

    const itemInputs = screen.getAllByRole("textbox");
    expect(itemInputs).toHaveLength(3);
    expect(itemInputs.map((input) => (input as HTMLInputElement).value)).toEqual([
      "Buy milk",
      "Call dentist",
      "Pay rent",
    ]);
  });

  it("confirms with the edited/filtered items after editing one line and removing another", async () => {
    const user = userEvent.setup();
    splitDictatedTextMock.mockResolvedValue({
      success: true,
      message: "",
      code: 200,
      data: { items: ["Buy milk", "Call dentist", "Pay rent"] },
    });

    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal({ onConfirm });

    await user.type(
      screen.getByPlaceholderText("Speak or dictate freely — we will split it into separate items."),
      "dictated text",
    );
    await user.click(screen.getByRole("button", { name: "Split into items" }));
    await screen.findByRole("heading", { name: "Review items" });

    const itemInputs = screen.getAllByRole("textbox");
    // Edit the first item.
    await user.clear(itemInputs[0]);
    await user.type(itemInputs[0], "  Buy oat milk  ");

    // Remove the second item ("Call dentist").
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[1]);

    await user.click(screen.getByRole("button", { name: /^Add \(\d+\)$/ }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(["Buy oat milk", "Pay rent"]);
  });

  it("keeps the split button disabled and does not call the API for whitespace-only text", async () => {
    const user = userEvent.setup();
    renderModal();

    const textarea = screen.getByPlaceholderText(
      "Speak or dictate freely — we will split it into separate items.",
    );
    await user.type(textarea, "   ");

    const splitButton = screen.getByRole("button", { name: "Split into items" });
    // `disabled={!text.trim() || dictateItems.isPending}` means whitespace-only
    // text already disables the button, so `handleSplit`'s own "empty text"
    // guard/error (dictate.error.empty) can never actually be reached through
    // real user interaction — a real click on a disabled button never fires.
    expect(splitButton).toBeDisabled();
    await user.click(splitButton);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(splitDictatedTextMock).not.toHaveBeenCalled();
  });
});
