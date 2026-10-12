"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type QuickAddContextType = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
};

export const QuickAddContext = createContext<QuickAddContextType | undefined>(undefined);

export function useQuickAdd(): QuickAddContextType {
  const context = useContext(QuickAddContext);
  if (!context) {
    throw new Error("useQuickAdd must be used inside QuickAddProvider");
  }
  return context;
}

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openQuickAdd = useCallback(() => setOpen(true), []);
  const closeQuickAdd = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, setOpen, openQuickAdd, closeQuickAdd }),
    [open, openQuickAdd, closeQuickAdd],
  );

  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>;
}
