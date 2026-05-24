"use client";

import Link from "next/link";
import { ReactNode } from "react";

type Tone =
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

interface Props {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: Tone;
}

export default function StatCard({ icon, label, value, hint, href, tone = "brand" }: Props) {
  const body = (
    <div className="group relative h-full overflow-hidden rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 husrev-lift dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <div
        className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-3 ${TONE_CLASSES[tone]}`}
      >
        {icon}
      </div>
      <p className="mt-4 text-[10.5px] font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1.5 text-[28px] font-semibold leading-none tracking-tight text-husrev-ink dark:text-husrev-cream font-variant-numeric tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs font-mono text-gray-400 dark:text-gray-500">{hint}</p>}
      <span className="pointer-events-none absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-husrev-amber/0 to-transparent transition-all duration-500 group-hover:via-husrev-amber/60" />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}
