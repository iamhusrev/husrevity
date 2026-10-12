import { RefObject, useEffect, useRef } from "react";

/**
 * Open dialogs/sheets, oldest first. Escape only ever closes the last one, so a
 * form opened above a panel closes first and the panel stays.
 */
const layerStack: symbol[] = [];

const FIRST_FOCUS_SELECTOR = [
  "[data-autofocus]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "[href]",
].join(",");

/**
 * Registers an overlay in the shared layer stack and closes it on Escape while it is the
 * topmost layer. `useDialogLayer` builds on it; overlays with their own focus handling
 * (quick add, schedule modal) use it directly so Escape never hits a layer beneath them.
 */
export function useEscapeLayer(onClose: () => void, active = true): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const id = Symbol("dialog-layer");
    layerStack.push(id);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape while composing text (IME) cancels the composition, not the dialog.
      if (e.isComposing) return;
      if (layerStack[layerStack.length - 1] !== id) return;
      e.stopPropagation();
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const idx = layerStack.indexOf(id);
      if (idx >= 0) layerStack.splice(idx, 1);
    };
  }, [active]);
}

/**
 * Shared dialog behaviour: moves focus into the container on open, restores it to the
 * previously focused element on close, and closes on Escape when this is the topmost layer.
 * Pair it with `trapTabKey` from utils/focus-trap.ts on the container's onKeyDown.
 */
export function useDialogLayer(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEscapeLayer(onClose);

  useEffect(() => {
    const trigger = document.activeElement;
    const container = containerRef.current;
    const first = container?.querySelector<HTMLElement>(FIRST_FOCUS_SELECTOR);
    (first ?? container)?.focus();

    return () => {
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
    // Runs once per mount: a dialog is mounted only while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
