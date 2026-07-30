import { create } from "zustand";
import i18n from "@/configs/i18n";

type AlertPosition =
  | "top-right"
  | "top-center"
  | "top-left"
  | "bottom-right"
  | "bottom-center"
  | "bottom-left";

type AlertWidth = "sm" | "md" | "lg" | "xl";

interface AlertAction {
  label: string;
  onClick: () => void | Promise<unknown>;
}

interface AlertState {
  open: boolean;
  title: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
  position: AlertPosition;
  width: AlertWidth;
  action?: AlertAction;
  duration?: number;
  /** Bumped on every show() so a new toast always restarts the auto-dismiss timer, even if open/duration are unchanged. */
  seq: number;

  show: (payload: {
    title: string;
    message: string;
    type?: "success" | "error" | "warning" | "info";
    position?: AlertPosition;
    width?: AlertWidth;
    action?: AlertAction;
    duration?: number;
  }) => void;

  close: () => void;
}

export const alertStore = create<AlertState>((set, get) => ({
  open: false,
  title: "",
  message: "",
  type: "info",
  position: "top-right",
  width: "sm",
  action: undefined,
  duration: undefined,
  seq: 0,

  show: ({
    title,
    message,
    type = "info",
    position = "top-right",
    width = "sm",
    action,
    duration,
  }) =>
    set({
      open: true,
      title,
      message,
      type,
      position,
      width,
      action,
      duration,
      seq: get().seq + 1,
    }),

  close: () => set({ open: false }),
}));

/**
 * Shows a single-slot "undo" toast — a success alert with an action button
 * that runs `onUndo` and auto-dismisses after 7s.
 */
export function showUndoToast({
  message,
  onUndo,
  title,
  actionLabel,
}: {
  message: string;
  onUndo: () => void | Promise<unknown>;
  title?: string;
  actionLabel?: string;
}): void {
  alertStore.getState().show({
    title: title ?? i18n.t("common.deleted"),
    message,
    type: "success",
    position: "bottom-center",
    duration: 7000,
    action: { label: actionLabel ?? i18n.t("common.undo"), onClick: onUndo },
  });
}
