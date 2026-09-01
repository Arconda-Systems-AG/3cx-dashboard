"use client";

import { useLiveProblems, type LiveProblemQueue } from "@/hooks/use-data";
import { AlertTriangle, CheckCircle2, Clock, Users, PhoneCall, PhoneOutgoing, type LucideIcon } from "lucide-react";

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

type Variant = "acute" | "limit" | "sla";

function ProblemCard({ q, variant }: { q: LiveProblemQueue; variant: Variant }) {
  // Rahmenfarbe: rot=akut, gelb=am Limit, orange=SLA. SLA-Karte wird rot bzw. gelb markiert, wenn zusätzlich akut/am Limit.
  const frame =
    variant === "acute" || (variant === "sla" && q.acute)
      ? "border-red-500/40 bg-red-500/5"
      : variant === "limit" || (variant === "sla" && q.atLimit)
        ? "border-yellow-500/40 bg-yellow-500/5"
        : "border-amber-500/40 bg-amber-500/5";
  const iconColor =
    variant === "acute" || (variant === "sla" && q.acute) ? "text-red-400"
      : variant === "limit" || (variant === "sla" && q.atLimit) ? "text-yellow-400"
        : "text-amber-400";
  const subtitle =
    variant === "acute" ? "akut"
      : variant === "limit" ? "am Limit"
        : `SLA heute${q.acute ? " · 🔴 jetzt akut" : q.atLimit ? " · 🟡 am Limit" : ""}`;

  const liveStats = (
    <>
      <Stat icon={PhoneCall} value={q.waiting} label="wartend" alert={q.waiting > 0} />
      <Stat icon={Clock} value={fmtWait(q.longestWaitSeconds)} label="längste" />
      <Stat icon={PhoneOutgoing} value={q.active} label="aktiv" />
      <Stat icon={Users} value={`${q.freeAgents} frei`} label={`${q.loggedInAgents} eingel.`} alert={q.freeAgents === 0} />
    </>
  );

  return (
    <div className={`rounded-2xl border ${frame} p-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-heading">{q.name}</p>
          <p className="text-xs text-muted">Warteschlange {q.number} · {subtitle}</p>
        </div>
        <AlertTriangle className={`h-5 w-5 shrink-0 ${iconColor}`} />
      </div>

      <ul className="mb-3 space-y-1">
        {q.acute && q.acuteProblems.map((p, i) => (
          <li key={`a${i}`} className="flex items-start gap-2 text-sm text-red-300">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />{p}
          </li>
        ))}
        {q.atLimit && q.atLimitText && (
          <li className="flex items-start gap-2 text-sm text-yellow-300">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />{q.atLimitText}
          </li>
        )}
        {variant === "sla" && q.slaProblemText && (
          <li className="flex items-start gap-2 text-sm text-amber-300">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{q.slaProblemText}
          </li>
        )}
      </ul>

      <div className="grid grid-cols-4 gap-2 text-center">
        {variant === "sla" ? (
          <>
            <Stat icon={PhoneCall} value={q.slaTodayCalls ?? "—"} label="Anrufe" />
            <Stat icon={CheckCircle2} value={q.slaTodayWithin ?? "—"} label={`≤${q.waitLimit}s`} />
            <Stat icon={Clock} value={q.slaTodayOver ?? "—"} label={`>${q.waitLimit}s`} alert={(q.slaTodayOver ?? 0) > 0} />
            <Stat icon={Users} value={`${q.freeAgents} frei`} label={`${q.loggedInAgents} eingel.`} alert={q.freeAgents === 0} />
          </>
        ) : (
          liveStats
        )}
      </div>
    </div>
  );
}

export default function LiveProblemsPage() {
  const { data, error, isLoading } = useLiveProblems();

  const all = data?.queues ?? [];
  const acuteCards = all.filter((q) => q.acute && !q.isSlaProblem);
  const limitCards = all.filter((q) => q.atLimit && !q.acute && !q.isSlaProblem);
  const slaCards = all.filter((q) => q.isSlaProblem);
  const allClear = !error && !data?.error && all.length === 0 && !isLoading;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-heading">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            Live-Probleme
          </h1>
          <p className="text-sm text-muted">
            <span className="text-red-400">rot = akut</span> ·{" "}
            <span className="text-yellow-400">gelb = am Limit</span> ·{" "}
            <span className="text-amber-400">orange = SLA heute</span> · alle 5&nbsp;s
          </p>
        </div>
        {data && (
          <div className="text-right text-xs text-muted">
            <p>
              <span className={acuteCards.length ? "font-semibold text-red-400" : "text-emerald-400"}>{acuteCards.length} akut</span>
              {" · "}
              <span className={limitCards.length ? "font-semibold text-yellow-400" : "text-muted"}>{limitCards.length} Limit</span>
              {" · "}
              <span className={slaCards.length ? "font-semibold text-amber-400" : "text-muted"}>{slaCards.length} SLA</span>
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

      {acuteCards.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-red-400">🔴 Akut jetzt ({acuteCards.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {acuteCards.map((q) => <ProblemCard key={q.number} q={q} variant="acute" />)}
          </div>
        </div>
      )}

      {limitCards.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-yellow-400">🟡 Am Limit ({limitCards.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {limitCards.map((q) => <ProblemCard key={q.number} q={q} variant="limit" />)}
          </div>
        </div>
      )}

      {slaCards.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-amber-400">🟠 SLA-Sorgenkinder heute ({slaCards.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {slaCards.map((q) => <ProblemCard key={q.number} q={q} variant="sla" />)}
          </div>
        </div>
      )}

      {isLoading && !data && (
        <div className="py-20 text-center text-sm text-muted">Lade Live-Daten…</div>
      )}
    </div>
  );
}
