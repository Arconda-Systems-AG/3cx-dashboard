"use client";

import { useState } from "react";
import { useLiveProblems, type LiveProblemQueue } from "@/hooks/use-data";
import { QueueHistoryModal } from "@/components/queue-history-modal";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  PhoneCall,
  PhoneOutgoing,
  Gauge,
  Target,
  type LucideIcon,
} from "lucide-react";

function fmtWait(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")} min`;
}

function Stat({
  icon: Icon,
  value,
  label,
  alert,
  alertClass = "text-red-400",
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  alert?: boolean;
  alertClass?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-subtle py-1.5">
      <Icon className={`mx-auto h-3.5 w-3.5 ${alert ? alertClass : "text-muted"}`} />
      <p className={`mt-0.5 text-sm font-semibold ${alert ? alertClass : "text-heading"}`}>{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

type Variant = "acute" | "limit" | "sla";

/**
 * Farb-/Marker-System (farbenblind-tauglich, 3 unabhängige Kanäle):
 *   Akut     = Rot,     AlertTriangle, 2px solid   (lauteste Karte)
 *   Am Limit = Amber,   Gauge,         1px solid   (Vorwarnung)
 *   SLA      = Violett, Target,        1px dashed  (ruhige Tagesbilanz)
 * Violett (kühl) trennt auf der Blau-Gelb-Achse — funktioniert auch bei
 * Rot-Grün-Sehschwäche; Icon + Rahmenstil trennen sogar in Graustufen.
 */
function ProblemCard({ q, variant, onClick }: { q: LiveProblemQueue; variant: Variant; onClick?: () => void }) {
  const frame =
    variant === "acute"
      ? "border-2 border-red-500/60 bg-red-500/10"
      : variant === "limit"
        ? "border border-amber-400/50 bg-amber-400/5"
        : "border border-dashed border-violet-500/50 bg-violet-500/5";

  const HeaderIcon = variant === "acute" ? AlertTriangle : variant === "limit" ? Gauge : Target;
  const headerIconColor =
    variant === "acute" ? "text-red-400" : variant === "limit" ? "text-amber-300" : "text-violet-400";

  const subtitle =
    variant === "acute"
      ? "akut"
      : variant === "limit"
        ? "am Limit"
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
    <div
      className={`rounded-2xl ${frame} p-4 ${onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5" : ""}`}
      onClick={onClick}
      title="Klick: Verlauf der letzten 3 Stunden"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-heading">{q.name}</p>
          <p className="text-xs text-muted">Warteschlange {q.number} · {subtitle}</p>
        </div>
        <HeaderIcon className={`h-5 w-5 shrink-0 ${headerIconColor} ${variant === "acute" ? "animate-pulse" : ""}`} />
      </div>

      <ul className="mb-3 space-y-1">
        {q.acute && q.acuteProblems.map((p, i) => (
          <li key={`a${i}`} className="flex items-start gap-2 text-sm text-red-200">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />{p}
          </li>
        ))}
        {q.atLimit && q.atLimitText && (
          <li className="flex items-start gap-2 text-sm text-amber-200">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{q.atLimitText}
          </li>
        )}
        {variant === "sla" && q.slaProblemText && (
          <li className="flex items-start gap-2 text-sm text-violet-200">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />{q.slaProblemText}
          </li>
        )}
      </ul>

      <div className="grid grid-cols-4 gap-2 text-center">
        {variant === "sla" ? (
          <>
            <Stat icon={PhoneCall} value={q.slaTodayCalls ?? "—"} label="Anrufe" />
            <Stat icon={CheckCircle2} value={q.slaTodayWithin ?? "—"} label="in SLA" />
            <Stat icon={Clock} value={q.slaTodayOver ?? "—"} label="verfehlt" alert={(q.slaTodayOver ?? 0) > 0} alertClass="text-violet-300" />
            <Stat icon={Users} value={`${q.freeAgents} frei`} label={`${q.loggedInAgents} eingel.`} alert={q.freeAgents === 0} />
          </>
        ) : variant === "limit" ? (
          /* Am Limit: wartend/längste sind hier per Definition 0 — stattdessen Kapazität + Tageskontext */
          <>
            <Stat icon={PhoneOutgoing} value={q.active} label="aktiv" />
            <Stat icon={Users} value={`${q.loggedInAgents}/${q.totalAgents}`} label="eingel./ges." alert alertClass="text-amber-300" />
            <Stat icon={PhoneCall} value={q.slaTodayCalls ?? "—"} label="Anrufe heute" />
            <Stat icon={Target} value={q.slaTodayPct !== null ? `${q.slaTodayPct}%` : "—"} label="SLA heute" />
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
  const [historyQueue, setHistoryQueue] = useState<LiveProblemQueue | null>(null);

  const all = data?.queues ?? [];
  // Akut- und Limit-Sektion zeigen ALLE betroffenen Queues (auch SLA-Sorgenkinder —
  // die erscheinen dann doppelt: oben als akute/Limit-Karte, unten stabil in der SLA-Liste).
  const acuteCards = all.filter((q) => q.acute);
  const limitCards = all.filter((q) => q.atLimit && !q.acute);
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
            <span className="text-amber-300">gelb = am Limit</span> ·{" "}
            <span className="text-violet-300">violett = SLA heute</span> · alle 5&nbsp;s
          </p>
        </div>
        {data && (
          <div className="text-right text-xs text-muted">
            <p>
              <span className={acuteCards.length ? "font-semibold text-red-400" : "text-emerald-400"}>{acuteCards.length} akut</span>
              {" · "}
              <span className={limitCards.length ? "font-semibold text-amber-300" : "text-muted"}>{limitCards.length} Limit</span>
              {" · "}
              <span className={slaCards.length ? "font-semibold text-violet-300" : "text-muted"}>{slaCards.length} SLA</span>
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
            {acuteCards.map((q) => <ProblemCard key={q.number} q={q} variant="acute" onClick={() => setHistoryQueue(q)} />)}
          </div>
        </div>
      )}

      {limitCards.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-amber-300">🟡 Am Limit ({limitCards.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {limitCards.map((q) => <ProblemCard key={q.number} q={q} variant="limit" onClick={() => setHistoryQueue(q)} />)}
          </div>
        </div>
      )}

      {slaCards.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-violet-300">🟣 SLA-Sorgenkinder heute ({slaCards.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {slaCards.map((q) => <ProblemCard key={q.number} q={q} variant="sla" onClick={() => setHistoryQueue(q)} />)}
          </div>
        </div>
      )}

      {isLoading && !data && (
        <div className="py-20 text-center text-sm text-muted">Lade Live-Daten…</div>
      )}

      {historyQueue && (
        <QueueHistoryModal number={historyQueue.number} name={historyQueue.name} onClose={() => setHistoryQueue(null)} />
      )}
    </div>
  );
}
