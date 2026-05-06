import { type ReactNode } from "react";

export type LedStatus = "online" | "offline" | "warning";

interface LedIndicatorProps {
  status: LedStatus;
  size?: "sm" | "md" | "lg";
  label?: string;
  pulse?: boolean;
}

const sizeMap = { sm: "h-2.5 w-2.5", md: "h-3.5 w-3.5", lg: "h-5 w-5" };
const colorMap = {
  online: "bg-emerald-500 shadow-emerald-500/50",
  offline: "bg-red-500 shadow-red-500/50",
  warning: "bg-amber-500 shadow-amber-500/50",
};

export function LedIndicator({ status, size = "md", label, pulse = true }: LedIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center">
        <div
          className={`rounded-full shadow-[0_0_8px] ${sizeMap[size]} ${colorMap[status]} ${
            pulse && status === "online" ? "animate-pulse-led" : ""
          }`}
        />
      </div>
      {label && <span className="text-sm font-medium text-body">{label}</span>}
    </div>
  );
}
