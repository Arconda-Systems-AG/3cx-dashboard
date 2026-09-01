"use client";

import { useLiveProblems, type LiveProblemQueue } from "@/hooks/use-data";
import { AlertTriangle, CheckCircle2, Clock, Users, PhoneCall, TrendingDown, type LucideIcon } from "lucide-react";

function fmtWait(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")} min`;
}

function Stat({ icon: Icon, value, label, alert }: { icon: LucideIcon; value: string | number; label: string; alert?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-subtle py-1.5">
      <Icon className={`mx-auto h-3.5 w-3.5 ${alert ? "text-red-400" : "text-muted"}`} />
      <p className={`mt-0.5 text-sm font-semibold ${alert ? "text-red-400" : "text-body"}`}>{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

function ProblemCard({ q }: { q: LiveProblemQueue }) {
  // Akut (Echtzeit) = rot; reines SLA-Tagesproblem = orange
  const tone = q.acute
    ? { border: "border-red-500/40", bg: "bg-red-500/5", icon: "text-red-400", text: "text-red-300", dot: "bg-red-400" }
    : { border: "border-amber-500/40", bg: "bg-amber-500/5", icon: "text-amber-400", text: "text-amber-300", dot: "bg-amber-400" };

  return (
    <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-heading">{q.name}</p>
          <p className="text-xs text-muted">
            Warteschlange {q.number} · {q.acute ? "akut" : "SLA heute"}
          </p>
        </div>
        <AlertTriangle className={`h-5 w-5 shrink-0 ${tone.icon}`} />
      </div>

      <ul className="mb-3 space-y-1">
        {q.problems.map((p, i) => (
          <li key={i} className={`flex items-start gap-2 text-sm ${tone.text}`}>
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            {p}
          </li>
        ))}
      </ul>

      {/* Rot (akut) = Live-Kennzahlen · Orange (SLA) = Tageszahlen */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {q.acute ? (
          <>
            <Stat icon={PhoneCall} value={q.waiting} label="wartend" />
            <Stat icon={Clock} value={fmtWait(q.longestWaitSeconds)} label="längste" />
            <Stat icon={Users} value={`${q.loggedInAgents}/${q.totalAgents}`} label="Agenten" alert={q.loggedInAgents === 0} />
            <Stat icon={TrendingDown} value={q.slaTodayPct !== null ? `${q.slaTodayPct}%` : "—"} label="SLA heute" />
          </>
        ) : (
          <>
            <Stat icon={PhoneCall} value={q.slaTodayCalls ?? "—"} label="Anrufe" />
            <Stat icon={CheckCircle2} value={q.slaTodayWithin ?? "—"} label={`≤${q.waitLimit}s`} />
            <Stat icon={Clock} value={q.slaTodayOver ?? "—"} label={`>${q.waitLimit}s`} alert={(q.slaTodayOver ?? 0) > 0} />
            <Stat icon={Users} value={`${q.loggedInAgents}/${q.totalAgents}`} label="Agenten" alert={q.loggedInAgents === 0} />
          </>
        )}
      </div>
    </div>
  );
}

export default function LiveProblemsPage() {
  const { data, error, isLoading } = useLiveProblems();

  const problems = data?.queues ?? [];
  const acute = problems.filter((q) => q.acute);
  const slaOnly = problems.filter((q) => !q.acute);
  const allClear = !error && !data?.error && problems.length === 0 && !isLoading;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-heading">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            Live-Probleme
          </h1>
          <p className="text-sm text-muted">
            <span className="text-red-400">rot = akut jetzt</span> ·{" "}
            <span className="text-amber-400">orange = SLA heute</span> · aktualisiert alle 5&nbsp;s
          </p>
        </div>
        {data && (
          <div className="text-right text-xs text-muted">
            <p>
              <span className={acute.length ? "font-semibold text-red-400" : "text-emerald-400"}>{acute.length} akut</span>
              {" · "}
              <span className={slaOnly.length ? "font-semibold text-amber-400" : "text-muted"}>{slaOnly.length} SLA</span>
              {" · "}von {data.totalQueues}
            </p>
            <p>&gt;{data.thresholds.maxWaiting} wartend · &gt;{data.thresholds.waitSeconds}s · SLA &lt;{data.thresholds.slaTargetPct}% (ab {data.thresholds.slaMinCalls} Anrufe)</p>
          </div>
        )}
      </div>

      {(error || data?.error) && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Fehler beim Laden: {String(error ?? data?.error)}
        </div>
      )}

      {allClear && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 py-20">
          <CheckCircle2 className="h-16 w-16 text-emerald-400" />
          <p className="text-xl font-semibold text-heading">Alles ruhig</p>
          <p className="text-sm text-muted">Keine Warteschlange über den Schwellwerten.</p>
        </div>
      )}

      {acute.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-red-400">🔴 Akut jetzt ({acute.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {acute.map((q) => <ProblemCard key={q.number} q={q} />)}
          </div>
        </div>
      )}

      {slaOnly.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-amber-400">🟠 SLA-Sorgenkinder heute ({slaOnly.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {slaOnly.map((q) => <ProblemCard key={q.number} q={q} />)}
          </div>
        </div>
      )}

      {isLoading && !data && (
        <div className="py-20 text-center text-sm text-muted">Lade Live-Daten…</div>
      )}
    </div>
  );
}
