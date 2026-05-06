import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface DataTableProps {
  title: string;
  rows: Record<string, unknown>[];
  fields: string[];
  maxRows?: number;
}

function fieldLabel(f: string): string {
  const MAP: Record<string, string> = {
    // ── Anrufzähler ──────────────────────────────────────────────────
    total_calls:              "Anrufe gesamt",
    answered_calls:           "Angenommen",
    answered_calls_count:     "Angenommen",
    calls_answered:           "Angenommen",
    calls_received:           "Empfangen",
    calls_unanswered:         "Nicht angenommen",
    unanswered_calls:         "Nicht angenommen",
    total_answered:           "Angenommen gesamt",
    total_unanswered:         "Nicht angenommen gesamt",
    call_count:               "Anrufanzahl",
    count:                    "Anzahl",
    num_calls:                "Anzahl Anrufe",
    missed_count:             "Verpasst",
    calls:                    "Anrufe",
    // ── Eingehend / Ausgehend ─────────────────────────────────────────
    inbound_answered:         "Eingehend angenommen",
    inbound_unanswered:       "Eingehend nicht angenommen",
    outbound_answered:        "Ausgehend angenommen",
    outbound_unanswered:      "Ausgehend nicht angenommen",
    inbound_connections_count:"Eingehende Verbindungen",
    outbound_connections_count:"Ausgehende Verbindungen",
    inbound_duration:         "Eingehende Gesprächszeit",
    outbound_duration:        "Ausgehende Gesprächszeit",
    inbound_talking_duration: "Eingehende Gesprächszeit",
    outbound_talking_duration:"Ausgehende Gesprächszeit",
    inbound_bill_cost:        "Eingehende Kosten",
    outbound_bill_cost:       "Ausgehende Kosten",
    inbound_answered_2:       "Eingehend angenommen",
    // ── Prozente ─────────────────────────────────────────────────────
    percent_answered:         "% Angenommen",
    calls_answered_percent:   "% Angenommen",
    missed_call_rate:         "% Verpasst",
    // ── Zeiten ───────────────────────────────────────────────────────
    avg_talking_duration:     "Ø Gesprächszeit",
    avg_call_duration:        "Ø Anrufdauer",
    avg_duration:             "Ø Dauer",
    total_talking_duration:   "Gesprächszeit gesamt",
    total_talking_time:       "Gesprächszeit gesamt",
    total_talking_sec:        "Gesprächszeit (s)",
    talking_duration:         "Gesprächszeit",
    ringing_duration:         "Klingelzeit",
    longest_call_duration:    "Längster Anruf",
    duration:                 "Dauer",
    call_time:                "Zeitraum",
    time_bucket:              "Zeitraum",
    time:                     "Zeitraum",
    // ── Verbindungen ─────────────────────────────────────────────────
    connections:              "Verbindungen",
    connections_count:        "Verbindungen",
    total_connections:        "Verbindungen gesamt",
    high_value_connections:   "Hochwertige Verbindungen",
    no_value_connections:     "Anrufe ohne Mehrwert",
    // ── Warteschlangen / Ring-Gruppen ────────────────────────────────
    polls_received:           "Versuche empfangen",
    polls_missed:             "Versuche verpasst",
    qcb_serviced:             "Rückruf bedient",
    qcb_serviced_count:       "Rückrufe bedient",
    rg_received_count:        "Rufgruppe empfangen",
    rg_answered_count:        "Rufgruppe angenommen",
    q_received_count:         "Warteschlange empfangen",
    q_answered_count:         "Warteschlange angenommen",
    agent_received_calls_count:"Empfangene Anrufe",
    agent_answered_polls_count:"Angenommene Versuche",
    agent_received_polls_count:"Empfangene Versuche",
    agent_qcb_serviced_count:  "Rückrufe bedient",
    // ── Kosten ───────────────────────────────────────────────────────
    bill_cost:                "Kosten",
    cost:                     "Kosten",
    avg_cost:                 "Ø Kosten",
    total_cost:               "Gesamtkosten",
    high_value_total_bill_cost:"Kosten gesamt",
    high_value_avg_bill_cost:  "Ø Kosten",
    high_value_avg_duration:   "Ø Dauer",
    high_value_total_duration: "Dauer gesamt",
    // ── Namen / Nummern ──────────────────────────────────────────────
    extension:                "Nebenstelle",
    agent:                    "Agent",
    agent_name:               "Agent",
    agent_dn:                 "Nebenstelle",
    dn:                       "Nebenstelle",
    dn_name:                  "Name",
    dn_number:                "Nummer",
    rg_name:                  "Rufgruppe",
    rg_dn:                    "Rufgruppen-Nr.",
    q_name:                   "Warteschlange",
    q_dn:                     "Warteschlangen-Nr.",
    queue:                    "Warteschlange",
    consumer:                 "Anrufer",
    destination_dn_number:    "Nebenstelle",
    destination_number:       "Ziel",
    source_number:            "Quelle",
    did:                      "DID",
    direction:                "Richtung",
    destination_bill_rate_name:"Tarifzone",
    destination_bill_code:    "Tarifcode",
    // ── Abschluss ────────────────────────────────────────────────────
    termination_reason:       "Abschlussgrund",
    call_outcome:             "Anrufergebnis",
    is_abandoned:             "Abgebrochen",
    is_missed:                "Verpasst",
    // ── Zeitstempel ──────────────────────────────────────────────────
    started_at:               "Gestartet",
    ended_at:                 "Beendet um",
    cdr_answered_at:          "Angenommen um",
    cdr_ended_at:             "Beendet um",
    // ── Detail-Felder (Tabellen) ──────────────────────────────────────
    main_call_history_id:     "Anruf-ID",
    source_participant:       "Anrufer",
    destination_participant:  "Angerufener",
    participant:              "Teilnehmer",
    source_caller_id:         "Anrufer-ID",
    destination_caller_id:    "Ziel-ID",
    caller_number:            "Rufnummer",
    called_number:            "Gerufene Nr.",
    row_order_no:             "Nr.",
    row_order:                "Nr.",
    // ── Rückruf (XCB/MCB/QCB) ────────────────────────────────────────
    xcb_started_at:           "Rückruf gestartet",
    xcb_source_participant:   "Rückruf-Anrufer",
    xcb_made:                 "Rückruf gemacht",
    xcb_delay_duration:       "Rückruf-Wartezeit",
    xcb_status:               "Rückruf-Status",
    xcb_type:                 "Rückruf-Typ",
    xcb_talking_duration:     "Rückruf-Gesprächszeit",
    xcb_final_type:           "Rückruf-Endtyp",
    mcb_cdr_id:               "Man. Rückruf-ID",
    // ── Kategorien ───────────────────────────────────────────────────
    duration_type:            "Kategorie",
    cost_type:                "Kostenkategorie",
    // ── Ø Klingel/Warte ──────────────────────────────────────────────
    avg_ring_duration:        "Ø Klingelzeit",
    avg_wait_duration:        "Ø Wartezeit",
    // ── Ring-Gruppen/Warteschlangen-Stat ─────────────────────────────
    ring_group_name:          "Rufgruppe",
    queue_name:               "Warteschlange",
    service_name:             "Dienst",
  };
  return MAP[f] ?? f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") {
    if (val > 100 && Number.isInteger(val)) return val.toLocaleString("de-DE");
    return val.toFixed(val % 1 !== 0 ? 2 : 0);
  }
  if (typeof val === "string") {
    // ISO date
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
      return new Date(val).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
    }
  }
  return String(val);
}

