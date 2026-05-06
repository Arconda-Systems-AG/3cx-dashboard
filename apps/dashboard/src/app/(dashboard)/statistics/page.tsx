"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { RefreshCw, AlertCircle, Database, Building2 } from "lucide-react";
import { GlassCard } from "@3cx-dash/ui";
import { tabLabels, tabDescriptions, type TabId } from "@/app/api/statistics/queries";
import { useQueues, useDepartments } from "@/hooks/use-data";
import { StatCard } from "./_components/StatCard";
import { DataTable } from "./_components/DataTable";
import { ChartPanel } from "./_components/Charts";

const TAB_IDS: TabId[] = [
  "overview",
  "ringGroups",
  "queues",
  "queueMissed",
  "extensions",
  "inbound",
  "outbound",
  "inboundOutbound",
];

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

interface QueryResult {
  title: string;
  type: string;
  rows: Record<string, unknown>[];
  fields: string[];
  error?: string;
}

interface TabData {
  tab: string;
  from: string;
  to: string;
  queueFilter?: string | null;
  results: Record<string, QueryResult>;
  error?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [fetchKey, setFetchKey] = useState(0);
  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");

  const { data: queuesData } = useQueues();
  const { data: deptData } = useDepartments();
  const queues = queuesData?.value ?? [];
  const departments = deptData?.groups ?? [];

  // Abteilung und Warteschlange schließen sich gegenseitig aus
  function handleQueueChange(val: string) {
    setSelectedQueue(val);
    if (val) setSelectedGroup("");
  }
  function handleGroupChange(val: string) {
    setSelectedGroup(val);
    if (val) setSelectedQueue("");
  }

  const filterParam = selectedGroup
    ? `&group=${encodeURIComponent(selectedGroup)}`
    : selectedQueue
    ? `&queue=${encodeURIComponent(selectedQueue)}`
    : "";
  const url = `/api/statistics/${activeTab}?from=${from}&to=${to}&_k=${fetchKey}${filterParam}`;
  const { data, isLoading, error } = useSWR<TabData>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const refresh = useCallback(() => setFetchKey((k) => k + 1), []);

  const results = data?.results ?? {};
  const panels = Object.values(results);
  const statPanels = panels.filter((p) => p.type === "stat");
  const gaugePanels = panels.filter((p) => p.type === "gauge");
  const chartPanels = panels.filter((p) =>
    ["barchart", "timeseries", "piechart", "bargauge"].includes(p.type)
  );
  const tablePanels = panels.filter((p) => p.type === "table");

  const hasDbError = data?.error?.includes("Keine Datenbankverbindung");

  const hasFilter = !!selectedQueue || !!selectedGroup;
  const isOverviewWithFilter = activeTab === "overview" && hasFilter;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Statistiken</h1>
          <p className="text-sm text-muted">Anrufauswertungen aus der 3CX PostgreSQL-Datenbank</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Abteilungs-Filter (Groups) */}
          <div className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-muted" />
            <label className="text-xs text-muted">Abteilung</label>
            <select
              value={selectedGroup}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="rounded-lg border border-glass bg-input px-2 py-1.5 text-xs text-body focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/40 transition-colors cursor-pointer"
              title="Nach Abteilung (Gruppe) filtern"
            >
              <option value="">Alle</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Warteschlangen-Filter */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted">Warteschlange</label>
            <select
              value={selectedQueue}
              onChange={(e) => handleQueueChange(e.target.value)}
              className="rounded-lg border border-glass bg-input px-2 py-1.5 text-xs text-body focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/40 transition-colors cursor-pointer"
              title="Nach Warteschlange filtern"
            >
              <option value="">Alle</option>
              {queues.map((q) => (
                <option key={q.Id} value={q.Number ?? String(q.Id)}>{q.Name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <label className="text-xs text-muted">Von</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-glass bg-input px-2 py-1.5 text-xs text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted">Bis</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-glass bg-input px-2 py-1.5 text-xs text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Laden
          </button>
        </div>
      </div>

      {/* Tab-Navigation */}
      <GlassCard className="p-1">
        <div className="flex flex-wrap gap-0.5">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeTab === id
                  ? "bg-primary/15 text-primary"
                  : "text-secondary hover:bg-surface-muted hover:text-heading"
              }`}
              title={tabDescriptions[id]}
            >
              {tabLabels[id]}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Hinweis: Übersicht ignoriert Abteilungsfilter (kein SQL-Filter für Tab 01) */}
      {isOverviewWithFilter && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
          <Building2 className="h-5 w-5 flex-shrink-0 text-blue-400" />
          <p className="text-sm text-blue-400">
            Die Übersicht zeigt immer globale Werte — der Abteilungsfilter greift ab Tab{" "}
            <strong>02 Rufgruppen</strong>.
          </p>
        </div>
      )}

      {/* Keine DB-Konfiguration */}
      {hasDbError && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Database className="h-5 w-5 flex-shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-400">Keine Datenbankverbindung konfiguriert</p>
            <p className="text-xs text-amber-400/70">
              Bitte PostgreSQL-Datenbankquelle unter{" "}
              <a href="/settings" className="underline">
                Einstellungen
              </a>{" "}
              eintragen.
            </p>
          </div>
        </div>
      )}

      {/* API / Netzwerk-Fehler */}
      {error && !hasDbError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
          <p className="text-sm text-red-400">Fehler beim Laden der Daten: {String(error)}</p>
        </div>
      )}

      {/* Lade-Skeleton */}
      {isLoading && panels.length === 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-subtle" />
          ))}
        </div>
      )}

      {/* Stat-Karten */}
      {statPanels.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statPanels.map((p) => {
            const firstRow = p.rows?.[0];
            const firstVal = firstRow ? Object.values(firstRow)[0] : null;
            return (
              <StatCard
                key={p.title}
                title={p.title}
                value={firstVal as string | number | null}
              />
            );
          })}
        </div>
      )}

      {/* Gauge-Panels */}
      {gaugePanels.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {gaugePanels.map((p) => (
            <ChartPanel
              key={p.title}
              title={p.title}
              rows={p.rows}
              fields={p.fields}
              type="gauge"
            />
          ))}
        </div>
      )}

      {/* Charts (Balken, Zeitreihe, Kreisdiagramm) */}
      {chartPanels.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {chartPanels.map((p) => (
            <ChartPanel
              key={p.title}
              title={p.title}
              rows={p.rows}
              fields={p.fields}
              type={p.type as "barchart" | "timeseries" | "piechart" | "bargauge"}
            />
          ))}
        </div>
      )}

      {/* Tabellen */}
      {tablePanels.length > 0 && (
        <div className="space-y-4">
          {tablePanels.map((p) => (
            <DataTable
              key={p.title}
              title={p.title}
              rows={p.rows}
              fields={p.fields}
            />
          ))}
        </div>
      )}

      {/* Panel-Fehler */}
      {panels.some((p) => p.error) && (
        <div className="space-y-2">
          {panels
            .filter((p) => p.error)
            .map((p) => (
              <div
                key={p.title}
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400"
              >
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>{p.title}:</strong> {p.error}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Leerer Zustand */}
      {!isLoading && !error && !hasDbError && panels.length > 0 && panels.every((p) => p.rows?.length === 0) && (
        <div className="rounded-xl border border-glass bg-surface-subtle p-8 text-center">
          <p className="text-sm text-muted">
            Keine Daten im gewählten Zeitraum ({from} – {to})
            {hasFilter && ` für den gewählten Filter`}
          </p>
        </div>
      )}
    </div>
  );
}
