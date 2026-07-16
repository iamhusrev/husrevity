"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders modal overlays into <body> instead of leaving them where they are
 * declared in the tree.
 *
 * Why this is mandatory for every overlay in this app: a `position: fixed`
 * element is only viewport-anchored while none of its ancestors establishes a
 * containing block. Several ancestors here do:
 *   - `.husrev-settle` / `.husrev-fade-up` / `.husrev-stagger > *` end their
 *     animation on `transform: translateY(0) scale(1)` with fill-mode `both`,
 *     so a non-none transform sticks around forever;
 *   - `AppHeader` uses `backdrop-blur`, `AppSidebar` uses `translate-x-0`.
 * Any `fixed inset-0` overlay under one of those gets trapped inside that box
 * (a card, the header, the sidebar) instead of covering the page.
 *
 * `mounted` gates the portal so SSR and the first client render agree.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}
