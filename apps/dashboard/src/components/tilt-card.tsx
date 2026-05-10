"use client";

import { useRef, useState, type ReactNode, type CSSProperties } from "react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Nicht mehr verwendet (kein rotateX/rotateY) — bleibt für API-Kompatibilität */
  maxTilt?: number;
  /** Glow-Farbe als rgba-String */
  glowColor?: string;
  /** Zusätzliche Inline-Styles */
  style?: CSSProperties;
}

export function TiltCard({
  children,
  className = "",
  glowColor = "rgba(240, 128, 23, 0.25)",
  style: externalStyle,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverStyle, setHoverStyle] = useState<CSSProperties>({});
  const [highlight, setHighlight] = useState({ x: 50, y: 50, active: false });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setHoverStyle({
      transform: "scale3d(1.025, 1.025, 1.025) translateY(-2px)",
      transition: "transform 0.08s ease, box-shadow 0.08s ease",
      boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 40px ${glowColor}`,
      zIndex: 10,
    });
    setHighlight({ x: x * 100, y: y * 100, active: true });
  }

  function handleMouseLeave() {
    setHoverStyle({
      transform: "",
      transition: "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.5s ease",
      boxShadow: "",
      zIndex: undefined,
    });
    setHighlight({ x: 50, y: 50, active: false });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ ...externalStyle, ...hoverStyle, willChange: "transform" }}
      className={`relative rounded-3xl border border-glass bg-surface-glass backdrop-blur-xl overflow-hidden ${className}`}
    >
      {/* Shimmer-Highlight folgt der Mausposition */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background: `radial-gradient(circle at ${highlight.x}% ${highlight.y}%, rgba(255,255,255,0.1) 0%, transparent 65%)`,
          opacity: highlight.active ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
      {children}
    </div>
  );
}
