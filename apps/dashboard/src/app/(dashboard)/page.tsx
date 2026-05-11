"use client";

import { useState, useCallback } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import {
  useHealth,
  useActiveCalls,
  useExtensions,
  useQueues,
  useDepartments,
  useToday,
  useHourly,
  useCustomerLogo,
  useAiAnalysis,
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
  Sparkles,
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
    // DB gibt Europe/Berlin-Zeit als timestamp without timezone zurück
    // Stunde direkt extrahieren, kein new Date() (vermeidet doppelte TZ-Konvertierung im Browser)
    const match = isoHour.match(/[T ](\d{2}):(\d{2})/);
    if (match) return `${match[1]}:${match[2]}`;
    return isoHour;
  } catch {
    return isoHour;
  }
}

const statusColors: Record<string, string> = {
  gut: "text-emerald-400",
  warnung: "text-amber-400",
  kritisch: "text-red-400",
};

export default function DashboardPage() {
  const { data: health } = useHealth();
  const { data: callsData } = useActiveCalls();
  const { data: extensionsData } = useExtensions();
  const { data: queuesData } = useQueues();
  const { data: deptData } = useDepartments();
  const { data: logoData } = useCustomerLogo();
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const { data: aiData, mutate: mutateAi } = useAiAnalysis(selectedDeptId || undefined);
  const [aiRefreshing, setAiRefreshing] = useState(false);
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

  const triggerAiAnalysis = useCallback(async () => {
    setAiRefreshing(true);
    try {
      // Global: all=true → analysiert global + alle Abteilungen aus Berichtsprofilen
      // Dept-spezifisch: nur diese Abteilung
      const body = selectedDeptId ? { departmentId: selectedDeptId } : { all: true };
      await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await mutateAi();
    } finally {
      setAiRefreshing(false);
    }
  }, [selectedDeptId, mutateAi]);

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

  // Echtzeit-Kacheln aus XAPI (kein DB-Query nötig)
  const activeQueues = selectedDept ? filteredQueues : queues;
  const queueNumberSet = new Set(activeQueues.map((q) => String(q.Number)));
  const agentNumberSet = new Set(
    activeQueues.flatMap((q) => (q.Agents ?? []).map((a) => a.Number))
  );
  // Wartende: Anrufer wo das Ziel (Callee) eine Queue-Nummer ist
  const nowWaiting = activeCalls.filter((c) =>
    queueNumberSet.has(parseDn(c.Callee ?? ""))
  ).length;
  // Gespräche: Talking-Calls wo Caller oder Callee ein Agent der gefilterten Queues ist
  const nowTalking = activeCalls.filter((c) => {
    if (c.Status !== "Talking") return false;
    const caller = parseDn(c.Caller ?? "");
    const callee = parseDn(c.Callee ?? "");
    return agentNumberSet.has(caller) || agentNumberSet.has(callee);
  }).length;

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
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-heading">Übersicht</h1>
        {logoData?.logoUrl && (
          <img src={logoData.logoUrl} alt="Kunden-Logo" className="h-8 w-auto object-contain" />
        )}
        <div className="relative ml-auto">
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="appearance-none rounded-lg border border-primary/30 bg-surface-solid px-3 py-1.5 pr-8 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/50 transition-colors cursor-pointer"
          >
            <option value="" className="bg-surface-solid text-heading">Alle Abteilungen</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)} className="bg-surface-solid text-heading">{d.name}</option>
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

      {/* ── Tages-KPIs + Echtzeit (8 Kacheln) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {/* 1 — Eingehend */}
          <TiltCard glowColor="rgba(59,130,246,0.3)" className="p-4">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-500 opacity-70" />
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <PhoneIncoming className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-blue-400">{today ? totalIncoming : "–"}</p>
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
          {(() => { const v = today?.not_in_20s ?? 0; return (
          <TiltCard glowColor={v > 0 ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.3)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${v > 0 ? "bg-red-500" : "bg-emerald-500"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${v > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
              <Clock className={`h-3.5 w-3.5 ${v > 0 ? "text-red-400" : "text-emerald-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${v > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {today ? v : "–"}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Nicht in 20 Sek.</p>
          </TiltCard>
          ); })()}

          {/* 4 — Abgebrochen */}
          {(() => { const v = today?.abandoned ?? 0; return (
          <TiltCard glowColor={v > 0 ? "rgba(249,115,22,0.3)" : "rgba(16,185,129,0.3)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${v > 0 ? "bg-orange-500" : "bg-emerald-500"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${v > 0 ? "bg-orange-500/10" : "bg-emerald-500/10"}`}>
              <PhoneMissed className={`h-3.5 w-3.5 ${v > 0 ? "text-orange-400" : "text-emerald-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${v > 0 ? "text-orange-400" : "text-emerald-400"}`}>
              {today ? v : "–"}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Abgebrochen</p>
          </TiltCard>
          ); })()}

          {/* 5 — Ø Wartezeit */}
          <TiltCard glowColor="rgba(139,92,246,0.3)" className="p-4">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500 opacity-70" />
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Timer className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-violet-400">
              {today ? formatWait(today.avg_wait_seconds) : "–"}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Ø Wartezeit</p>
          </TiltCard>

          {/* 6 — Max. Wartezeit */}
          {(() => { const secs = today?.max_wait_seconds ?? 0; return (
          <TiltCard glowColor={secs > 60 ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.3)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${secs > 60 ? "bg-red-500" : "bg-amber-500"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${secs > 60 ? "bg-red-500/10" : "bg-amber-500/10"}`}>
              <Clock className={`h-3.5 w-3.5 ${secs > 60 ? "text-red-400" : "text-amber-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${secs > 60 ? "text-red-400" : "text-amber-400"}`}>
              {today ? formatWait(secs) : "–"}
            </p>
            <p className="mt-1 text-xs font-medium text-muted truncate" title={today?.max_wait_queue || "Max. Wartezeit"}>
              {today?.max_wait_queue ? `Max. · ${today.max_wait_queue.replace(" Zentrale", "").replace(" Abwurf", "↩")}` : "Max. Wartezeit"}
            </p>
          </TiltCard>
          ); })()}

          {/* 7 — Gespräche jetzt (Echtzeit, 5s-Polling) */}
          <TiltCard glowColor={nowTalking > 0 ? "rgba(245,158,11,0.3)" : "rgba(100,116,139,0.2)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${nowTalking > 0 ? "bg-amber-500" : "bg-slate-600"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${nowTalking > 0 ? "bg-amber-500/10" : "bg-slate-500/10"}`}>
              <Phone className={`h-3.5 w-3.5 ${nowTalking > 0 ? "text-amber-400 animate-pulse" : "text-slate-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${nowTalking > 0 ? "text-amber-400" : "text-muted"}`}>
              {nowTalking}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Gespräche (WS)</p>
          </TiltCard>

          {/* 8 — Wartende Anrufe (Echtzeit, 5s-Polling) */}
          <TiltCard glowColor={nowWaiting > 0 ? "rgba(239,68,68,0.35)" : "rgba(100,116,139,0.2)"} className="p-4">
            <div className={`absolute inset-x-0 top-0 h-[2px] ${nowWaiting > 0 ? "bg-red-500" : "bg-slate-600"} opacity-70`} />
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${nowWaiting > 0 ? "bg-red-500/10" : "bg-slate-500/10"}`}>
              <PhoneIncoming className={`h-3.5 w-3.5 ${nowWaiting > 0 ? "text-red-400 animate-pulse" : "text-slate-400"}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${nowWaiting > 0 ? "text-red-400" : "text-muted"}`}>
              {nowWaiting}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Wartend (WS)</p>
          </TiltCard>
        </div>

      {/* ── Abwurf-Funnel · KI-Analyse · Stunden-Chart (3 Kacheln) ── */}
      {(today || chartData.length > 0 || aiData) && (
        <div className="grid gap-4 lg:grid-cols-[7fr_4fr_9fr]">

          {/* 1 — KI-Analyse */}
          {(() => {
            const statusCfg = {
              gut:      { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-400", label: "Gut" },
              warnung:  { bg: "bg-amber-500/15",   border: "border-amber-500/30",   text: "text-amber-400",  dot: "bg-amber-400",  label: "Warnung" },
              kritisch: { bg: "bg-red-500/15",      border: "border-red-500/30",     text: "text-red-400",    dot: "bg-red-400",    label: "Kritisch" },
            };
            const chipColors = [
              "bg-blue-500/15 text-blue-300 border-blue-500/25",
              "bg-violet-500/15 text-violet-300 border-violet-500/25",
              "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
            ];
            const deptLabel = selectedDept?.name;
            if (!aiData?.zusammenfassung) {
              return (
                <GlassCard className="flex h-full flex-col items-center justify-center gap-3 p-4">
                  <div className="flex items-center gap-2 self-start">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">KI-Analyse</span>
                    {deptLabel && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{deptLabel}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {deptLabel ? `Noch keine Analyse für ${deptLabel}.` : "Noch keine KI-Analyse vorhanden."}
                  </span>
                  <button
                    onClick={triggerAiAnalysis}
                    disabled={aiRefreshing}
                    className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    {aiRefreshing ? "Analysiere…" : "Jetzt analysieren"}
                  </button>
                </GlassCard>
              );
            }
            const cfg = statusCfg[aiData.status as keyof typeof statusCfg] ?? statusCfg.warnung;
            return (
              <GlassCard className="p-4 overflow-hidden">
                <div className="mb-2.5 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">KI-Analyse</span>
                  {deptLabel && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{deptLabel}</span>
                  )}
                  <span className={`ml-auto flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>
                {aiData.erkenntnisse && aiData.erkenntnisse.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {aiData.erkenntnisse.slice(0, 3).map((e, i) => (
                      <span key={i} className={`w-full rounded-md border px-2 py-1 text-[11px] font-medium leading-snug line-clamp-2 ${chipColors[i % chipColors.length]}`}>
                        {e}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] leading-snug text-body line-clamp-4">{aiData.zusammenfassung}</p>
                )}
              </GlassCard>
            );
          })()}

          {/* 2 — Abwurf-Funnel */}
          {today && (
            <GlassCard className="flex flex-col p-4">
              <h2 className="mb-2.5 flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <TrendingDown className="h-3.5 w-3.5 text-primary" />
                Abwurf-Funnel heute
              </h2>
              {(() => {
                const ab1 = today.abwurf1_reached;
                const ab2 = today.abwurf2_reached;
                const total = today.total_incoming || 1;
                const noOverflow = total - ab1;
                const ab1Only = ab1 - ab2;
                const bars = [
                  { label: "Erstqueue", value: noOverflow, pct: Math.round((noOverflow / total) * 100), color: "bg-emerald-500", textColor: "text-emerald-400" },
                  { label: "Abwurf 1", value: ab1Only, pct: Math.round((ab1Only / total) * 100), color: "bg-amber-500", textColor: "text-amber-400" },
                  { label: "Abwurf 2", value: ab2, pct: Math.round((ab2 / total) * 100), color: "bg-red-500", textColor: "text-red-400" },
                ];
                return (
                  <div className="flex flex-1 flex-col justify-around gap-1">
                    {bars.map((b) => (
                      <div key={b.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted">{b.label}</span>
                          <span className={`tabular-nums font-semibold ${b.textColor}`}>{b.value} <span className="font-normal text-muted">({b.pct}%)</span></span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div className={`h-full rounded-full transition-all duration-700 ${b.color}`} style={{ width: `${b.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </GlassCard>
          )}

          {/* 3 — Stunden-Chart */}
          {chartData.length > 0 && (
            <GlassCard className="flex flex-col p-4">
              <h2 className="mb-2.5 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">Anrufaufkommen heute</h2>
              <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "var(--color-muted, #64748b)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--color-muted, #64748b)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0f1f35", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "11px" }}
                    labelStyle={{ color: "#e2e8f0" }}
                    itemStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="Eingehend" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="Angenommen" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="Abgebrochen" fill="#f97316" radius={[2, 2, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
              </div>
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
              const waitingCallCount = queue.WaitingCallCount ?? 0;
              const hasActiveCalls = activeCallCount > 0;
              const hasWaiting = waitingCallCount > 0;
              // Auslastung: wie viele angemeldete Agenten telefonieren gerade
              const agentsInCall = (queue.Agents ?? []).filter((a) => a.HasActiveCall).length;
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
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-heading">{queue.Name}</h3>
                        {hasWaiting && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-500/20 text-sky-400 animate-pulse">
                            <Phone className="h-2.5 w-2.5" /> Klingelt
                          </span>
                        )}
                      </div>
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
                    <div className="mb-3 space-y-1.5">
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
                          <span className="w-20 shrink-0 text-[10px] text-muted">{label}</span>
                          <div className="relative flex-1 h-1 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: color(pct) }}
                            />
                          </div>
                          <span className="w-7 shrink-0 text-right text-[10px] font-semibold tabular-nums text-secondary">{pct}%</span>
                        </div>
                      ))}
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
                          const isRinging = hasWaiting && isLoggedIn && isRegistered && !hasCall;
                          const isOffline = isLoggedIn && !isRegistered;
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
                          const rowBg = isRinging ? "bg-sky-500/10" : hasCall ? "bg-amber-500/10" : isOffline ? "bg-red-500/10" : "hover:bg-surface-muted";

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
