"use client";

import { alertStore } from "@/stores/alert-store";
import Alert from "./Alert";

export default function GlobalAlert() {
  const { open, title, message, type, position, width, close } = alertStore();

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
      <Alert variant={type} title={title} message={message} showLink={false} onClose={close} />
    </div>
  );
}
