"use client";

import { type ReactNode, type CSSProperties } from "react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Nicht mehr verwendet — bleibt für API-Kompatibilität */
  maxTilt?: number;
  /** Nicht mehr verwendet — bleibt für API-Kompatibilität */
  glowColor?: string;
  /** Zusätzliche Inline-Styles */
  style?: CSSProperties;
}

/**
 * Statische Glas-Kachel.
 * Der frühere Maus-Over-Effekt (Shimmer + Shadow) wurde entfernt: die
 * Style-Änderung beim Hover triggerte ein Repaint, wodurch die
 * backdrop-blur-Kacheln neu gerendert wurden und dünne Seam-Linien auf
 * ALLEN Kacheln (nicht nur Nachbarn) entstanden. Ohne Hover-Repaint tritt
 * das Artefakt nicht mehr auf.
 */
export function TiltCard({
  children,
  className = "",
  style,
}: TiltCardProps) {
  return (
    <div
      style={style}
      className={`relative rounded-3xl border border-glass bg-surface-glass backdrop-blur-xl overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}
