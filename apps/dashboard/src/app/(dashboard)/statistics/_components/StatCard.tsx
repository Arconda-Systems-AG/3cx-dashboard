import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number | null | undefined;
  unit?: string;
  className?: string;
}

function formatValue(value: string | number | null | undefined, title?: string): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);

  // Detect percent by title
  const isPercent = title ? /%|percent|rate|quote|anteil/i.test(title) : false;
  if (isPercent) return num.toFixed(1) + " %";

  // Only format as duration if title explicitly suggests time/duration
  // No \b boundaries — German compound words like "Anrufdauer", "Gesprächszeit" must also match
  const isDuration = title
    ? /(zeit|dauer|duration|talk.?time|wait.?time|avg.*time|sekunde|gespräch|wartezeit|gesprächszeit|längst|longest)/i.test(title)
    : false;
  if (isDuration && num > 0 && Number.isInteger(Math.round(num))) {
    const h = Math.floor(num / 3600);
    const m = Math.floor((num % 3600) / 60);
    const s = Math.round(num % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 10_000) return (num / 1000).toFixed(1) + "k";
  if (Number.isInteger(num)) return num.toLocaleString("de-DE");
  return num.toFixed(1);
}

export function StatCard({ title, value, unit, className }: StatCardProps) {
  return (
    <div className={cn("rounded-xl border border-glass bg-surface-subtle p-4", className)}>
      <p className="text-xs text-muted truncate">{title}</p>
      <p className="mt-1 text-2xl font-bold text-heading">
        {formatValue(value, title)}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}
