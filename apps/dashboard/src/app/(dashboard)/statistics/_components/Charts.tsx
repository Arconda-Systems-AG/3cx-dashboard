"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar,
  LabelList,
  TooltipProps,
} from "recharts";
import { useState } from "react";

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6",
  "#ec4899", "#84cc16", "#a78bfa",
];

// Semantic colors for known metric groups (answered / abandoned / total)
const SEMANTIC_COLORS: Record<string, string> = {
  answered:                 "#10b981", // green
  answered_calls:           "#10b981",
  answered_calls_count:     "#10b981",
  calls_answered:           "#10b981",
  inbound_answered:         "#10b981",
  outbound_answered:        "#10b981",
  total_answered:           "#10b981",
  rg_answered_count:        "#10b981",
  q_answered_count:         "#10b981",
  agent_answered_polls_count: "#10b981",

  abandoned:                "#ef4444", // red
  missed_count:             "#ef4444",
  calls_unanswered:         "#ef4444",
  unanswered_calls:         "#ef4444",
  unanswered_calls_count:   "#ef4444",
  inbound_unanswered:       "#ef4444",
  outbound_unanswered:      "#ef4444",
  total_unanswered:         "#ef4444",
  polls_missed:             "#ef4444",

  total:                    "#3b82f6", // blue
  total_calls:              "#3b82f6",
  total_count:              "#3b82f6",
  call_count:               "#3b82f6",
  num_calls:                "#3b82f6",
  connections_count:        "#3b82f6",
  total_connections:        "#3b82f6",
  polls_received:           "#3b82f6",
  rg_received_count:        "#3b82f6",
  q_received_count:         "#3b82f6",
  agent_received_calls_count: "#3b82f6",
  agent_received_polls_count: "#3b82f6",
};

function getBarColor(field: string, index: number): string {
  return SEMANTIC_COLORS[field] ?? COLORS[index % COLORS.length];
}