export function DataTable({ title, rows, fields, maxRows = 50 }: DataTableProps) {
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const perPage = 20;

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  }

  const sorted = sortField
    ? [...rows].sort((a, b) => {
        const av = a[sortField];
        const bv = b[sortField];
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : rows;

  const limited = sorted.slice(0, maxRows);
  const paged = limited.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(limited.length / perPage);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-glass bg-surface-subtle p-4">
        <p className="mb-2 text-xs font-semibold text-secondary">{title}</p>
        <p className="text-xs text-muted">Keine Daten im gewählten Zeitraum</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-glass bg-surface-subtle overflow-hidden">
      <div className="px-4 py-3 border-b border-glass">
        <p className="text-xs font-semibold text-secondary">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-glass">
              {fields.map((f) => (
                <th
                  key={f}
                  onClick={() => toggleSort(f)}
                  className="px-3 py-2 text-left font-medium text-muted cursor-pointer hover:text-heading select-none whitespace-nowrap"
                >
                  <span className="flex items-center gap-1">
                    {fieldLabel(f)}
                    {sortField === f ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="border-b border-glass/40 hover:bg-surface-muted/30">
                {fields.map((f) => (
                  <td key={f} className="px-3 py-2 text-body whitespace-nowrap max-w-xs truncate">
                    {formatCell(row[f])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-glass">
          <span className="text-xs text-muted">
            {page * perPage + 1}–{Math.min((page + 1) * perPage, limited.length)} von {limited.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded px-2 py-1 text-xs text-secondary hover:text-heading disabled:opacity-40"
            >
              ‹
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded px-2 py-1 text-xs text-secondary hover:text-heading disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
