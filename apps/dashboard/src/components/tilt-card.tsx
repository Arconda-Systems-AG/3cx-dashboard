"use client";

import { useRef, useState, type ReactNode, type CSSProperties } from "react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Maximale Neigung in Grad (default 10) */
  maxTilt?: number;
  /** Glow-Farbe als rgba-String (default primary orange) */
  glowColor?: string;
  /** Zusätzliche Inline-Styles (z.B. animation) */
  style?: CSSProperties;
}

export function TiltCard({
  children,
  className = "",
  maxTilt = 10,
  glowColor = "rgba(240, 128, 23, 0.25)",
  style: externalStyle,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [outerStyle, setOuterStyle] = useState<CSSProperties>({
    transform: "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
    transition: "transform 0.4s ease, box-shadow 0.4s ease",
  });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const rx = (y - 0.5) * -maxTilt;
    const ry = (x - 0.5) * maxTilt;

    setOuterStyle({
      transform: `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.03, 1.03, 1.03)`,
      transition: "transform 0.08s ease",
      boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 40px ${glowColor}`,
      zIndex: 10,
    });
  }

  function handleMouseLeave() {
    setOuterStyle({
      transform: "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.5s ease",
      boxShadow: "",
      zIndex: undefined,
    });
  }

  return (
    // Outer: nur Transform — kein border-radius, kein overflow-hidden, kein border
    // isolation:isolate verhindert GPU-Layer-Seam zu Nachbarkarten
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ ...externalStyle, ...outerStyle, willChange: "transform", isolation: "isolate" }}
      className="relative"
    >
      {/* Inner: alle visuellen Styles — border-radius + overflow-hidden getrennt vom Transform */}
      <div className={`relative rounded-3xl border border-glass bg-surface-glass backdrop-blur-xl overflow-hidden ${className}`}>
        {children}
      </div>
    </div>
  );
}