// ─── Label map ───────────────────────────────────────────────────────────────
/** Übersetzt rohe SQL-Feldnamen und DB-Enum-Werte in lesbare deutsche Labels */
const LABELS: Record<string, string> = {
  // ── Anrufzähler ──────────────────────────────────────────────────
  total:                           "Gesamt",
  answered:                        "Angenommen",
  abandoned:                       "Verpasst",
  hour:                            "Stunde",
  total_calls:                     "Anrufe gesamt",
  answered_calls:                  "Angenommen",
  answered_calls_count:            "Angenommen",
  calls_answered:                  "Angenommen",
  calls_received:                  "Empfangen",
  calls_unanswered:                "Nicht angenommen",
  unanswered_calls:                "Nicht angenommen",
  unanswered_calls_count:          "Nicht angenommen",
  total_answered:                  "Angenommen gesamt",
  total_unanswered:                "Nicht angenommen gesamt",
  total_count:                     "Anzahl gesamt",
  call_count:                      "Anrufanzahl",
  count:                           "Anzahl",
  num_calls:                       "Anzahl Anrufe",
  missed_count:                    "Verpasst",
  // ── Eingehend / Ausgehend ─────────────────────────────────────────
  inbound_answered:                "Eingehend angenommen",
  inbound_unanswered:              "Eingehend nicht angenommen",
  inbound_connections_count:       "Eingehende Verbindungen",
  inbound_duration:                "Eingehende Gesprächszeit",
  inbound_talking_duration:        "Eingehende Gesprächszeit",
  inbound_bill_cost:               "Eingehende Kosten",
  outbound_answered:               "Ausgehend angenommen",
  outbound_unanswered:             "Ausgehend nicht angenommen",
  outbound_connections_count:      "Ausgehende Verbindungen",
  outbound_duration:               "Ausgehende Gesprächszeit",
  outbound_talking_duration:       "Ausgehende Gesprächszeit",
  outbound_bill_cost:              "Ausgehende Kosten",
  // ── Prozente ─────────────────────────────────────────────────────
  percent_answered:                "% Angenommen",
  calls_answered_percent:          "% Angenommen",
  missed_call_rate:                "% Verpasst",
  // ── Zeiten ───────────────────────────────────────────────────────
  avg_talking_duration:            "Ø Gesprächszeit",
  avg_call_duration:               "Ø Anrufdauer",
  avg_duration:                    "Ø Dauer",
  total_talking_duration:          "Gesprächszeit gesamt",
  total_talking_time:              "Gesprächszeit gesamt",
  talking_duration:                "Gesprächszeit",
  ringing_duration:                "Klingelzeit",
  longest_call_duration:           "Längster Anruf",
  duration:                        "Dauer",
  call_time:                       "Anrufzeit",
  // ── Verbindungen ─────────────────────────────────────────────────
  connections:                     "Verbindungen",
  connections_count:               "Verbindungen",
  total_connections:               "Verbindungen gesamt",
  high_value_connections:          "Hochwertige Verbindungen",
  // ── Warteschlangen / Ring-Gruppen ────────────────────────────────
  polls_received:                  "Versuche empfangen",
  polls_missed:                    "Versuche verpasst",
  rg_received_count:               "Rufgruppe empfangen",
  rg_answered_count:               "Rufgruppe angenommen",
  q_received_count:                "Warteschlange empfangen",
  q_answered_count:                "Warteschlange angenommen",
  agent_received_calls_count:      "Empfangene Anrufe",
  agent_answered_polls_count:      "Angenommene Versuche",
  agent_received_polls_count:      "Empfangene Versuche",
  agent_qcb_serviced_count:        "Rückrufe bedient",
  // ── Kosten ───────────────────────────────────────────────────────
  bill_cost:                       "Kosten",
  high_value_total_bill_cost:      "Kosten gesamt",
  high_value_avg_bill_cost:        "Ø Kosten",
  high_value_avg_duration:         "Ø Dauer",
  high_value_total_duration:       "Dauer gesamt",
  // ── Namen / Nummern ──────────────────────────────────────────────
  agent:                           "Agent",
  agent_name:                      "Agent",
  agent_dn:                        "Nebenstelle",
  dn:                              "Nebenstelle",
  dn_name:                         "Name",
  dn_number:                       "Nummer",
  rg_name:                         "Rufgruppe",
  rg_dn:                           "Rufgruppen-Nr.",
  q_name:                          "Warteschlange",
  q_dn:                            "Warteschlangen-Nr.",
  consumer:                        "Anrufer",
  destination_dn_number:           "Ziel",
  destination_participant:         "Angerufener",
  source_participant:              "Anrufer",
  destination_bill_rate_name:      "Tarifzone",
  destination_bill_code:           "Tarifcode",
  did:                             "DID",
  direction:                       "Richtung",
  // ── Abschlussgründe (termination_reason DB-Werte) ────────────────
  src_participant_terminated:              "Anrufer beendet",
  dst_participant_terminated:              "Angerufener beendet",
  cancelled:                              "Abgebrochen",
  continued_in:                           "Weitergeleitet",
  deflected:                              "Umgeleitet",
  redirected:                             "Weitergeleitet",
  rejected:                               "Abgelehnt",
  normal:                                 "Normal beendet",
  other:                                  "Sonstige",
  forwarded_to_queue:                     "An Warteschlange weitergeleitet",
  not_answered__cancelled:               "Keine Antwort – abgebrochen",
  not_answered__continued_in:            "Keine Antwort – weitergeleitet",
  not_answered__deflected:               "Keine Antwort – umgeleitet",
  not_answered__redirected:              "Keine Antwort – weitergeleitet",
  not_answered__rejected:                "Keine Antwort – abgelehnt",
  not_answered__src_participant_terminated: "Keine Antwort – Anrufer beendet",
  not_answered__dst_participant_terminated: "Keine Antwort – Angerufener beendet",
  // ── Rückruf-Typen ────────────────────────────────────────────────
  MCB:  "Manuell",
  QCB:  "Automatisch",
  // ── Zeitbuckets / Dauer-Kategorien ───────────────────────────────
  extension:                       "Nebenstelle",
  time_bucket:                     "Zeitraum",
  time:                            "Zeitraum",
  total_talking_sec:               "Gesprächszeit (s)",
  qcb_serviced:                    "Rückruf bedient",
  calls:                           "Anrufe",
  row_order_no:                    "Nr.",
  row_order:                       "Nr.",
  no_value_connections:            "Anrufe ohne Mehrwert",
  less_than_1min:                  "< 1 Min.",
  between_1min_and_3mins:          "1 – 3 Min.",
  more_than_3mins:                 "> 3 Min.",
  less_than_1min_perc:             "< 1 Min. (%)",
  between_1min_and_3mins_perc:     "1 – 3 Min. (%)",
  more_than_3mins_perc:            "> 3 Min. (%)",
  cost_less_than_1:                "< 1 €",
  cost_between_1_and_2:            "1 – 2 €",
  cost_more_than_2:                "> 2 €",
  duration_type:                   "Kategorie",
  cost_type:                       "Kostenkategorie",
  // ── Tabellenfelder ───────────────────────────────────────────────
  main_call_history_id:            "Anruf-ID",
  cdr_answered_at:                 "Angenommen um",
  cdr_ended_at:                    "Beendet um",
  ended_at:                        "Beendet um",
  started_at:                      "Gestartet",
  xcb_started_at:                  "Rückruf gestartet",
  xcb_source_participant:          "Rückruf-Anrufer",
  xcb_made:                        "Rückruf gemacht",
  xcb_delay_duration:              "Rückruf-Wartezeit",
  xcb_status:                      "Rückruf-Status",
  xcb_type:                        "Rückruf-Typ",
  xcb_talking_duration:            "Rückruf-Gesprächszeit",
  xcb_final_type:                  "Rückruf-Endtyp",
  mcb_cdr_id:                      "Man. Rückruf-ID",
  is_abandoned:                    "Abgebrochen",
  is_missed:                       "Verpasst",
  qcb_serviced_count:              "Rückrufe bedient",
};

