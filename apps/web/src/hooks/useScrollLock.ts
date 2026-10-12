import { useEffect } from "react";

let lockCount = 0;
let savedOverflow = "";

/**
 * Locks body scrolling while at least one caller is active. Reference counted so stacked
 * dialogs share one lock, and the `overflow` value from before the first lock is restored
 * when the last one releases.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = savedOverflow;
    };
  }, [active]);
}
