"use client";

import { useState } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import { TiltCard } from "@/components/tilt-card";
import { useQueues } from "@/hooks/use-data";
import { ListOrdered, Users, Phone, Search, ChevronDown, ChevronUp } from "lucide-react";

const profileBadge: Record<string, { label: string; cls: string }> = {
  "DND":           { label: "DND",         cls: "bg-red-500/20 text-red-400" },
  "Away":          { label: "Abwesend",    cls: "bg-orange-500/20 text-orange-400" },
  "Lunch":         { label: "Mittagspause",cls: "bg-yellow-500/20 text-yellow-400" },
  "Business Trip": { label: "Dienstreise", cls: "bg-purple-500/20 text-purple-400" },
};

export default function QueuesPage() {
  const { data, isLoading } = useQueues();
  const queues = data?.value ?? [];
  const [search, setSearch] = useState("");
  const [expandedQueues, setExpandedQueues] = useState<Set<number>>(new Set());

  function toggleExpand(id: number) {
    setExpandedQueues((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtered = queues.filter((q) =>
    !search || q.Name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Warteschlangen</h1>
          <p className="text-sm text-muted">{queues.length} Warteschlangen konfiguriert</p>
        </div>

        {queues.length > 1 && (
          <div className="relative min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Abteilung suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-glass bg-input pl-9 pr-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/40 transition-colors"
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted">Lade...</div>
      ) : filtered.length === 0 ? (
        <GlassCard className="py-16 text-center">
          <ListOrdered className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            {search ? "Keine Warteschlange gefunden" : "Keine Warteschlangen konfiguriert"}
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((queue) => {
            const totalAgents = queue.Agents?.length ?? 0;
            const loggedIn = queue.LoggedInAgents ?? 0;
            const activeCallCount = queue.ActiveCallCount ?? 0;
            const waitingCallCount = queue.WaitingCallCount ?? 0;
            const hasActiveCalls = activeCallCount > 0;
            const hasWaiting = waitingCallCount > 0;
            const agentsInCall = (queue.Agents ?? []).filter((a) => a.HasActiveCall).length;

            const isExpanded = expandedQueues.has(queue.Id);
            const visibleAgents = isExpanded ? queue.Agents : queue.Agents?.slice(0, 4);
            const hiddenCount = totalAgents - 4;

            return (
              <TiltCard key={queue.Id} maxTilt={7} glowColor={hasActiveCalls ? "rgba(245,158,11,0.3)" : "rgba(240,128,23,0.18)"} className="p-5">
                {/* Header */}
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-heading">{queue.Name}</h3>
                      {hasWaiting && (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-500/20 text-sky-400 animate-pulse">
                          <Phone className="h-2.5 w-2.5" /> Klingelt
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">Nebenstelle {queue.Number ?? "–"}</p>
                  </div>
                  <LedIndicator status={queue.IsRegistered ? "online" : "offline"} size="sm" pulse={false} />
                </div>

                {/* Statistiken */}
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-subtle p-3">
                  <div className="text-center" title={`${activeCallCount} aktive Gespräche`}>
                    <div className="flex items-center justify-center gap-1">
                      <p className={`text-lg font-bold ${hasActiveCalls ? "text-amber-400" : "text-muted"}`}>
                        {activeCallCount}
                      </p>
                      {hasActiveCalls && <Phone className="h-3.5 w-3.5 text-amber-400 animate-pulse" />}
                    </div>
                    <p className="text-xs text-muted">Aktiv</p>
                  </div>
                  <div className="text-center" title={`${loggedIn} angemeldet`}>
                    <p className="text-lg font-bold text-emerald-400">{loggedIn}</p>
                    <p className="text-xs text-muted">Angemeldet</p>
                  </div>
                  <div className="text-center" title={`${totalAgents} gesamt`}>
                    <p className="text-lg font-bold text-body">{totalAgents}</p>
                    <p className="text-xs text-muted">Gesamt</p>
                  </div>
                </div>

                {/* Zwei Balken: Auslastung + Anmeldequote */}
                {totalAgents > 0 && (
                  <div className="mb-4 space-y-1.5">
                    {[
                      {
                        label: "Auslastung",
                        pct: loggedIn > 0 ? Math.min(100, Math.round((agentsInCall / loggedIn) * 100)) : 0,
                        color: (p: number) => p >= 80 ? "#ef4444" : p >= 50 ? "#f59e0b" : "#10b981",
                      },
                      {
                        label: "Anmeldequote",
                        pct: Math.round((loggedIn / totalAgents) * 100),
                        color: (p: number) => p >= 80 ? "#10b981" : p >= 40 ? "#f59e0b" : "#ef4444",
                      },
                    ].map(({ label, pct, color }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-22 shrink-0 text-xs text-muted">{label}</span>
                        <div className="relative flex-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: color(pct) }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-secondary">{pct}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Agenten-Liste */}
                {queue.Agents && queue.Agents.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted">
                      <Users className="h-3 w-3" />
                      Agenten
                    </h4>
                    <div className="space-y-1.5">
                      {(visibleAgents ?? []).map((agent) => {
                        const isLoggedIn = agent.QueueStatus === "LoggedIn";
                        const isRegistered = agent.IsRegistered ?? true;
                        const hasCall = agent.HasActiveCall;
                        const isOffline = isLoggedIn && !isRegistered;
                        const isRinging = hasWaiting && isLoggedIn && isRegistered && !hasCall;
                        const profile = agent.CurrentProfile ?? "Available";
                        const badge = profile !== "Available" ? (profileBadge[profile] ?? { label: profile, cls: "bg-gray-500/20 text-gray-400" }) : null;

                        const dotColor = isRinging
                          ? "bg-sky-400 animate-ping"
                          : hasCall
                          ? "bg-amber-400 animate-pulse"
                          : isOffline
                          ? "bg-red-400"
                          : isLoggedIn
                          ? "bg-emerald-400"
                          : "bg-gray-500";

                        const statusLabel = isRinging ? "Klingelt" : hasCall ? "Gespräch" : isOffline ? "Offline" : isLoggedIn ? "Angemeldet" : "Abgemeldet";
                        const statusColor = isRinging ? "text-sky-400" : hasCall ? "text-amber-400" : isOffline ? "text-red-400" : isLoggedIn ? "text-emerald-400" : "text-muted";
                        const rowBg = isRinging ? "bg-sky-500/10 hover:bg-sky-500/20" : hasCall ? "bg-amber-500/10 hover:bg-amber-500/20" : isOffline ? "bg-red-500/10 hover:bg-red-500/20" : "hover:bg-surface-muted";

                        return (
                          <div
                            key={agent.Id ?? agent.Number}
                            className={`flex items-center justify-between rounded-lg px-2 py-1 transition-colors ${rowBg}`}
                            title={`${agent.Name} — ${statusLabel}${badge ? ` (${badge.label})` : ""}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
                              <span className="text-xs text-body truncate">{agent.Name} ({agent.Number})</span>
                              {badge && (
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              )}
                            </div>
                            <span className={`text-xs font-medium shrink-0 ml-1 ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                        );
                      })}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => toggleExpand(queue.Id)}
                          className="flex items-center gap-1 px-2 text-xs text-primary hover:text-primary/80 transition-colors"
                        >
                          {isExpanded ? (
                            <><ChevronUp className="h-3 w-3" /> Weniger anzeigen</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" /> +{hiddenCount} weitere Agenten</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </TiltCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
