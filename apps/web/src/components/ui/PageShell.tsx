import React, { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  variant?: "flow" | "fill";
  className?: string;
}

export default function PageShell({
  children,
  variant = "flow",
  className = "",
}: PageShellProps) {
  if (variant === "fill") {
    return (
      <div className={`flex-1 min-h-0 flex flex-col ${className}`.trim()}>
        {children}
      </div>
    );
  }

  return (
    <div className={`min-h-full flex flex-col ${className}`.trim()}>
      {children}
    </div>
  );
}
