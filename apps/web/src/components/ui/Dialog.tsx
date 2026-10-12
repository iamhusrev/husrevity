"use client";

import React, { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEscapeLayer } from "@/hooks/useDialogLayer";
import { useScrollLock } from "@/hooks/useScrollLock";
import { trapTabKey } from "@/utils/focus-trap";

const FOCUSABLE = [
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type PanelProps = Omit<React.HTMLAttributes<HTMLElement>, "className" | "role" | "children"> & {
  noValidate?: boolean;
  autoComplete?: string;
};

const subscribeNoop = () => () => {};

/** False during server rendering and hydration, true for every client-only render. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/** First tabbable element that is not a dialog close button, or null. */
function firstDefaultFocusTarget(panel: HTMLElement): HTMLElement | null {
  const candidates = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
  for (const el of Array.from(candidates)) {
    if (!el.hasAttribute("data-dialog-close")) return el;
  }
  return null;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Class names of the backdrop element (the `fixed inset-0` layer). Used as-is. */
  overlayClassName: string;
  /** Class names of the panel element. Used as-is. */
  panelClassName: string;
  /** Id of the element that titles the dialog. */
  labelledBy?: string;
  /** Accessible name when there is no visible title element. */
  label?: string;
  /** Id of the element that describes the dialog (`aria-describedby`). */
  describedBy?: string;
  /**
   * Render the overlay into `document.body` through a portal (client only). Needed when the
   * dialog sits inside an animated or transformed ancestor, which would otherwise become the
   * containing block of the `fixed` overlay. Classes and behaviour are unchanged.
   */
  portal?: boolean;
  role?: "dialog" | "alertdialog";
  /** Element to focus on open instead of `[data-autofocus]` / the first focusable. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Defaults to true. A press-and-drag that ends on the backdrop never closes. */
  closeOnBackdrop?: boolean;
  /** Defaults to true. When false the dialog still owns Escape so lower layers stay open. */
  closeOnEscape?: boolean;
  /** Render the panel as a `form` (the panel then carries the form's own props). */
  panelAs?: "div" | "form";
  panelProps?: PanelProps;
  /** Extra `data-*` attributes for the overlay element (hooks for tests and analytics). */
  overlayProps?: Record<`data-${string}`, string>;
  /** Ref to the panel element, for callers that measure or scroll it. */
  panelRef?: React.Ref<HTMLElement>;
  /**
   * Rendered inside the overlay before the panel: a separate backdrop element. Mark it with
   * `data-dialog-backdrop` so presses on it count as backdrop presses.
   */
  beforePanel?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Headless modal behaviour: role/aria, focus in and restore, Tab trap, Escape through the
 * shared layer stack, backdrop press-and-release close and a reference counted scroll lock.
 * It renders exactly two elements (overlay and panel) with the caller's class names and, unless
 * `portal` is set, no portal, so wrapping an existing overlay in it does not change how it looks.
 */
export default function Dialog(props: DialogProps) {
  const isClient = useIsClient();
  if (!props.open) return null;
  // Mount the inner component only once the portal target is usable, so its focus effect
  // runs against a rendered panel.
  if (props.portal && !isClient) return null;
  return <DialogInner {...props} />;
}

function DialogInner({
  onClose,
  overlayClassName,
  panelClassName,
  labelledBy,
  label,
  describedBy,
  portal = false,
  role = "dialog",
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  panelAs = "div",
  panelProps,
  overlayProps,
  panelRef: externalPanelRef,
  beforePanel,
  children,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<Element | null | undefined>(undefined);
  if (triggerRef.current === undefined) {
    triggerRef.current = typeof document === "undefined" ? null : document.activeElement;
  }
  const pressRef = useRef<{ down: boolean | null; up: boolean | null }>({
    down: null,
    up: null,
  });

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!labelledBy && !label) {
      console.warn(
        "Dialog: no accessible name. Pass `label` or `labelledBy` so assistive technology can announce it.",
      );
    }
    // Once per mount, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useScrollLock(true);
  useEscapeLayer(() => {
    if (closeOnEscape) onClose();
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const trigger = triggerRef.current;
    if (!panel.contains(document.activeElement)) {
      const target =
        initialFocusRef?.current ??
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        firstDefaultFocusTarget(panel) ??
        panel;
      target.focus();
    }
    return () => {
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
    // Runs once per mount: the dialog is mounted only while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPanelRef = useCallback(
    (node: HTMLElement | null) => {
      panelRef.current = node;
      if (typeof externalPanelRef === "function") externalPanelRef(node);
      else if (externalPanelRef) {
        (externalPanelRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [externalPanelRef],
  );

  const isBackdrop = (target: EventTarget | null): boolean =>
    target === overlayRef.current ||
    (target instanceof HTMLElement && target.hasAttribute("data-dialog-backdrop"));

  const Panel = panelAs as React.ElementType;
  const { onKeyDown: callerKeyDown, style: callerStyle, ...restPanelProps } = panelProps ?? {};

  const overlay = (
    <div
      {...overlayProps}
      ref={overlayRef}
      className={overlayClassName}
      onMouseDown={(e) => {
        pressRef.current.down = isBackdrop(e.target);
      }}
      onMouseUp={(e) => {
        pressRef.current.up = isBackdrop(e.target);
      }}
      onClick={(e) => {
        const { down, up } = pressRef.current;
        pressRef.current = { down: null, up: null };
        if (!closeOnBackdrop || !isBackdrop(e.target)) return;
        // A null press means a synthetic click with no mouse events; real drags set false.
        if (down === false || up === false) return;
        onClose();
      }}
    >
      {beforePanel}
      <Panel
        {...restPanelProps}
        ref={setPanelRef}
        className={panelClassName}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
        tabIndex={-1}
        style={{ ...callerStyle, outline: "none" }}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          callerKeyDown?.(e);
          const panel = panelRef.current;
          // Keys bubbling from a nested dialog in a portal are not this panel's to trap.
          if (
            e.defaultPrevented ||
            !panel ||
            !(e.target instanceof Node) ||
            !panel.contains(e.target)
          ) {
            return;
          }
          trapTabKey(e, panel);
        }}
      >
        {children}
      </Panel>
    </div>
  );

  return portal ? createPortal(overlay, document.body) : overlay;
}
