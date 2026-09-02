import React, { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  interactive?: boolean;
  as?: React.ElementType;
}

export default function Card({
  children,
  className = "",
  padded = true,
  interactive = false,
  as: Component = "div",
}: CardProps) {
  const baseClasses =
    "rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]";
  const paddingClass = padded ? "p-5" : "";
  const interactiveClass = interactive ? "husrev-lift" : "";

  return (
    <Component
      className={`${baseClasses} ${paddingClass} ${interactiveClass} ${className}`.trim()}
    >
      {children}
    </Component>
  );
}
