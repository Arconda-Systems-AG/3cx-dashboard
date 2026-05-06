"use client";

import { useState, useMemo } from "react";
import { GlassCard } from "@3cx-dash/ui";
import { useCallHistory } from "@/hooks/use-data";
import { formatDateTime, formatDurationMs } from "@/lib/utils";
import { Search, Download, Phone, PhoneOff } from "lucide-react";

export default function CallHistoryPage() {
  const [limit, setLimit] = useState(100);
  const [extension, setExtension] = useState("");
  const { data, isLoading } = useCallHistory({ limit });
  const allEntries = data?.value ?? [];

  // Nur nach Nebenstelle filtern (kein Datumsfilter – CallHistoryView unterstützt kein $filter)
  const entries = useMemo(() => {
    if (!extension) return allEntries;
    const q = extension.toLowerCase();
    return allEntries.filter((e) => {
      const inSrc = (e.SrcDn ?? "").includes(q) || (e.SrcDisplayName ?? "").toLowerCase().includes(q);
      const inDst = (e.DstDn ?? "").includes(q) || (e.DstDisplayName ?? "").toLowerCase().includes(q);
      return inSrc || inDst;
    });
  }, [allEntries, extension]);

  function exportCsv() {
    const header = "Zeitpunkt;Von;Nach;Status;Dauer\n";
    const rows = entries.map((e) =>
      [
        formatDateTime(e.SegmentStartTime ?? ""),
        e.SrcDisplayName ?? e.SrcDn ?? "–",
        e.DstDisplayName ?? e.DstDn ?? "–",
        e.CallAnswered ? "Angenommen" : "Nicht angenommen",
        formatDurationMs(e.Duration ?? 0),
      ].join(";")
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `3cx-anrufprotokoll-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Datum-Range der geladenen Daten ermitteln
  const dateRange = allEntries.length > 0
    ? `${formatDateTime(allEntries[allEntries.length - 1]?.SegmentStartTime ?? "")} – ${formatDateTime(allEntries[0]?.SegmentStartTime ?? "")}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Anrufprotokoll</h1>
          <p className="text-sm text-muted">{entries.length} Einträge{dateRange ? ` · ${dateRange}` : ""}</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={entries.length === 0}
          className="flex items-center gap-2 rounded-lg border border-glass px-3 py-2 text-sm text-secondary hover:text-heading disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          CSV Export
        </button>
      </div>

      {/* Filter */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value={25}>25 Einträge</option>
            <option value={50}>50 Einträge</option>
            <option value={100}>100 Einträge</option>
            <option value={200}>200 Einträge</option>
            <option value={500}>500 Einträge</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Nebenstelle filtern..."
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              className="w-48 rounded-lg border border-glass bg-input pl-9 pr-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Zeitpunkt</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Von</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Nach</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Dauer</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-muted">Lade... (CallHistoryView kann bis zu 25s brauchen)</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-muted">Keine Einträge gefunden</td></tr>
              ) : (
                entries.map((entry, i) => (
                  <tr key={entry.SegmentId ?? i} className="border-b border-glass/50 hover:bg-[var(--hover-row)] transition-colors">
                    <td className="px-4 py-3 text-sm text-body whitespace-nowrap">
                      {formatDateTime(entry.SegmentStartTime ?? "")}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-body">{entry.SrcDisplayName ?? "–"}</p>
                        <p className="text-xs text-muted">{entry.SrcDn ?? ""}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-body">{entry.DstDisplayName ?? "–"}</p>
                        <p className="text-xs text-muted">{entry.DstDn ?? ""}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${entry.CallAnswered ? "text-emerald-400" : "text-red-400"}`}>
                        {entry.CallAnswered ? <Phone className="h-3 w-3" /> : <PhoneOff className="h-3 w-3" />}
                        {entry.CallAnswered ? "Angenommen" : "Nicht angenommen"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-secondary">
                      {formatDurationMs(entry.Duration ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-glass px-4 py-3">
          <p className="text-xs text-muted">{entries.length} Einträge angezeigt</p>
        </div>
      </GlassCard>
    </div>
  );
}
