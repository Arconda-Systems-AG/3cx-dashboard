"use client";

import { useState } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import { TiltCard } from "@/components/tilt-card";
import { useQueues } from "@/hooks/use-data";
import { ListOrdered, Users, Phone, Search, ChevronDown, ChevronUp } from "lucide-react";

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

        {/* Abteilungs-Filter */}
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
            const hasActiveCalls = activeCallCount > 0;
            const queueIsRinging = (queue.WaitingCallCount ?? 0) > 0;

            const isExpanded = expandedQueues.has(queue.Id);
            const visibleAgents = isExpanded ? queue.Agents : queue.Agents?.slice(0, 6);
            const hiddenCount = (queue.Agents?.length ?? 0) - 6;

            return (
              <TiltCard key={queue.Id} maxTilt={7} glowColor={hasActiveCalls ? "rgba(245,158,11,0.3)" : "rgba(240,128,23,0.18)"} className="p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-heading">{queue.Name}</h3>
                    <p className="text-xs text-muted">Nebenstelle {queue.Number ?? "–"}</p>
                  </div>
                  <LedIndicator status={queue.IsRegistered ? "online" : "offline"} size="sm" pulse={false} />
                </div>

                {/* Statistiken: aktive Gespräche + angemeldet + gesamt */}
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-subtle p-3">
                  <div
                    className="text-center"
                    title={`${activeCallCount} aktive${activeCallCount === 1 ? "s" : ""} Gespräch${activeCallCount !== 1 ? "e" : ""} in dieser Warteschlange`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <p className={`text-lg font-bold ${hasActiveCalls ? "text-amber-400" : "text-muted"}`}>
                        {activeCallCount}
                      </p>
                      {hasActiveCalls && (
                        <Phone className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-muted">Aktiv</p>
                  </div>
                  <div className="text-center" title={`${loggedIn} angemeldete Agenten`}>
                    <p className="text-lg font-bold text-emerald-400">{loggedIn}</p>
                    <p className="text-xs text-muted">Angemeldet</p>
                  </div>
                  <div className="text-center" title={`${totalAgents} Agenten gesamt`}>
                    <p className="text-lg font-bold text-body">{totalAgents}</p>
                    <p className="text-xs text-muted">Gesamt</p>
                  </div>
                </div>

                {/* Auslastungsbalken */}
                {totalAgents > 0 && (
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs text-muted">Auslastung</span>
                      <span className="text-xs font-semibold text-secondary">{Math.round((loggedIn / totalAgents) * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.round((loggedIn / totalAgents) * 100)}%`,
                          background: loggedIn === 0 ? '#475569' : 'linear-gradient(90deg, #10b981, #34d399)',
                        }}
                      />
                    </div>
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
                        const profile = agent.CurrentProfile ?? "Available";
                        // Klingelt = Queue verteilt gerade (Rerouting) + Agent wäre verfügbar
                        const isRinging = queueIsRinging && isLoggedIn && isRegistered && !hasCall;

                        const dotColor = hasCall
                          ? "bg-amber-400 animate-pulse"
                          : isRinging
                          ? "bg-sky-400 animate-pulse"
                          : isOffline
                          ? "bg-red-400"
                          : isLoggedIn
                          ? "bg-emerald-400"
                          : "bg-gray-500";

                        const statusLabel = hasCall
                          ? "Gespräch"
                          : isRinging
                          ? "Klingelt"
                          : isOffline
                          ? "Offline"
                          : isLoggedIn
                          ? "Angemeldet"
                          : "Abgemeldet";

                        const statusColor = hasCall
                          ? "text-amber-400"
                          : isRinging
                          ? "text-sky-400"
                          : isOffline
                          ? "text-red-400"
                          : isLoggedIn
                          ? "text-emerald-400"
                          : "text-muted";

                        const rowBg = hasCall
                          ? "bg-amber-500/10 hover:bg-amber-500/20"
                          : isRinging
                          ? "bg-sky-500/10 hover:bg-sky-500/20"
                          : isOffline
                          ? "bg-red-500/10 hover:bg-red-500/20"
                          : "hover:bg-surface-muted";

                        const profileBadge: Record<string, { label: string; cls: string }> = {
                          "DND": { label: "DND", cls: "bg-red-500/20 text-red-400" },
                          "Away": { label: "Abwesend", cls: "bg-orange-500/20 text-orange-400" },
                          "Lunch": { label: "Mittagspause", cls: "bg-yellow-500/20 text-yellow-400" },
                          "Business Trip": { label: "Dienstreise", cls: "bg-purple-500/20 text-purple-400" },
                        };
                        const badge = profile !== "Available" ? (profileBadge[profile] ?? { label: profile, cls: "bg-gray-500/20 text-gray-400" }) : null;

                        return (
                          <div
                            key={agent.Id ?? agent.Number}
                            className={`flex items-center justify-between rounded-lg px-2 py-1 transition-colors ${rowBg}`}
                            title={`${agent.Name} — ${statusLabel}${badge ? ` (${badge.label})` : ""}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
                              <span className="text-xs text-body truncate">
                                {agent.Name} ({agent.Number})
                              </span>
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
