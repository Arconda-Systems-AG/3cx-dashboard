"use client";

import { useLiveProblems, type LiveProblemQueue } from "@/hooks/use-data";
import { AlertTriangle, CheckCircle2, Clock, Users, PhoneCall, TrendingDown } from "lucide-react";

function fmtWait(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")} min`;
}

function ProblemCard({ q }: { q: LiveProblemQueue }) {
  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-heading">{q.name}</p>
          <p className="text-xs text-muted">Warteschlange {q.number}</p>
        </div>
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
      </div>

      {/* Konkrete Probleme */}
      <ul className="mb-3 space-y-1">
        {q.problems.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-red-300">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
            {p}
          </li>
        ))}
      </ul>

      {/* Kennzahlen */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-surface-subtle py-1.5">
          <PhoneCall className="mx-auto h-3.5 w-3.5 text-muted" />
          <p className="mt-0.5 text-sm font-semibold text-body">{q.waiting}</p>
          <p className="text-[10px] text-muted">wartend</p>
        </div>
        <div className="rounded-lg bg-surface-subtle py-1.5">
          <Clock className="mx-auto h-3.5 w-3.5 text-muted" />
          <p className="mt-0.5 text-sm font-semibold text-body">{fmtWait(q.longestWaitSeconds)}</p>
          <p className="text-[10px] text-muted">längste</p>
        </div>
        <div className="rounded-lg bg-surface-subtle py-1.5">
          <Users className={`mx-auto h-3.5 w-3.5 ${q.loggedInAgents === 0 ? "text-red-400" : "text-muted"}`} />
          <p className={`mt-0.5 text-sm font-semibold ${q.loggedInAgents === 0 ? "text-red-400" : "text-body"}`}>
            {q.loggedInAgents}/{q.totalAgents}
          </p>
          <p className="text-[10px] text-muted">Agenten</p>
        </div>
        <div className="rounded-lg bg-surface-subtle py-1.5">
          <TrendingDown className="mx-auto h-3.5 w-3.5 text-muted" />
          <p className="mt-0.5 text-sm font-semibold text-body">
            {q.slaTodayPct !== null ? `${q.slaTodayPct}%` : "—"}
          </p>
          <p className="text-[10px] text-muted">SLA heute</p>
        </div>
      </div>
    </div>
  );
}

export default function LiveProblemsPage() {
  const { data, error, isLoading } = useLiveProblems();

  const problems = data?.queues ?? [];
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
            Nur Warteschlangen mit akuten Problemen — aktualisiert alle 5&nbsp;s
          </p>
        </div>
        {data && (
          <div className="text-right text-xs text-muted">
            <p>
              <span className={problems.length ? "font-semibold text-red-400" : "text-emerald-400"}>
                {problems.length}
              </span>{" "}
              von {data.totalQueues} betroffen
            </p>
            <p>Schwellen: &gt;{data.thresholds.maxWaiting} wartend · &gt;{data.thresholds.waitSeconds}s · SLA &lt;{data.thresholds.slaTargetPct}%</p>
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

      {problems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {problems.map((q) => (
            <ProblemCard key={q.number} q={q} />
          ))}
        </div>
      )}

      {isLoading && !data && (
        <div className="py-20 text-center text-sm text-muted">Lade Live-Daten…</div>
      )}
    </div>
  );
}
