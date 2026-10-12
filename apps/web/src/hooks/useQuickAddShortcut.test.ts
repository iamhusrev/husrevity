import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuickAddShortcut } from "./useQuickAddShortcut";

describe("useQuickAddShortcut", () => {
  it("calls onTrigger and prevents default when ⌘K is pressed", () => {
    const onTrigger = vi.fn();
    renderHook(() => useQuickAddShortcut(onTrigger));

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("calls onTrigger and prevents default when Ctrl+K is pressed", () => {
    const onTrigger = vi.fn();
    renderHook(() => useQuickAddShortcut(onTrigger));

    const event = new KeyboardEvent("keydown", {
      key: "K",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not call onTrigger for other key combinations", () => {
    const onTrigger = vi.fn();
    renderHook(() => useQuickAddShortcut(onTrigger));

    const event = new KeyboardEvent("keydown", {
      key: "j",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(onTrigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