function translateLabel(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, " ");
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChartPanelProps {
  title: string;
  rows: Record<string, unknown>[];
  fields: string[];
  type?: "barchart" | "timeseries" | "piechart" | "gauge" | "bargauge";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function truncateLabel(label: string, max = 20): string {
  if (!label || typeof label !== "string") return String(label ?? "");
  return label.length > max ? label.slice(0, max) + "…" : label;
}

/** Format a date/timestamp string for axis labels */
function formatDateLabel(val: string): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
    return new Date(val).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [, m, d] = val.split("-");
    return `${d}.${m}`;
  }
  return val;
}

/**
 * Field names that are always identifiers/labels — never treat as numeric values.
 * Extension numbers like "04024", DIDs, names, phone numbers all fall into this category.
 */
const LABEL_FIELD_NAMES = new Set([
  "agent", "agent_name", "agent_dn", "extension", "dn", "dn_name", "dn_number",
  "did", "name", "number", "queue", "queue_name", "queue_number",
  "destination_dn_number", "destination_dn_name", "destination_participant",
  "source_dn_number", "source_dn_name", "source_participant",
  "caller", "callee", "termination_reason", "direction", "kategorie", "category",
  "consumer", "rg_name", "rg_dn", "q_name", "q_dn",
  "duration_type", "cost_type", "xcb_type", "xcb_status", "xcb_final_type",
  "destination_bill_rate_name", "destination_bill_code", "queue_number", "queue_name",
]);

/** Detect whether a field value is truly numeric.
 *  Rejects: ISO dates, strings with spaces, phone/extension numbers (leading 0 or +),
 *  and anything that isn't a clean integer or decimal. */
function isNumericSample(sample: unknown): boolean {
  if (typeof sample === "number") return true;
  if (typeof sample === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return false;  // ISO date
    if (sample.includes(" ")) return false;                  // "04024 John Smith" etc.
    if (/^[0+]/.test(sample)) return false;                  // phone/extension (leading 0 or +)
    return /^-?\d+(\.\d+)?$/.test(sample);
  }
  return false;
}

/** Format numbers for German locale axis ticks (e.g. 3800 → "3.800") */
function formatAxisNumber(value: number): string {
  if (value >= 1000) return value.toLocaleString("de-DE");
  return String(value);
}

// ─── Dark-mode custom tooltip ─────────────────────────────────────────────────
interface TooltipPayloadItem {
  name: string;
  value: unknown;
  color?: string;
}

function DarkTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "rgba(10, 22, 40, 0.95)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 11,
        color: "#f1f5f9",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        backdropFilter: "blur(8px)",
      }}
    >
      {label && (
        <p style={{ marginBottom: 4, color: "#94a3b8", fontWeight: 500, fontSize: 10 }}>
          {label}
        </p>
      )}
      {(payload as TooltipPayloadItem[]).map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: entry.color ?? "#3b82f6",
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#94a3b8" }}>{translateLabel(entry.name)}:</span>
          <span style={{ fontWeight: 600, color: "#f1f5f9" }}>
            {Number(entry.value).toLocaleString("de-DE")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Chart container ──────────────────────────────────────────────────────────
const GRID_STROKE = "rgba(255,255,255,0.08)";
const AXIS_TICK_COLOR = "#64748b";
const MAX_VISIBLE_BARS = 20;

// ─── Main component ───────────────────────────────────────────────────────────
export function ChartPanel({ title, rows, fields, type = "barchart" }: ChartPanelProps) {
  const [showAll, setShowAll] = useState(false);

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-glass bg-surface-subtle p-4">
        <p className="mb-2 text-xs font-semibold text-secondary">{title}</p>
        <p className="text-xs text-muted">Keine Daten im gewählten Zeitraum</p>
      </div>
    );
  }

  const numericFields = fields.filter((f) => !LABEL_FIELD_NAMES.has(f) && isNumericSample(rows[0]?.[f]));
  const labelField =
    fields.find((f) => LABEL_FIELD_NAMES.has(f)) ??
    fields.find((f) => !numericFields.includes(f)) ??
    fields[0];
  const valueField = numericFields[0] ?? fields[1];

  const data: Array<Record<string, string | number>> = rows.map((r) => ({
    name: truncateLabel(translateLabel(formatDateLabel(String(r[labelField] ?? "")))),
    ...numericFields.reduce(
      (acc, f) => ({ ...acc, [f]: typeof r[f] === "number" ? r[f] : parseFloat(String(r[f])) || 0 }),
      {} as Record<string, number>
    ),
  }));

  // ─── Pie chart ──────────────────────────────────────────────────────────────
  if (type === "piechart") {
    const sorted = [...data].sort((a, b) => (b[valueField] as number) - (a[valueField] as number));
    const top = sorted.slice(0, 10);
    const rest = sorted.slice(10);
    const pieData =
      rest.length > 0
        ? [
            ...top,
            {
              name: "Sonstige",
              [valueField]: rest.reduce((s, r) => s + ((r[valueField] as number) || 0), 0),
            },
          ]
        : top;

    // Center value: total of all visible slices
    const pieTotal = pieData.reduce((s, d) => s + ((d[valueField] as number) || 0), 0);

    return (
      <div className="rounded-xl border border-glass bg-surface-subtle p-4">
        <p className="mb-3 text-xs font-semibold text-secondary">{title}</p>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey={valueField}
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              innerRadius={52}
              paddingAngle={2}
              isAnimationActive
              animationBegin={0}
              animationDuration={700}
            >
              {pieData.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  stroke="rgba(0,0,0,0.3)"
                  strokeWidth={1}
                />
              ))}
            </Pie>
            {/* Center label rendered via a foreignObject trick using recharts label prop on Pie */}
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fill: "#f1f5f9", fontSize: 16, fontWeight: 700 }}
            >
              {pieTotal.toLocaleString("de-DE")}
            </text>
            <text
              x="50%"
              y="56%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fill: "#64748b", fontSize: 9 }}
            >
              Gesamt
            </text>
            <Tooltip content={<DarkTooltip />} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconSize={8}
              iconType="circle"
              wrapperStyle={{
                fontSize: 10,
                maxHeight: 220,
                overflowY: "auto",
                lineHeight: "18px",
                color: "#94a3b8",
              }}
              formatter={(value) => translateLabel(String(value))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ─── Timeseries ─────────────────────────────────────────────────────────────
  if (type === "timeseries") {
    const timeField =
      fields.find((f) => /time|date|started|bucket|hour/i.test(f)) ?? labelField;
    const timeData = rows.map((r) => {
      const raw = r[timeField];
      const label =
        typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T/.test(raw)
          ? new Date(raw).toLocaleString("de-DE", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)
          ? formatDateLabel(raw)
          : String(raw ?? "");
      const numOnly = numericFields.filter((f) => f !== timeField);
      return {
        name: label,
        ...numOnly.reduce(
          (acc, f) => ({ ...acc, [f]: typeof r[f] === "number" ? r[f] : parseFloat(String(r[f])) || 0 }),
          {} as Record<string, number>
        ),
      };
    });

    const numOnly = numericFields.filter((f) => f !== timeField);

    return (
      <div className="rounded-xl border border-glass bg-surface-subtle p-4">
        <p className="mb-3 text-xs font-semibold text-secondary">{title}</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={timeData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
              tickFormatter={formatAxisNumber}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<DarkTooltip />} />
            {numOnly.slice(0, 3).map((f, i) => (
              <Line
                key={f}
                type="monotone"
                dataKey={f}
                name={translateLabel(f) as never}
                stroke={getBarColor(f, i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive
                animationDuration={600}
              />
            ))}
            {numOnly.length > 1 && (
              <Legend
                wrapperStyle={{ fontSize: 10, color: "#94a3b8", paddingTop: 8 }}
                formatter={(value) => translateLabel(String(value))}
                iconType="plainline"
                iconSize={14}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ─── Gauge ──────────────────────────────────────────────────────────────────
  if (type === "gauge") {
    const val =
      typeof rows[0]?.[valueField] === "number"
        ? (rows[0][valueField] as number)
        : parseFloat(String(rows[0]?.[valueField])) || 0;
    const pct = Math.min(100, Math.max(0, val));
    const color = pct > 80 ? COLORS[3] : pct > 50 ? COLORS[2] : COLORS[1];

    return (
      <div className="rounded-xl border border-glass bg-surface-subtle p-4 flex flex-col items-center">
        <p className="mb-2 text-xs font-semibold text-secondary">{title}</p>
        <div className="relative flex items-center justify-center">
          <ResponsiveContainer width={140} height={140}>
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="80%"
              startAngle={180}
              endAngle={0}
              data={[{ value: pct, fill: color }]}
            >
              <RadialBar
                dataKey="value"
                cornerRadius={4}
                background={{ fill: "rgba(255,255,255,0.05)" }}
                isAnimationActive
                animationDuration={700}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute text-xl font-bold text-heading">{pct.toFixed(1)}%</div>
        </div>
      </div>
    );
  }

  // ─── Bar chart ──────────────────────────────────────────────────────────────
  const isHorizontal = data.length > 8;
  const visibleData = isHorizontal && !showAll ? data.slice(0, MAX_VISIBLE_BARS) : data;
  const hiddenCount = data.length - visibleData.length;
  // Show data labels only for small charts or single-value horizontal bars (avoid overlap)
  const showDataLabels =
    data.length <= 15 && (!isHorizontal || numericFields.length === 1);

  // Fix #2: generous height formula — 28px per bar, min 60px padding, cap at 800
  const chartHeight = isHorizontal
    ? Math.min(800, visibleData.length * 28 + 60)
    : 200;

  const activeNumericFields = numericFields.slice(0, 3);

  return (
    <div className="rounded-xl border border-glass bg-surface-subtle p-4">
      <p className="mb-3 text-xs font-semibold text-secondary">{title}</p>
      <ResponsiveContainer
        width="100%"
        height={chartHeight}
      >
        <BarChart
          data={visibleData}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{
            top: 0,
            right: showDataLabels && !isHorizontal ? 0 : 16,
            left: isHorizontal ? 120 : -10,
            bottom: 0,
          }}
          barCategoryGap="20%"
          barGap={3}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={GRID_STROKE}
            // Fix #3: visible grid — horizontal bars get vertical lines only
            horizontal={!isHorizontal}
            vertical={isHorizontal}
          />

          {isHorizontal ? (
            <>
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
                width={120}
                tickLine={false}
                axisLine={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
                tickFormatter={formatAxisNumber}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
                tickFormatter={formatAxisNumber}
                tickLine={false}
                axisLine={false}
                width={40}
              />
            </>
          )}

          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />

          {activeNumericFields.map((f, i) => (
            <Bar
              key={f}
              dataKey={f}
              name={translateLabel(f) as never}
              fill={getBarColor(f, i)}
              // Fix #1: correct radius for horizontal vs vertical
              radius={
                isHorizontal
                  ? [0, 2, 2, 0]   // right side rounded for horizontal bars
                  : [2, 2, 0, 0]   // top rounded for vertical bars
              }
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            >
              {/* Fix #9: data labels for charts with <= 15 items */}
              {showDataLabels && (
                <LabelList
                  dataKey={f}
                  position={isHorizontal ? "right" : "top"}
                  style={{
                    fontSize: 9,
                    fill: "#94a3b8",
                    fontWeight: 500,
                  }}
                  formatter={(v: number) =>
                    v > 0 ? v.toLocaleString("de-DE") : ""
                  }
                />
              )}
            </Bar>
          ))}

          {activeNumericFields.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 10, color: "#94a3b8", paddingTop: 8 }}
              formatter={(value) => translateLabel(String(value))}
              iconType="rect"
              iconSize={8}
            />
          )}
        </BarChart>
      </ResponsiveContainer>

      {/* Fix #2 / #6: "show more" affordance when bars are truncated */}
      {isHorizontal && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 w-full rounded-lg border border-glass bg-surface-muted py-1.5 text-xs text-secondary hover:text-heading hover:bg-surface-subtle transition-colors"
        >
          + {hiddenCount} weitere anzeigen
        </button>
      )}
      {isHorizontal && showAll && data.length > MAX_VISIBLE_BARS && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-2 w-full rounded-lg border border-glass bg-surface-muted py-1.5 text-xs text-secondary hover:text-heading hover:bg-surface-subtle transition-colors"
        >
          Weniger anzeigen
        </button>
      )}
    </div>
  );
}
