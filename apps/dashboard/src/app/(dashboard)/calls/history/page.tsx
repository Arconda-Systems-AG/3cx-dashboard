"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@3cx-dash/ui";
import { useCallHistory } from "@/hooks/use-data";
import { formatDateTime } from "@/lib/utils";
import { Search, Download, Phone, PhoneOff, ArrowRight } from "lucide-react";

function fmtSecs(s: number): string {
  if (s <= 0) return "–";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function CallHistoryPage() {
  const [limit, setLimit] = useState(100);
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Debounce: Suche erst 400ms nach der letzten Eingabe an den Server schicken
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useCallHistory({ limit, days, q });
  const entries = data?.value ?? [];

  function exportCsv() {
    const header = "Zeitpunkt;Von;Nach;Angenommen von;Status;Gespräch\n";
    const rows = entries.map((e) =>
      [
        formatDateTime(e.startedAt),
        e.srcName ?? e.srcNumber ?? "–",
        e.dstName ?? e.dstNumber ?? "–",
        e.answeredBy ?? "",
        e.answered ? "Angenommen" : "Nicht angenommen",
        fmtSecs(e.durationSeconds),
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

  const dateRange = entries.length > 0
    ? `${formatDateTime(entries[entries.length - 1]?.startedAt ?? "")} – ${formatDateTime(entries[0]?.startedAt ?? "")}`
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
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value={1}>Heute + gestern</option>
            <option value={7}>7 Tage</option>
            <option value={30}>30 Tage</option>
            <option value={90}>90 Tage</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Nebenstelle, Warteschlange, Nummer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 rounded-lg border border-glass bg-input pl-9 pr-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Gespräch</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-muted">Lade...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-muted">Keine Einträge gefunden</td></tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-glass/50 hover:bg-[var(--hover-row)] transition-colors">
                    <td className="px-4 py-3 text-sm text-body whitespace-nowrap">
                      {formatDateTime(entry.startedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-body">{entry.srcName ?? entry.srcNumber ?? "–"}</p>
                        <p className="text-xs text-muted">{entry.srcName ? entry.srcNumber ?? "" : ""}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-body">{entry.dstName ?? entry.dstNumber ?? "–"}</p>
                        {entry.answeredBy && entry.answeredBy !== entry.dstName && (
                          <p className="flex items-center gap-1 text-xs text-emerald-400/80">
                            <ArrowRight className="h-3 w-3" />{entry.answeredBy}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${entry.answered ? "text-emerald-400" : "text-red-400"}`}>
                        {entry.answered ? <Phone className="h-3 w-3" /> : <PhoneOff className="h-3 w-3" />}
                        {entry.answered ? "Angenommen" : "Nicht angenommen"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-secondary">
                      {fmtSecs(entry.durationSeconds)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-glass px-4 py-3">
          <p className="text-xs text-muted">
            {entries.length} Einträge angezeigt · Quelle: CDR-Datenbank · Suche umfasst alle Stationen eines Anrufs (auch Warteschlangen)
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
