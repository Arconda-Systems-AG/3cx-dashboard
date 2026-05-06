import { type ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className = "", hover = false }: GlassCardProps) {
  return (
    <div
      className={`rounded-3xl border border-glass bg-surface-glass shadow-[var(--shadow-glass)] backdrop-blur-xl ${
        hover ? "transition-all duration-300 hover:shadow-[var(--shadow-glass-hover)] hover:-translate-y-0.5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
