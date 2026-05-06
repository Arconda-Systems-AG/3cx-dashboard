"use client";

import { useState, useMemo } from "react";
import { GlassCard, StatusChip, ExtensionAvatar } from "@3cx-dash/ui";
import { useExtensions, useQueues } from "@/hooks/use-data";
import { Search, Building2 } from "lucide-react";

export default function ExtensionsPage() {
  const { data, isLoading } = useExtensions();
  const { data: queuesData } = useQueues();

  const extensions = data?.value ?? [];
  const queues = queuesData?.value ?? [];

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "online" | "offline">("all");
  const [selectedQueue, setSelectedQueue] = useState<string>("");

  // Agenten-Set für die ausgewählte Queue aufbauen
  const queueAgentNumbers = useMemo<Set<string>>(() => {
    if (!selectedQueue) return new Set();
    const queue = queues.find((q) => String(q.Id) === selectedQueue);
    if (!queue) return new Set();
    return new Set((queue.Agents ?? []).map((a) => a.Number));
  }, [selectedQueue, queues]);

  const filtered = extensions.filter((ext) => {
    const matchSearch =
      !search ||
      ext.Number.includes(search) ||
      `${ext.FirstName} ${ext.LastName}`.toLowerCase().includes(search.toLowerCase()) ||
      ext.EmailAddress?.toLowerCase().includes(search.toLowerCase());

    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "online" && ext.IsRegistered) ||
      (filterStatus === "offline" && !ext.IsRegistered);

    const matchQueue =
      !selectedQueue || queueAgentNumbers.has(ext.Number);

    return matchSearch && matchStatus && matchQueue;
  });

  const onlineCount = extensions.filter((e) => e.IsRegistered).length;

  const selectedQueueName = selectedQueue
    ? queues.find((q) => String(q.Id) === selectedQueue)?.Name ?? ""
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Nebenstellen</h1>
          <p className="text-sm text-muted">
            {onlineCount} online / {extensions.length} gesamt
            {selectedQueueName && ` · Abteilung: ${selectedQueueName}`}
          </p>
        </div>
      </div>

      {/* Filter-Leiste */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-3">
          {/* Suche */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Name oder Nummer suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-glass bg-input pl-9 pr-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/40 transition-colors"
            />
          </div>

          {/* Abteilungs-Filter */}
          {queues.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted flex-shrink-0" />
              <select
                value={selectedQueue}
                onChange={(e) => setSelectedQueue(e.target.value)}
                className="rounded-lg border border-glass bg-input px-2 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/40 transition-colors cursor-pointer"
                title="Nach Abteilung (Warteschlange) filtern"
              >
                <option value="">Alle Abteilungen</option>
                {queues.map((q) => (
                  <option key={q.Id} value={String(q.Id)}>
                    {q.Name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status-Filter */}
          <div className="flex gap-2">
            {(["all", "online", "offline"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  filterStatus === s
                    ? "bg-primary/15 text-primary"
                    : "text-secondary hover:text-heading hover:bg-surface-muted"
                }`}
              >
                {s === "all" ? "Alle" : s === "online" ? "Online" : "Offline"}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Nebenstellen-Tabelle */}
      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Nebenstelle
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Profil
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Warteschlange
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  E-Mail
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted">
                    Lade...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted">
                    Keine Nebenstellen gefunden
                  </td>
                </tr>
              ) : (
                filtered.map((ext) => (
                  <tr
                    key={ext.Id}
                    className="border-b border-glass/50 hover:bg-[var(--hover-row)] transition-colors cursor-default"
                    title={`${ext.FirstName} ${ext.LastName} — Nebenstelle ${ext.Number}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ExtensionAvatar
                          firstName={ext.FirstName}
                          lastName={ext.LastName}
                          number={ext.Number}
                          status={ext.IsRegistered ? "online" : "offline"}
                          size="sm"
                        />
                        <span className="font-mono text-sm font-medium text-heading">
                          {ext.Number}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-body">
                      {ext.FirstName} {ext.LastName}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        status={ext.IsRegistered ? "Registered" : "Unregistered"}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-secondary">
                      {ext.CurrentProfileName || "–"}
                    </td>
                    <td className="px-4 py-3 text-sm text-secondary">
                      {ext.QueueStatus || "–"}
                    </td>
                    <td className="px-4 py-3 text-sm text-secondary">
                      {ext.EmailAddress || "–"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-glass px-4 py-3">
          <p className="text-xs text-muted">{filtered.length} Nebenstellen angezeigt</p>
        </div>
      </GlassCard>
    </div>
  );
}
