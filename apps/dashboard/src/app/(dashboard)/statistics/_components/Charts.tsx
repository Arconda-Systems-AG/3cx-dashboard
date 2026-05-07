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
} from "recharts";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6",
  "#ec4899", "#84cc16", "#a78bfa",
];

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

interface ChartPanelProps {
  title: string;
  rows: Record<string, unknown>[];
  fields: string[];
  type?: "barchart" | "timeseries" | "piechart" | "gauge" | "bargauge";
}

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

export function ChartPanel({ title, rows, fields, type = "barchart" }: ChartPanelProps) {
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

  if (type === "piechart") {
    // Sort descending, cap at top 10, merge rest into "Sonstige"
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

    return (
      <div className="rounded-xl border border-glass bg-surface-subtle p-4">
        <p className="mb-3 text-xs font-semibold text-secondary">{title}</p>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey={valueField}
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) =>
                percent > 0.04 ? `${name} (${(percent * 100).toFixed(0)}%)` : ""
              }
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: unknown) => Number(v).toLocaleString("de-DE")} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconSize={10}
              wrapperStyle={{ fontSize: 10, maxHeight: 200, overflowY: "auto" }}
              formatter={(value) => translateLabel(String(value))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "timeseries") {
    const timeField =
      fields.find((f) => /time|date|started|bucket/i.test(f)) ?? labelField;
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
      // Only spread actual numeric fields (time field excluded)
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
          <LineChart data={timeData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#666" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#666" }} />
            <Tooltip formatter={(v: unknown, name: unknown) => [Number(v).toLocaleString("de-DE"), translateLabel(String(name))]} />
            {numOnly.slice(0, 3).map((f, i) => (
              <Line key={f} type="monotone" dataKey={f} name={translateLabel(f) as never} stroke={COLORS[i]} strokeWidth={2} dot={false} />
            ))}
            {numOnly.length > 1 && <Legend formatter={(value) => translateLabel(String(value))} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

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
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute text-xl font-bold text-heading">{pct.toFixed(1)}%</div>
        </div>
      </div>
    );
  }

  // Default: barchart
  const isHorizontal = data.length > 8;
  return (
    <div className="rounded-xl border border-glass bg-surface-subtle p-4">
      <p className="mb-3 text-xs font-semibold text-secondary">{title}</p>
      <ResponsiveContainer
        width="100%"
        height={isHorizontal ? Math.min(400, data.length * 22 + 40) : 200}
      >
        <BarChart
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{ top: 0, right: 10, left: isHorizontal ? 120 : -10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          {isHorizontal ? (
            <>
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#999" }} width={120} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#666" }} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#999" }} />
              <YAxis tick={{ fontSize: 10, fill: "#666" }} />
            </>
          )}
          <Tooltip formatter={(v: unknown, name: unknown) => [Number(v).toLocaleString("de-DE"), translateLabel(String(name))]} />
          {numericFields.slice(0, 3).map((f, i) => (
            <Bar key={f} dataKey={f} name={translateLabel(f) as never} fill={COLORS[i]} radius={[2, 2, 0, 0]} />
          ))}
          {numericFields.length > 1 && <Legend formatter={(value) => translateLabel(String(value))} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
