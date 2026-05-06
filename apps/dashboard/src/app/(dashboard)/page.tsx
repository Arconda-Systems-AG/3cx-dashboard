"use client";

import { useState } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import { useHealth, useActiveCalls, useExtensions, useQueues, useDepartments, useRecentMissed } from "@/hooks/use-data";
import { formatDuration } from "@/lib/utils";
import { Phone, Users, ListOrdered, Activity, ChevronDown, ChevronUp } from "lucide-react";

function parseDn(field: string): string {
  return (field ?? "").split(" ")[0];
}

export default function DashboardPage() {
  const { data: health } = useHealth();
  const { data: callsData } = useActiveCalls();
  const { data: extensionsData } = useExtensions();
  const { data: queuesData } = useQueues();
  const { data: deptData } = useDepartments();
  const { data: missedData } = useRecentMissed();
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [expandedQueues, setExpandedQueues] = useState<Set<number>>(new Set());

  function toggleExpand(id: number) {
    setExpandedQueues((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const activeCalls = callsData?.value ?? [];
  const extensions = extensionsData?.value ?? [];
  const queues = queuesData?.value ?? [];
  const departments = deptData?.groups ?? [];

  const selectedDept = selectedDeptId
    ? departments.find((d) => String(d.id) === selectedDeptId) ?? null
    : null;

  const memberNumbers = new Set<string>(selectedDept?.memberNumbers ?? []);

  const filteredExtensions = selectedDept
    ? extensions.filter((e) => memberNumbers.has(e.Number))
    : extensions;

  const filteredCalls = selectedDept
    ? activeCalls.filter((c) => {
        const callerDn = parseDn(c.Caller ?? "");
        const calleeDn = parseDn(c.Callee ?? "");
        return memberNumbers.has(callerDn) || memberNumbers.has(calleeDn);
      })
    : activeCalls;

  const filteredQueues = selectedDept
    ? queues.filter((q) =>
        (q.Agents ?? []).some((a) => memberNumbers.has(a.Number))
      )
    : queues;

  const onlineCount = filteredExtensions.filter((e) => e.IsRegistered).length;
  const offlineCount = filteredExtensions.length - onlineCount;
  const activeInQueues = filteredQueues.reduce((sum, q) => sum + (q.ActiveCallCount ?? 0), 0);
  const recentMissed = missedData?.missed_count ?? null;

  const stats = [
    { label: "Aktive Anrufe", value: filteredCalls.length, icon: Phone, color: "text-emerald-400", bg: "bg-emerald-500/10", accent: "bg-emerald-500" },
    { label: "In Warteschlangen", value: activeInQueues, icon: Phone, color: "text-amber-400", bg: "bg-amber-500/10", accent: "bg-amber-500" },
    { label: "Online", value: onlineCount, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10", accent: "bg-blue-500" },
    { label: "Offline", value: offlineCount, icon: Users, color: "text-red-400", bg: "bg-red-500/10", accent: "bg-red-500" },
    { label: "Warteschlangen", value: filteredQueues.length, icon: ListOrdered, color: "text-violet-400", bg: "bg-violet-500/10", accent: "bg-violet-500" },
    ...(recentMissed !== null ? [{ label: "Verpasst (60 Min)", value: recentMissed, icon: Phone, color: recentMissed > 0 ? "text-red-400" : "text-muted", bg: recentMissed > 0 ? "bg-red-500/10" : "bg-surface-muted", accent: recentMissed > 0 ? "bg-red-500" : "bg-gray-600" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-heading">Übersicht</h1>
        <div className="relative">
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="appearance-none rounded-xl border border-glass bg-input px-3 py-2 pr-8 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/40 transition-colors cursor-pointer"
          >
            <option value="">Alle Abteilungen</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>{d.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>
      </div>

      {/* Verbindungsstatus-Banner */}
      {!health?.connected && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 text-red-400">
            <LedIndicator status="offline" size="md" pulse={false} />
            <span className="font-medium">3CX nicht erreichbar – überprüfe Verbindung und Credentials</span>
          </div>
        </GlassCard>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <GlassCard key={stat.label} className="relative overflow-hidden p-5">
            {/* Farbige Akzentlinie oben */}
            <div className={`absolute inset-x-0 top-0 h-[2px] ${stat.accent} opacity-70`} />
            {/* Icon */}
            <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            {/* Große farbige Zahl */}
            <p className={`text-3xl font-bold tabular-nums tracking-tight ${stat.color}`}>{stat.value}</p>
            {/* Label */}
            <p className="mt-1 text-xs font-medium leading-tight text-muted">{stat.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Aktive Anrufe */}
      <GlassCard className={`p-5 transition-all duration-500 ${filteredCalls.length > 0 ? "ring-1 ring-inset ring-emerald-500/15" : ""}`}>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-heading">
          <Activity className={`h-4 w-4 ${filteredCalls.length > 0 ? "text-emerald-400" : "text-primary"}`} />
          Aktive Anrufe
          {filteredCalls.length > 0 && (
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              {filteredCalls.length}
            </span>
          )}
        </h2>
        {filteredCalls.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Keine aktiven Anrufe</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCalls.slice(0, 12).map((call) => (
              <div key={call.Id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-muted">
                <div className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/50" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-body">{call.Caller} → {call.Callee}</p>
                  <p className="text-xs text-muted">{call.Status === "Talking" ? "Gespräch" : call.Status}</p>
                </div>
                <span className="flex-shrink-0 text-xs tabular-nums text-secondary">
                  {call.EstablishedAt
                    ? formatDuration(Math.floor((Date.now() - new Date(call.EstablishedAt).getTime()) / 1000))
                    : "–"}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Warteschlangen — kompakte Version der Queue-Seite */}
      {filteredQueues.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-heading">
            <ListOrdered className="h-4 w-4 text-primary" />
            Warteschlangen
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredQueues.map((queue) => {
              const totalAgents = queue.Agents?.length ?? 0;
              const loggedIn = queue.LoggedInAgents ?? 0;
              const activeCallCount = queue.ActiveCallCount ?? 0;
              const hasActiveCalls = activeCallCount > 0;
              const isExpanded = expandedQueues.has(queue.Id);
              const visibleAgents = isExpanded ? queue.Agents : queue.Agents?.slice(0, 4);
              const hiddenCount = totalAgents - 4;

              return (
                <GlassCard key={queue.Id} hover className="p-4">
                  {/* Header */}
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-heading">{queue.Name}</h3>
                      <p className="text-xs text-muted">Nr. {queue.Number ?? "–"}</p>
                    </div>
                    <LedIndicator status={queue.IsRegistered ? "online" : "offline"} size="sm" pulse={false} />
                  </div>

                  {/* Stats: Aktiv / Angemeldet / Gesamt */}
                  <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-lg bg-surface-subtle p-2">
                    <div className="text-center" title={`${activeCallCount} aktive Gespräche`}>
                      <div className="flex items-center justify-center gap-0.5">
                        <p className={`text-base font-bold ${hasActiveCalls ? "text-amber-400" : "text-muted"}`}>
                          {activeCallCount}
                        </p>
                        {hasActiveCalls && <Phone className="h-3 w-3 text-amber-400 animate-pulse" />}
                      </div>
                      <p className="text-xs text-muted">Aktiv</p>
                    </div>
                    <div className="text-center" title={`${loggedIn} angemeldet`}>
                      <p className="text-base font-bold text-emerald-400">{loggedIn}</p>
                      <p className="text-xs text-muted">Angemeldet</p>
                    </div>
                    <div className="text-center" title={`${totalAgents} gesamt`}>
                      <p className="text-base font-bold text-body">{totalAgents}</p>
                      <p className="text-xs text-muted">Gesamt</p>
                    </div>
                  </div>

                  {/* Auslastungsbalken */}
                  {totalAgents > 0 && (
                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between">
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
                  {totalAgents > 0 && (
                    <div>
                      <h4 className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted">
                        <Users className="h-3 w-3" />
                        Agenten
                      </h4>
                      <div className="space-y-1">
                        {(visibleAgents ?? []).map((agent) => {
                          const isLoggedIn = agent.QueueStatus === "LoggedIn";
                          const isRegistered = agent.IsRegistered ?? true;
                          const hasCall = agent.HasActiveCall;
                          const isOffline = isLoggedIn && !isRegistered;

                          const dotColor = hasCall
                            ? "bg-amber-400 animate-pulse"
                            : isOffline
                            ? "bg-red-400"
                            : isLoggedIn
                            ? "bg-emerald-400"
                            : "bg-gray-500";

                          const statusLabel = hasCall
                            ? "Gespräch"
                            : isOffline
                            ? "Offline"
                            : isLoggedIn
                            ? "Angemeldet"
                            : "Abgemeldet";

                          const statusColor = hasCall
                            ? "text-amber-400"
                            : isOffline
                            ? "text-red-400"
                            : isLoggedIn
                            ? "text-emerald-400"
                            : "text-muted";

                          const rowBg = hasCall
                            ? "bg-amber-500/10 hover:bg-amber-500/20"
                            : isOffline
                            ? "bg-red-500/10 hover:bg-red-500/20"
                            : "hover:bg-surface-muted";

                          return (
                            <div
                              key={agent.Id ?? agent.Number}
                              className={`flex items-center justify-between rounded-md px-2 py-1 transition-colors ${rowBg}`}
                              title={`${agent.Name} — ${statusLabel}`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
                                <span className="text-xs text-body">{agent.Name} ({agent.Number})</span>
                              </div>
                              <span className={`text-xs font-medium ${statusColor}`}>
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
                            {isExpanded
                              ? <><ChevronUp className="h-3 w-3" /> Weniger anzeigen</>
                              : <><ChevronDown className="h-3 w-3" /> +{hiddenCount} weitere Agenten</>
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
