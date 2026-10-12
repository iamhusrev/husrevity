const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Minimal Tab trap for a modal container: wraps focus from the last focusable
 * element to the first (Tab) and from the first to the last (Shift+Tab).
 * Call it from a keydown handler on the container; it calls preventDefault()
 * only when it wraps, so normal Tab order is untouched otherwise.
 */
export function trapTabKey(
  event: { key: string; shiftKey: boolean; preventDefault: () => void },
  container: HTMLElement | null,
): void {
  if (event.key !== "Tab" || !container) return;
  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && focusables.includes(active);

  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (inside && active === last) {
    event.preventDefault();
    first.focus();
  }
}
