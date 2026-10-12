"use client";
import React from "react";
import Dialog from "@/components/ui/Dialog";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
  /** Accessible name for the dialog when the content has no visible title. */
  label?: string;
  /** Id of the element inside the content that titles the dialog. */
  labelledBy?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
  label,
  labelledBy,
}) => {
  const contentClasses = isFullscreen
    ? "w-full h-full"
    : "relative w-full rounded-3xl husrev-modal grain husrev-settle";

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[100000] flex items-center justify-center overflow-y-auto p-4"
      panelClassName={`${contentClasses} ${className ?? ""}`}
      label={label}
      labelledBy={labelledBy}
      closeOnBackdrop={!isFullscreen}
      beforePanel={
        !isFullscreen ? (
          <div data-dialog-backdrop className="fixed inset-0 bg-husrev-ink/40 backdrop-blur-sm" />
        ) : null
      }
    >
      {showCloseButton && (
        <button
          type="button"
          onClick={onClose}
          data-dialog-close
          aria-label="Close"
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-husrev-sand/50 hover:text-husrev-ink dark:hover:bg-white/5 dark:hover:text-husrev-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber sm:right-6 sm:top-6"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
      <div>{children}</div>
    </Dialog>
  );
};
