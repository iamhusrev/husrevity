import { create } from "zustand";

type AlertPosition =
  | "top-right"
  | "top-center"
  | "top-left"
  | "bottom-right"
  | "bottom-center"
  | "bottom-left";

type AlertWidth = "sm" | "md" | "lg" | "xl";

interface AlertState {
  open: boolean;
  title: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
  position: AlertPosition;
  width: AlertWidth;

  show: (payload: {
    title: string;
    message: string;
    type?: "success" | "error" | "warning" | "info";
    position?: AlertPosition;
    width?: AlertWidth;
  }) => void;

  close: () => void;
}

export const alertStore = create<AlertState>((set) => ({
  open: false,
  title: "",
  message: "",
  type: "info",
  position: "top-right",
  width: "sm",

  show: ({ title, message, type = "info", position = "top-right", width = "sm" }) =>
    set({
      open: true,
      title,
      message,
      type,
      position,
      width,
    }),

  close: () => set({ open: false }),
}));
