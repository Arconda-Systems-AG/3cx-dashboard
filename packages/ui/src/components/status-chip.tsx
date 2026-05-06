import type { ExtensionStatus } from "@3cx-dash/types";

interface StatusChipProps {
  status: ExtensionStatus | string;
  size?: "sm" | "md";
}

const statusStyles: Record<string, string> = {
  Registered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Available: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Unregistered: "bg-red-500/15 text-red-400 border-red-500/30",
  "N/A": "bg-gray-500/15 text-gray-400 border-gray-500/30",
  Away: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DND: "bg-red-500/15 text-red-400 border-red-500/30",
  Lunch: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Business Trip": "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const statusLabels: Record<string, string> = {
  Registered: "Registriert",
  Available: "Verfügbar",
  Unregistered: "Offline",
  "N/A": "N/A",
  Away: "Abwesend",
  DND: "Bitte nicht stören",
  Lunch: "Mittagspause",
  "Business Trip": "Dienstreise",
};

export function StatusChip({ status, size = "md" }: StatusChipProps) {
  const style = statusStyles[status] ?? "bg-gray-500/15 text-gray-400 border-gray-500/30";
  const label = statusLabels[status] ?? status;
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${style} ${sizeClass}`}>
      {label}
    </span>
  );
}
