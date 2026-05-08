"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { GlassCard } from "@3cx-dash/ui";
import { useSettings } from "@/hooks/use-data";
import type { AiAnalysis } from "@3cx-dash/types";
import {
  Brain,
  Sparkles,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Lightbulb,
  TrendingUp,
  AlertCircle,
  Zap,
} from "lucide-react";

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useAiAnalysis() {
  return useSWR<AiAnalysis | null>("/api/ai/analyze", fetcher, {
    refreshInterval: 600_000,
  });
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function formatRelativeTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes === 1) return "vor 1 Minute";
  if (minutes < 60) return `vor ${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "vor 1 Stunde";
  return `vor ${hours} Stunden`;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return "< 1s";
  return `${s}s`;
}

// ─── Status-Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AiAnalysis["status"] }) {
  const config = {
    gut: {
      icon: CheckCircle,
      label: "GUT",
      classes: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
      dot: "bg-emerald-400",
    },
    warnung: {
      icon: AlertTriangle,
      label: "WARNUNG",
      classes: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
      dot: "bg-amber-400 animate-pulse",
    },
    kritisch: {
      icon: XCircle,
      label: "KRITISCH",
      classes: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
      dot: "bg-red-400 animate-pulse",
    },
  }[status];

  const Icon = config.icon;
  return (
    <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 ${config.classes}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
      <Icon className="h-5 w-5" />
      <span className="text-base font-bold tracking-wide">{config.label}</span>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  onAnalyze,
  loading,
}: {
  onAnalyze: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shadow-[0_0_30px_rgba(240,128,23,0.12)]">
        <Brain className="h-10 w-10 text-primary" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-heading">Noch keine Analyse vorhanden</h2>
      <p className="mb-6 text-sm text-muted max-w-md">
        Starte die erste KI-Analyse, um Erkenntnisse und Empfehlungen zu deinem Call-Center zu erhalten.
      </p>
      <button
        onClick={onAnalyze}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(240,128,23,0.25)] hover:bg-primary-hover disabled:opacity-50 transition-all"
      >
        {loading ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {loading ? "Analysiere..." : "Erste Analyse starten"}
      </button>
    </div>
  );
}

// ─── Not Configured State ─────────────────────────────────────────────────────

function NotConfiguredState() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
          <AlertCircle className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-heading">KI-API nicht konfiguriert</h3>
          <p className="text-sm text-muted">
            Bitte hinterlege API URL, API-Key und Modell unter{" "}
            <a href="/settings" className="text-primary hover:underline font-medium">
              Einstellungen &rarr; KI-Analyse
            </a>{" "}
            um die KI-Auswertung zu nutzen.
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AiPage() {
  const { data: analysis, mutate, isLoading } = useAiAnalysis();
  const { data: settings } = useSettings();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aiConfigured = !!(settings?.aiUrl);

  // Minütlicher Snapshot-Poll für Verlaufsdaten
  useEffect(() => {
    const collect = () => fetch("/api/stats/snapshot", { method: "POST" }).catch(() => {});
    collect();
    const id = setInterval(collect, 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unbekannter Fehler");
      } else {
        await mutate(data, false);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-heading">
            <Brain className="h-6 w-6 text-primary" />
            KI-Auswertung
          </h1>
          <p className="mt-1 text-sm text-muted">
            Automatische Analyse alle 10 Minuten &middot; Powered by{" "}
            {settings?.aiModel ? (
              <span className="font-medium text-secondary">{settings.aiModel}</span>
            ) : (
              "KI-Modell"
            )}
          </p>
        </div>

        {aiConfigured && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => mutate()}
              disabled={analyzing || isLoading}
              title="Neu laden"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-glass text-secondary hover:text-heading disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_0_16px_rgba(240,128,23,0.2)] hover:bg-primary-hover disabled:opacity-50 transition-all"
            >
              {analyzing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyzing ? "Analysiere..." : "Jetzt analysieren"}
            </button>
          </div>
        )}
      </div>

      {/* ── Fehler-Banner ── */}
      {error && (
        <GlassCard className="p-4">
          <div className="flex items-start gap-3 text-red-400">
            <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Analyse fehlgeschlagen</p>
              <p className="text-xs mt-0.5 text-red-300/80">{error}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Nicht konfiguriert ── */}
      {!aiConfigured && <NotConfiguredState />}

      {/* ── Leer (noch keine Analyse) ── */}
      {aiConfigured && !isLoading && !analyzing && analysis === null && (
        <EmptyState onAnalyze={handleAnalyze} loading={analyzing} />
      )}

      {/* ── Analyse-Ergebnisse ── */}
      {analysis && (
        <div className="space-y-4">
          {/* Status + Zusammenfassung */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Status-Card */}
            <GlassCard className="p-5 flex flex-col items-center justify-center gap-3 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Status</p>
              <StatusBadge status={analysis.status} />
              {analysis.dauer_ms !== undefined && (
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Clock className="h-3 w-3" />
                  Analysedauer: {formatDuration(analysis.dauer_ms)}
                </p>
              )}
              <p className="flex items-center gap-1 text-xs text-muted">
                <Clock className="h-3 w-3" />
                Letzte Analyse: {formatRelativeTime(analysis.timestamp)}
              </p>
            </GlassCard>

            {/* Zusammenfassung */}
            <GlassCard className="p-5 sm:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-heading">
                <Zap className="h-4 w-4 text-primary" />
                Zusammenfassung
              </h2>
              <p className="text-sm leading-relaxed text-body">
                {analysis.zusammenfassung || (
                  <span className="text-muted italic">Keine Zusammenfassung verfügbar.</span>
                )}
              </p>
            </GlassCard>
          </div>

          {/* Erkenntnisse + Empfehlungen */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Erkenntnisse */}
            <GlassCard className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-heading">
                <TrendingUp className="h-4 w-4 text-primary" />
                Erkenntnisse
              </h2>
              {analysis.erkenntnisse.length === 0 ? (
                <p className="text-sm text-muted italic">Keine Erkenntnisse.</p>
              ) : (
                <ul className="space-y-2.5">
                  {analysis.erkenntnisse.map((e, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-body">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      {e}
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            {/* Empfehlungen */}
            <GlassCard className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-heading">
                <Lightbulb className="h-4 w-4 text-primary" />
                Empfehlungen
              </h2>
              {analysis.empfehlungen.length === 0 ? (
                <p className="text-sm text-muted italic">Keine Empfehlungen.</p>
              ) : (
                <ol className="space-y-2.5">
                  {analysis.empfehlungen.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-body">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      {r}
                    </li>
                  ))}
                </ol>
              )}
            </GlassCard>
          </div>

          {/* Anomalien (nur wenn vorhanden) */}
          {analysis.anomalien.length > 0 && (
            <GlassCard className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-heading">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Anomalien
              </h2>
              <ul className="space-y-2">
                {analysis.anomalien.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-lg bg-amber-500/8 px-3 py-2 text-sm text-amber-200/90">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    {a}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
