"use client";

import { useEffect } from "react";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import Alert from "./Alert";

export default function GlobalAlert() {
  const { open, title, message, type, position, width, action, duration, seq, close } =
    alertStore();

  useEffect(() => {
    if (!open || !duration) return;
    const t = setTimeout(close, duration);
    return () => clearTimeout(t);
    // `seq` bumps on every show(), so a new toast always restarts this timer
    // even when open/duration are unchanged (e.g. two undo-toasts in a row).
  }, [open, duration, seq, close]);

  if (!open) return null;

  const positionClasses: Record<string, string> = {
    "top-right": "top-4 right-4",
    "top-center": "top-4 left-1/2 -translate-x-1/2",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
    "bottom-left": "bottom-4 left-4",
  };

  // Responsive width mapping
  const responsiveWidth: Record<string, string> = {
    sm: "w-[90%] max-w-[340px]",
    md: "w-[90%] max-w-[420px]",
    lg: "w-[90%] max-w-[540px]",
    xl: "w-[92%] max-w-[700px]",
  };

  return (
    <div
      className={`
        fixed z-9999999
        ${responsiveWidth[width]}
        ${positionClasses[position]}
      `}
    >
      <Alert
        variant={type}
        title={title}
        message={message}
        showLink={false}
        action={
          action
            ? {
                label: action.label,
                onClick: () => {
                  close();
                  Promise.resolve(action.onClick()).catch((err) => {
                    const { title: errTitle, message } = parseAxiosError(err);
                    alertStore
                      .getState()
                      .show({ title: errTitle, message, type: "error", position: "top-center" });
                  });
                },
              }
            : undefined
        }
        onClose={close}
      />
    </div>
  );
}
