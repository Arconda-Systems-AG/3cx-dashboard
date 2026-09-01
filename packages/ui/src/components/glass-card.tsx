import { type ReactNode } from "react";

import { type HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className = "", hover = false, ...props }: GlassCardProps) {
  return (
    <div
      {...props}
      className={`rounded-3xl border border-glass bg-surface-elevated shadow-[var(--shadow-glass)] ${
        hover ? "transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
