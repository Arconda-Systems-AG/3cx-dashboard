"use client";

import { useEffect } from "react";
import useSWR from "swr";
import {
  X,
  History,
  PhoneCall,
  CheckCircle2,
  Target,
  Clock,
  PhoneOutgoing,
  type LucideIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

// Wiederverwendbares 3h-Verlaufs-Modal (Live-Probleme + Übersicht):
// Ringpuffer-Zeitreihen + CDR-Statistik der letzten 3 Stunden.

interface HistoryResponse {
  queue: string;
  samples: Array<{ t: string; waiting: number; free: number; loggedIn: number; longestWait: number }>;
  cdr: {
    calls: number;
    answered: number;
    withinSla: number;
    slaPct: number | null;
    avgWaitSeconds: number;
    maxWaitSeconds: number;
  } | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

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
    <div className="rounded-lg bg-surface-subtle py-1.5 text-center">
      <Icon className={`mx-auto h-3.5 w-3.5 ${alert ? alertClass : "text-muted"}`} />
      <p className={`mt-0.5 text-sm font-semibold ${alert ? alertClass : "text-heading"}`}>{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

export function QueueHistoryModal({
  number,
  name,
  onClose,
}: {
  number: string;
  name: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useSWR<HistoryResponse>(
    `/api/queues/history?queue=${encodeURIComponent(number)}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chartData = (data?.samples ?? []).map((s) => ({
    zeit: fmtTime(s.t),
    Wartend: s.waiting,
    Frei: s.free,
    Eingeloggt: s.loggedIn,
    "Längste Wartezeit": s.longestWait,
  }));

  const axis = { fontSize: 10, fill: "#94a3b8" };
  const tooltipStyle = {
    background: "rgba(10, 22, 40, 0.95)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    fontSize: 11,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-glass bg-[#0f172a] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-heading">
              <History className="h-5 w-5 text-primary" />
              {name}
            </h3>
            <p className="text-xs text-muted">Warteschlange {number} · Verlauf der letzten 3 Stunden</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-heading">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* CDR-Statistik-Zeile (letzte 3h, end-to-end) */}
        {data?.cdr && data.cdr.calls === 0 && (
          <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
            Keine Anrufe kamen in den letzten 3 Std. ZUERST in dieser Warteschlange an — vermutlich ist
            sie ein Überlauf-Ziel (z.B. &quot;… 20/40/Abwurf&quot;). Die Anruf-/SLA-Statistik wird der
            Eingangs-Warteschlange zugerechnet; der Live-Verlauf unten zeigt trotzdem, was hier real passierte.
          </p>
        )}
        {data?.cdr && (
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat icon={PhoneCall} value={data.cdr.calls} label="Anrufe 3h" />
            <Stat icon={CheckCircle2} value={data.cdr.answered} label="angenommen" />
            <Stat icon={Target} value={data.cdr.slaPct !== null ? `${data.cdr.slaPct}%` : "—"} label="in SLA" alert={data.cdr.slaPct !== null && data.cdr.slaPct < 50} alertClass="text-violet-300" />
            <Stat icon={Clock} value={fmtWait(data.cdr.avgWaitSeconds)} label="Ø Wartezeit" />
            <Stat icon={Clock} value={fmtWait(data.cdr.maxWaitSeconds)} label="max. Wartezeit" />
            <Stat icon={PhoneOutgoing} value={data.cdr.calls - data.cdr.answered} label="verpasst" alert={data.cdr.calls - data.cdr.answered > 0} />
          </div>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted">Lade Verlauf…</p>
        ) : chartData.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted">
            Noch zu wenig Verlaufsdaten — der Sammler läuft seit dem letzten Neustart und füllt sich minütlich.
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="mb-1 text-xs font-semibold text-secondary">Wartende · freie Agenten · eingeloggt</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="zeit" tick={axis} tickLine={false} minTickGap={40} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconType="plainline" />
                  <Line type="monotone" dataKey="Wartend" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Frei" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Eingeloggt" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-secondary">Längste aktuelle Wartezeit (Sekunden)</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="zeit" tick={axis} tickLine={false} minTickGap={40} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="Längste Wartezeit" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
