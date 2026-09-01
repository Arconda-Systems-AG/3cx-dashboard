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
 * Kachel mit solider Fläche (kein backdrop-blur) und dezentem CSS-Hover.
 * backdrop-blur erzeugte bei jedem Repaint Seam-Linien — daher opake
 * bg-surface-elevated. Der Hover ist rein CSS (Transform + Border), ohne
 * JS-State/Maus-Tracking, dadurch keine Repaint-Artefakte und keine
 * ausufernden Schatten auf Nachbarkacheln.
 */
export function TiltCard({
  children,
  className = "",
  style,
}: TiltCardProps) {
  return (
    <div
      style={style}
      className={`relative rounded-3xl border border-glass bg-surface-elevated overflow-hidden transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 ${className}`}
    >
      {children}
    </div>
  );
}
