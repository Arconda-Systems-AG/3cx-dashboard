import type { ActiveCall } from "@3cx-dash/types";

interface CallStatusBadgeProps {
  status: ActiveCall["Status"] | string;
}

const statusStyles: Record<string, string> = {
  Talking: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Ringing: "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse",
  Held: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Dialing: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const statusLabels: Record<string, string> = {
  Talking: "Gespräch",
  Ringing: "Klingelt",
  Held: "Gehalten",
  Dialing: "Wählt...",
  Connected: "Verbunden",
};

export function CallStatusBadge({ status }: CallStatusBadgeProps) {
  const style = statusStyles[status] ?? "bg-gray-500/15 text-gray-400 border-gray-500/30";
  const label = statusLabels[status] ?? status;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
