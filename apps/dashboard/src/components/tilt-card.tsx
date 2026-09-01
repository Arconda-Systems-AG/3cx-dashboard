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
 * Statische Kachel mit solider Fläche (kein backdrop-blur).
 * backdrop-blur erzeugte bei jedem Repaint (Live-Update, Scroll) dünne
 * Seam-Linien auf den Kacheln. Ersetzt durch bg-surface-elevated (opak),
 * dadurch entfällt das Artefakt vollständig. Look bleibt eine dunkle
 * abgesetzte Kachel.
 */
export function TiltCard({
  children,
  className = "",
  style,
}: TiltCardProps) {
  return (
    <div
      style={style}
      className={`relative rounded-3xl border border-glass bg-surface-elevated overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}
