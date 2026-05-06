"use client";

import { useState } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import {
  useHealth,
  useActiveCalls,
  useExtensions,
  useQueues,
  useDepartments,
  useToday,
  useHourly,
} from "@/hooks/use-data";
import {
  Phone,
  Users,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  Clock,
  PhoneIncoming,
  PhoneMissed,
  CheckCircle2,
  Timer,
  TrendingDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TiltCard } from "@/components/tilt-card";

function parseDn(field: string): string {
  return (field ?? "").split(" ")[0];
}

function formatWait(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} min` : `${s}s`;
}

function formatHour(isoHour: string): string {
  try {
    return new Date(isoHour).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoHour;
  }
}

export default function DashboardPage() {
  const { data: health } = useHealth();
  const { data: callsData } = useActiveCalls();
  const { data: extensionsData } = useExtensions();
  const { data: queuesData } = useQueues();
  const { data: deptData } = useDepartments();
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [expandedQueues, setExpandedQueues] = useState<Set<number>>(new Set());

  const activeCalls = callsData?.value ?? [];
  const extensions = extensionsData?.value ?? [];
  const queues = queuesData?.value ?? [];
  const departments = deptData?.groups ?? [];

  const selectedDept = selectedDeptId
    ? departments.find((d) => String(d.id) === selectedDeptId) ?? null
    : null;
  const memberNumbers = new Set<string>(selectedDept?.memberNumbers ?? []);

  const filteredQueueNumbers = selectedDept
    ? queues
        .filter((q) => (q.Agents ?? []).some((a) => memberNumbers.has(a.Number)))
        .map((q) => String(q.Number))
    : [];

  const { data: todayData } = useToday(filteredQueueNumbers.length > 0 ? filteredQueueNumbers : undefined);
  const { data: hourlyData } = useHourly(undefined, undefined, filteredQueueNumbers.length > 0 ? filteredQueueNumbers : undefined);

  function toggleExpand(id: number) {
    setExpandedQueues((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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

  const onlineCount = (selectedDept
    ? extensions.filter((e) => memberNumbers.has(e.Number))
    : extensions
  ).filter((e) => e.IsRegistered).length;

  // Tages-Stats
  const today = todayData;
  const answered = today?.answered ?? 0;
  const totalIncoming = today?.total_incoming ?? 0;
  const answerRate = totalIncoming > 0 ? Math.round((answered / totalIncoming) * 100) : null;

  // Stunden-Chart
  const chartData = (hourlyData?.buckets ?? []).map((b) => ({
    hour: formatHour(b.hour),
    Eingehend: b.total,
    Angenommen: b.answered,
    Abgebrochen: b.abandoned,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* ── Tages-KPIs (6 Kacheln) ── */}
      {today && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {/* 1 — Eingehend */}
          <TiltCard glowColor="rgba(59,130,246,0.3)" className="p-4">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-500 opacity-70" />
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <PhoneIncoming className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-blue-400">{totalIncoming}</p>
            <p className="mt-1 text-xs font-medium text-muted">Eingehend heute</p>
          </TiltCard>

          {/* 2 — Angenommen % */}
          <TiltCard glowColor={answerRate !== null && answerRate >= 80 ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${answerRate !== null && answerRate >= 80 ? "bg-emerald-500" : "bg-amber-500"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${answerRate !== null && answerRate >= 80 ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
              <CheckCircle2 className={`h-3.5 w-3.5 ${answerRate !== null && answerRate >= 80 ? "text-emerald-400" : "text-amber-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${answerRate !== null && answerRate >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
              {answerRate !== null ? `${answerRate}%` : "–"}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Angenommen</p>
          </TiltCard>

          {/* 3 — Nicht in 20s */}
          <TiltCard glowColor={today.not_in_20s > 0 ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.3)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${today.not_in_20s > 0 ? "bg-red-500" : "bg-emerald-500"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${today.not_in_20s > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
              <Clock className={`h-3.5 w-3.5 ${today.not_in_20s > 0 ? "text-red-400" : "text-emerald-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${today.not_in_20s > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {today.not_in_20s}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Nicht in 20 Sek.</p>
          </TiltCard>

          {/* 4 — Abgebrochen */}
          <TiltCard glowColor={today.abandoned > 0 ? "rgba(249,115,22,0.3)" : "rgba(16,185,129,0.3)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${today.abandoned > 0 ? "bg-orange-500" : "bg-emerald-500"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${today.abandoned > 0 ? "bg-orange-500/10" : "bg-emerald-500/10"}`}>
              <PhoneMissed className={`h-3.5 w-3.5 ${today.abandoned > 0 ? "text-orange-400" : "text-emerald-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${today.abandoned > 0 ? "text-orange-400" : "text-emerald-400"}`}>
              {today.abandoned}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Abgebrochen</p>
          </TiltCard>

          {/* 5 — Ø Wartezeit */}
          <TiltCard glowColor="rgba(139,92,246,0.3)" className="p-4">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500 opacity-70" />
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Timer className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-violet-400">
              {formatWait(today.avg_wait_seconds)}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Ø Wartezeit</p>
          </TiltCard>

          {/* 6 — Max. Wartezeit */}
          <TiltCard glowColor={today.max_wait_seconds > 60 ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.3)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${today.max_wait_seconds > 60 ? "bg-red-500" : "bg-amber-500"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${today.max_wait_seconds > 60 ? "bg-red-500/10" : "bg-amber-500/10"}`}>
              <Clock className={`h-3.5 w-3.5 ${today.max_wait_seconds > 60 ? "text-red-400" : "text-amber-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${today.max_wait_seconds > 60 ? "text-red-400" : "text-amber-400"}`}>
              {formatWait(today.max_wait_seconds)}
            </p>
            <p className="mt-1 text-xs font-medium text-muted truncate" title={today.max_wait_queue || "Max. Wartezeit"}>
              {today.max_wait_queue ? `Max. · ${today.max_wait_queue.replace(" Zentrale", "").replace(" Abwurf", "↩")}` : "Max. Wartezeit"}
            </p>
          </TiltCard>
        </div>
      )}

      {/* ── Abwurf-Funnel + Stunden-Chart ── */}
      {(today || chartData.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Abwurf-Funnel */}
          {today && (
            <GlassCard className="p-5 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-heading">
                <TrendingDown className="h-4 w-4 text-primary" />
                Abwurf-Funnel heute
              </h2>
              {(() => {
                const direct = today.answered;
                const ab1 = today.abwurf1_reached;
                const ab2 = today.abwurf2_reached;
                const total = today.total_incoming || 1;
                const bars = [
                  { label: "Direkt angenommen", value: direct, pct: Math.round((direct / total) * 100), color: "bg-emerald-500", textColor: "text-emerald-400" },
                  { label: "Abwurf 1 erreicht", value: ab1, pct: Math.round((ab1 / total) * 100), color: "bg-amber-500", textColor: "text-amber-400" },
                  { label: "Abwurf 2 erreicht", value: ab2, pct: Math.round((ab2 / total) * 100), color: "bg-red-500", textColor: "text-red-400" },
                ];
                return (
                  <div className="space-y-4">
                    {bars.map((b) => (
                      <div key={b.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted">{b.label}</span>
                          <span className={`font-semibold tabular-nums ${b.textColor}`}>{b.value} <span className="text-muted font-normal">({b.pct}%)</span></span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${b.color}`}
                            style={{ width: `${b.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </GlassCard>
          )}

          {/* Stunden-Chart */}
          {chartData.length > 0 && (
            <GlassCard className="p-5 lg:col-span-3">
              <h2 className="mb-4 text-sm font-semibold text-heading">Anrufaufkommen heute (stündlich)</h2>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "var(--color-muted, #64748b)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-muted, #64748b)" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0f1f35", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "#e2e8f0" }}
                    itemStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="Eingehend" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Angenommen" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Abgebrochen" fill="#f97316" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          )}
        </div>
      )}

      {/* ── Warteschlangen (kompakt) ── */}
      {filteredQueues.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-heading">
            <ListOrdered className="h-4 w-4 text-primary" />
            Warteschlangen
            <span className="ml-auto text-xs text-muted font-normal">{onlineCount} Nebenstellen online</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredQueues.map((queue) => {
              const totalAgents = queue.Agents?.length ?? 0;
              const loggedIn = queue.LoggedInAgents ?? 0;
              const activeCallCount = queue.ActiveCallCount ?? 0;
              const hasActiveCalls = activeCallCount > 0;
              const isExpanded = expandedQueues.has(queue.Id);
              const visibleAgents = isExpanded ? queue.Agents : queue.Agents?.slice(0, 4);
              const hiddenCount = totalAgents - 4;

              const profileBadge: Record<string, { label: string; cls: string }> = {
                "DND": { label: "DND", cls: "bg-red-500/20 text-red-400" },
                "Away": { label: "Abwesend", cls: "bg-orange-500/20 text-orange-400" },
                "Lunch": { label: "Pause", cls: "bg-yellow-500/20 text-yellow-400" },
                "Business Trip": { label: "Dienstreise", cls: "bg-purple-500/20 text-purple-400" },
              };

              return (
                <TiltCard key={queue.Id} maxTilt={6} glowColor={hasActiveCalls ? "rgba(245,158,11,0.25)" : "rgba(240,128,23,0.15)"} className="p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-heading">{queue.Name}</h3>
                      <p className="text-xs text-muted">Nr. {queue.Number ?? "–"}</p>
                    </div>
                    <LedIndicator status={queue.IsRegistered ? "online" : "offline"} size="sm" pulse={false} />
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-lg bg-surface-subtle p-2">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <p className={`text-base font-bold ${hasActiveCalls ? "text-amber-400" : "text-muted"}`}>
                          {activeCallCount}
                        </p>
                        {hasActiveCalls && <Phone className="h-3 w-3 text-amber-400 animate-pulse" />}
                      </div>
                      <p className="text-xs text-muted">Aktiv</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-emerald-400">{loggedIn}</p>
                      <p className="text-xs text-muted">Angemeldet</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-body">{totalAgents}</p>
                      <p className="text-xs text-muted">Gesamt</p>
                    </div>
                  </div>

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
                            background: loggedIn === 0 ? "#475569" : "linear-gradient(90deg, #10b981, #34d399)",
                          }}
                        />
                      </div>
                    </div>
                  )}

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
                          const profile = agent.CurrentProfile ?? "Available";
                          const badge = profile !== "Available" ? (profileBadge[profile] ?? { label: profile, cls: "bg-gray-500/20 text-gray-400" }) : null;

                          const dotColor = hasCall
                            ? "bg-amber-400 animate-pulse"
                            : isOffline
                            ? "bg-red-400"
                            : isLoggedIn
                            ? "bg-emerald-400"
                            : "bg-gray-500";

                          const statusLabel = hasCall ? "Gespräch" : isOffline ? "Offline" : isLoggedIn ? "Angemeldet" : "Abgemeldet";
                          const statusColor = hasCall ? "text-amber-400" : isOffline ? "text-red-400" : isLoggedIn ? "text-emerald-400" : "text-muted";
                          const rowBg = hasCall ? "bg-amber-500/10" : isOffline ? "bg-red-500/10" : "hover:bg-surface-muted";

                          return (
                            <div
                              key={agent.Id ?? agent.Number}
                              className={`flex items-center justify-between rounded-md px-2 py-1 transition-colors ${rowBg}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
                                <span className="text-xs text-body truncate">{agent.Name} ({agent.Number})</span>
                                {badge && (
                                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${badge.cls}`}>
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
                            {isExpanded
                              ? <><ChevronUp className="h-3 w-3" /> Weniger anzeigen</>
                              : <><ChevronDown className="h-3 w-3" /> +{hiddenCount} weitere Agenten</>
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </TiltCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
