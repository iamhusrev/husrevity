import React, { ReactNode } from "react";

export type Tone =
  | "brand"
  | "emerald"
  | "orange"
  | "red"
  | "gray"
  | "violet"
  | "amber"
  | "ember"
  | "moss"
  | "ink";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300",
  emerald: "bg-husrev-moss/10 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream",
  orange: "bg-husrev-amber/10 text-husrev-ember dark:bg-husrev-amber/20 dark:text-husrev-amber",
  red: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  violet: "bg-husrev-ember/10 text-husrev-ember dark:bg-husrev-ember/25 dark:text-husrev-amber",
  amber: "bg-husrev-amber/10 text-husrev-ember dark:bg-husrev-amber/20 dark:text-husrev-amber",
  ember: "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-ember/30 dark:text-husrev-amber",
  moss: "bg-husrev-moss/10 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream",
  ink: "bg-husrev-ink text-husrev-cream dark:bg-husrev-cream dark:text-husrev-ink",
};

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
}

export default function Badge({ children, tone = "brand", size = "md" }: BadgeProps) {
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
