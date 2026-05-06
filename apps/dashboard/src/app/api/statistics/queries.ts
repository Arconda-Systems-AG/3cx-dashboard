// SQL queries derived from Grafana dashboard definitions
// Parameters: $1 = from (ISO timestamp), $2 = to (ISO timestamp)
// Dept filter: $3 = queueNumber (string), $4 = agentNumbers (string[]) — only added when dept filter is active

export type TabId =
  | 'overview'
  | 'ringGroups'
  | 'queues'
  | 'queueMissed'
  | 'extensions'
  | 'inbound'
  | 'outbound'
  | 'inboundOutbound'
  | 'sla';

export interface QueryDef {
  key: string;
  title: string;
  type: 'stat' | 'barchart' | 'timeseries' | 'piechart' | 'table' | 'gauge' | 'bargauge';
  sql: string;
}

// Abteilungs-Filter-Konfiguration: Welche Tabs/Queries wie nach Queue/Agenten gefiltert werden
export type DeptFilterType = 'queue_dn' | 'agents' | 'both';

export interface TabDeptConfig {
  filter: DeptFilterType;
  /** Alias des Haupt-cdroutput-Reads in den SQL-Queries dieses Tabs */
  alias: string;
}

/**
 * Für Tabs ohne Eintrag (overview): keine SQL-Filterung — globale Werte.
 * queue_dn: Filtert nach Queue-Nebenstellennummer ($3).
 * agents:   Filtert nach Agenten-DNs ($3 = agentNumbers[]).
 * both:     Filtert nach beidem ($3 = queueNumber, $4 = agentNumbers[]).
 */
export const tabDeptConfig: Partial<Record<TabId, TabDeptConfig>> = {
  // overview: keine SQL-Filterung (gemischte Aliases, globale Übersicht)
  ringGroups:     { filter: 'both',     alias: 'rg' },
  queues:         { filter: 'queue_dn', alias: 'q'  },
  queueMissed:    { filter: 'queue_dn', alias: 'q'  },
  extensions:     { filter: 'agents',   alias: 'c'  },
  inbound:        { filter: 'both',     alias: 'c'  },
  outbound:       { filter: 'both',     alias: 'c'  },
  inboundOutbound:{ filter: 'both',     alias: 'c'  },
  sla:            { filter: 'queue_dn', alias: 'q'  },
};

export const tabLabels: Record<TabId, string> = {
  overview:        "01. Überblick",
  ringGroups:      "02. Rufgruppen",
  queues:          "03. Warteschlangen",
  queueMissed:     "04. Verpasste Anrufe & Rückruf",
  extensions:      "05. Durchwahl-Statistiken",
  inbound:         "06. Eingehende Anrufe",
  outbound:        "07. Ausgehende Anrufe",
  inboundOutbound: "08. Eingehend vs. Ausgehend",
  sla:             "09. SLA / Abwurf",
};

export const tabDescriptions: Record<TabId, string> = {
  overview:        "Einstiegsdashboard & allgemeine Anrufübersicht",
  ringGroups:      "Rufgruppen-Dashboard & Analysen",
  queues:          "Warteschlangen-Dashboard & Analysen",
  queueMissed:     "Verpasste Anrufe in Warteschlangen & Rückruf-Effizienz",
  extensions:      "Statistiken nach Durchwahl / Nebenstelle",
  inbound:         "Alle eingehenden Anrufe visualisiert",
  outbound:        "Alle ausgehenden Anrufe visualisiert",
  inboundOutbound: "Vergleich eingehender vs. ausgehender Anrufverkehr",
  sla:             "SLA-Auswertung & Abwurf-Analyse",
};

export const tabQueries: Record<TabId, QueryDef[]> = {
  overview: [
    {
      key: "total_number_of_calls",
      title: "Gesamtanzahl Anrufe",
      type: "stat",
      sql: `SELECT
  COUNT(DISTINCT t.main_call_history_id) AS total_calls
FROM
  public.cdroutput AS t
WHERE t.cdr_started_at >= $1 AND t.cdr_started_at <= $2
;`,
    },
    {
      key: "answered_calls",
      title: "Angenommene Anrufe",
      type: "stat",
      sql: `WITH cdrs AS (
    SELECT
        cdr_answered_at,
        ROW_NUMBER() OVER (PARTITION BY main_call_history_id ORDER BY cdr_id DESC) AS row_num
    FROM public.cdroutput
    WHERE cdr_started_at >= $1 AND cdr_started_at <= $2
)
SELECT COUNT(*) AS answered_calls
FROM cdrs
WHERE row_num = 1
AND cdr_answered_at IS NOT NULL;`,
    },
    {
      key: "answered_calls",
      title: "% Angenommene Anrufe",
      type: "stat",
      sql: `WITH cdrs AS (
	SELECT
		c.cdr_answered_at,
		ROW_NUMBER() OVER (PARTITION BY c.main_call_history_id ORDER BY c.cdr_id DESC) AS row_num		-- 1 = last cdr
	FROM public.cdroutput AS c
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
)
SELECT
	(COUNT(*) FILTER (WHERE c.cdr_answered_at IS NOT NULL) * 100.0) / NULLIF(COUNT(*), 0) AS percent_answered
FROM cdrs AS c
WHERE c.row_num = 1
;`,
    },
    {
      key: "not_answered",
      title: "Nicht Beantwortet",
      type: "stat",
      sql: `WITH cdrs AS (
	SELECT
		c.cdr_answered_at,
		ROW_NUMBER() OVER (PARTITION BY c.main_call_history_id ORDER BY c.cdr_id DESC) AS row_num		-- 1 = last cdr
	FROM public.cdroutput AS c
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
)
SELECT count(*) AS unanswered_calls
FROM cdrs AS c
WHERE c.row_num = 1                 -- 1 = last cdr
AND c.cdr_answered_at IS NULL
;`,
    },
    {
      key: "total_talking_duration",
      title: "Gesamte Gesprächszeit",
      type: "stat",
      sql: `SELECT 
    SUM(EXTRACT(EPOCH FROM (t.cdr_ended_at - t.cdr_answered_at))) AS total_talking_duration
FROM public.cdroutput AS t
WHERE t.cdr_started_at >= $1 AND t.cdr_started_at <= $2;`,
    },
    {
      key: "average_talking_duration",
      title: "Ø Gesprächszeit",
      type: "stat",
      sql: `SELECT 
    SUM(EXTRACT(EPOCH FROM (t.cdr_ended_at - t.cdr_answered_at))) / NULLIF(COUNT(DISTINCT t.main_call_history_id), 0) AS avg_talking_duration
FROM public.cdroutput AS t
WHERE t.cdr_started_at >= $1 AND t.cdr_started_at <= $2
;`,
    },
    {
      key: "average_call_duration",
      title: "Ø Anrufdauer",
      type: "stat",
      sql: `WITH calls AS (
  SELECT
    t.main_call_history_id,
    EXTRACT(EPOCH FROM (max(t.cdr_ended_at) - min(t.cdr_started_at))) AS duration
  FROM public.cdroutput AS t
  WHERE t.cdr_started_at >= $1 AND t.cdr_started_at <= $2
  GROUP BY t.main_call_history_id
)
SELECT
  avg(c.duration) AS avg_call_duration
FROM calls AS c
;`,
    },
    {
      key: "longest_call_duration",
      title: "Längster Anruf",
      type: "stat",
      sql: `WITH calls AS (
  SELECT
    t.main_call_history_id,
    EXTRACT(EPOCH FROM (max(t.cdr_ended_at) - min(t.cdr_started_at))) AS duration
  FROM public.cdroutput AS t
  WHERE t.cdr_started_at >= $1 AND t.cdr_started_at <= $2
  GROUP BY t.main_call_history_id
)
SELECT
  max(c.duration) AS longest_call_duration
FROM calls AS c
;`,
    },
    {
      key: "extension_missed_calls",
      title: "% Verpasste Anrufe (Nebenstellen)",
      type: "gauge",
      sql: `WITH all_calls_count AS (
    SELECT
        COUNT(DISTINCT t.main_call_history_id) AS total_count
    FROM public.cdroutput AS t
    WHERE t.cdr_started_at >= $1 AND t.cdr_started_at <= $2
    AND t.destination_entity_type = 'extension'
),
missed_calls_count AS (
    SELECT
        COUNT(DISTINCT t.main_call_history_id) AS missed_count
    FROM public.cdroutput AS t
    WHERE t.cdr_answered_at IS NULL
    AND t.cdr_started_at >= $1 AND t.cdr_started_at <= $2
    AND t.destination_entity_type = 'extension'
)
SELECT
    missed_calls_count.missed_count * 100.0 / NULLIF(all_calls_count.total_count, 0) AS missed_call_rate
FROM all_calls_count, missed_calls_count
;`,
    },
    {
      key: "final_termination_reasons",
      title: "Abschlussgründe",
      type: "piechart",
      sql: `WITH cdrs AS (
	SELECT
		c.termination_reason,
		ROW_NUMBER() OVER (PARTITION BY c.main_call_history_id ORDER BY c.cdr_id DESC) AS row_num		-- 1 = last cdr
	FROM public.cdroutput AS c
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
)
SELECT
    c.termination_reason,
    count(*) AS count
FROM cdrs AS c
WHERE c.row_num = 1                 -- 1 = last cdr
AND c.termination_reason IS NOT NULL
GROUP BY termination_reason
ORDER BY count DESC
;`,
    },
    {
      key: "amount_of_calls_over_time",
      title: "Anrufe über Zeit",
      type: "timeseries",
      sql: `SELECT 
    DATE_TRUNC('hour', t.cdr_started_at) AS time, 
    COUNT(DISTINCT t.main_call_history_id) AS num_calls
FROM public.cdroutput AS t
WHERE t.cdr_started_at >= $1 AND t.cdr_started_at <= $2
GROUP BY time
ORDER BY time
;`,
    },
    {
      key: "top_10_most_dialled_numbers",
      title: "Top 10 Meistgewählte Nummern",
      type: "barchart",
      sql: `SELECT 
    CASE WHEN c.destination_participant_phone_number IS NULL OR c.destination_participant_phone_number = '' THEN c.destination_dn_number ELSE c.destination_participant_phone_number END AS destination_dn_number, 
    COUNT(DISTINCT c.main_call_history_id) AS call_count
FROM public.cdroutput AS c
WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
AND c.destination_dn_number NOT IN ('EndCall', 'QCB')
GROUP BY CASE WHEN c.destination_participant_phone_number IS NULL OR c.destination_participant_phone_number = '' THEN c.destination_dn_number ELSE c.destination_participant_phone_number END
ORDER BY call_count DESC
LIMIT 10
;`,
    },
    {
      key: "top_10_answered_extensions",
      title: "Top 10 Antwortende Nebenstellen",
      type: "barchart",
      sql: `SELECT 
    destination_dn_number, 
    COUNT(*) AS call_count
FROM public.cdroutput
WHERE cdr_started_at >= $1 AND cdr_started_at <= $2
AND destination_entity_type = 'extension'
AND cdr_answered_at IS NOT NULL
GROUP BY destination_dn_number
ORDER BY call_count DESC
LIMIT 10
;`,
    },
    {
      key: "top_10_extensions_with_missed_calls",
      title: "Top 10 Nebenstellen mit Verpassten Anrufen",
      type: "barchart",
      sql: `SELECT 
    destination_dn_number, 
    COUNT(*) AS call_count
FROM public.cdroutput
WHERE cdr_started_at >= $1 AND cdr_started_at <= $2
AND destination_entity_type = 'extension'
AND cdr_answered_at IS NULL
GROUP BY destination_dn_number
ORDER BY call_count DESC
LIMIT 10
;`,
    },
  ],
  ringGroups: [
    {
      key: "calls_received",
      title: "Empfangene Anrufe",
      type: "stat",
      sql: `SELECT
  COUNT(DISTINCT rg.cdr_id) AS total_calls
FROM public.cdroutput AS rg
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "calls_answered",
      title: "Angenommene Anrufe",
      type: "stat",
      sql: `SELECT
  COUNT(DISTINCT
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
      THEN rg.cdr_id
    END
  ) AS answered_calls
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "calls_answered",
      title: "% Angenommene Anrufe",
      type: "stat",
      sql: `SELECT
  COUNT(DISTINCT
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
      THEN rg.cdr_id
    END
  ) * 100.0 /
  NULLIF(COUNT(DISTINCT rg.cdr_id), 0)
  AS percent_answered
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "calls_not_answered",
      title: "Nicht Angenommene Anrufe",
      type: "stat",
      sql: `SELECT
  COALESCE(COUNT(DISTINCT rg.cdr_id), 0) -
  COALESCE(COUNT(DISTINCT
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
      THEN rg.cdr_id
    END
  ), 0)
  AS unanswered_calls
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "total_talking_duration",
      title: "Gesamte Gesprächszeit",
      type: "stat",
      sql: `SELECT
  SUM(
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
      THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - continued_in_cdr.cdr_answered_at))
    END
  ) AS total_talking_time
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "average_talking_duration",
      title: "Ø Gesprächszeit",
      type: "stat",
      sql: `SELECT
  AVG(
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
      THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - continued_in_cdr.cdr_answered_at))
    END
  ) AS total_talking_time
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "average_call_duration",
      title: "Ø Anrufdauer",
      type: "stat",
      sql: `SELECT
  AVG(
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - rg.cdr_started_at))
      ELSE EXTRACT(EPOCH FROM (rg.cdr_ended_at - rg.cdr_started_at))
    END
  ) AS duration
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "longest_call_duration",
      title: "Längster Anruf",
      type: "stat",
      sql: `SELECT
  MAX(
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - rg.cdr_started_at))
      ELSE EXTRACT(EPOCH FROM (rg.cdr_ended_at - rg.cdr_started_at))
    END
  ) AS duration
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "missed_calls",
      title: "% Verpasste Anrufe",
      type: "gauge",
      sql: `SELECT
  COUNT(DISTINCT
    CASE
      WHEN NOT (rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension')
      THEN rg.cdr_id
    END
  ) * 100.0 /
  NULLIF(COUNT(DISTINCT rg.cdr_id), 0)
  AS missed_call_rate
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "average_ringing_time",
      title: "Ø Klingelzeit",
      type: "stat",
      sql: `SELECT
  AVG(EXTRACT(EPOCH FROM (rg.cdr_ended_at - rg.cdr_started_at))) AS duration
FROM public.cdroutput AS rg
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
;`,
    },
    {
      key: "call_outcomes",
      title: "Anrufausgänge",
      type: "piechart",
      sql: `SELECT
    CASE
      WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN COALESCE(continued_in_cdr.termination_reason, 'other')
      ELSE COALESCE('not_answered__' || rg.termination_reason, 'other')
    END
    AS call_outcome,
    COUNT(*) AS call_count
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
GROUP BY call_outcome
ORDER BY call_count DESC
;`,
    },
    {
      key: "received___answered_calls_over_time",
      title: "Eingehend / Angenommen über Zeit",
      type: "timeseries",
      sql: `SELECT
    DATE_TRUNC('hour', rg.cdr_started_at) AS "time",
    COUNT(DISTINCT rg.cdr_id) AS total_calls,
    COUNT(DISTINCT
    CASE
        WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN rg.cdr_id
    END
    ) AS answered_calls
FROM public.cdroutput AS rg
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = rg.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
GROUP BY 1
ORDER BY 1
;`,
    },
    {
      key: "ring_group_call_statistics",
      title: "Rufgruppen-Statistik",
      type: "table",
      sql: `-- Ring group info with last name
WITH rg_info AS (
  SELECT
    rg.destination_dn_number AS dn_number,
    CASE WHEN '''' = 'All' THEN 'All ring groups' ELSE COALESCE(rg.destination_dn_name, 'Unknown') END AS name
  FROM public.cdroutput AS rg
  WHERE rg.cdr_started_at = ( -- Changed this line
    SELECT
      MAX(sub_rg.cdr_started_at) -- Changed this to MAX(cdr_started_at)
    FROM public.cdroutput AS sub_rg
    WHERE sub_rg.cdr_started_at >= $1 AND sub_rg.cdr_started_at <= $2
            AND sub_rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
  )
),
-- Ring group totals
rg_totals AS (
  SELECT
    0 AS row_order_no,
    MAX(rg.destination_dn_number) AS rg_dn,
    MAX(rg_info.name) AS rg_name,
    COUNT(DISTINCT rg.cdr_id) AS rg_received_count,
    COUNT(DISTINCT
      CASE
        WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN rg.cdr_id
      END
    ) AS rg_answered_count
  FROM public.cdroutput AS rg
  INNER JOIN rg_info ON TRUE 
  LEFT JOIN public.cdroutput AS continued_in_cdr ON
    continued_in_cdr.cdr_id = rg.continued_in_cdr_id
    AND continued_in_cdr.creation_forward_reason = 'polling'
  WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
        AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
  GROUP BY rg.destination_dn_number -- Added GROUP BY for rg_totals
),
-- Ring group users statistics
rg_users_stat AS (
  SELECT
    1 AS row_order_no,
    MAX(rg.destination_dn_number) AS rg_dn,
    MAX(rg_info.name) AS rg_name,
    agent_polls.destination_dn_number AS agent_dn,
    COALESCE(agent_polls.destination_dn_name, 'Unknown') AS agent_name,
    COUNT(DISTINCT CASE WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND agent_polls.cdr_answered_at IS NOT NULL THEN rg.cdr_id END) AS agent_answered_polls_count,
    COUNT(agent_polls.cdr_id) AS agent_received_polls_count
  FROM public.cdroutput AS rg
  INNER JOIN rg_info ON TRUE -- This will cause issues if rg_info returns multiple rows. See note below.
  INNER JOIN public.cdroutput AS agent_polls ON
    agent_polls.call_history_id = rg.call_history_id
    AND agent_polls.originating_cdr_id = rg.cdr_id
    AND agent_polls.destination_dn_type = 'extension'
    AND agent_polls.creation_method = 'route_to'
    AND agent_polls.creation_forward_reason = 'polling'
  WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
        AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
  GROUP BY agent_polls.destination_dn_number, agent_polls.destination_dn_name, rg.destination_dn_number -- Added rg.destination_dn_number to GROUP BY
)
SELECT
  rg.row_order_no,
  CASE WHEN '''' != 'All' THEN rg.rg_dn || ' ' ELSE '' END || rg.rg_name || ' [totals]' AS extension,
  COALESCE(rg.rg_received_count, 0) AS calls_received,
  COALESCE(rg.rg_received_count, 0) - COALESCE(rg.rg_answered_count, 0) AS calls_unanswered,
  COALESCE(rg.rg_answered_count, 0) AS calls_answered,
  CAST(NULL AS bigint) AS polls_received,
  CAST(NULL AS bigint) AS polls_missed
FROM rg_totals AS rg
UNION ALL
SELECT
  u.row_order_no,
  u.agent_dn || ' ' || u.agent_name AS extension,
  CAST(NULL AS bigint) AS calls_received,
  CAST(NULL AS bigint) AS calls_unanswered,
  COALESCE(u.agent_answered_polls_count, 0) AS calls_answered,
  COALESCE(u.agent_received_polls_count, 0) AS polls_received,
  COALESCE(u.agent_received_polls_count, 0) - COALESCE(u.agent_answered_polls_count, 0) AS polls_missed
FROM rg_users_stat AS u
ORDER BY row_order_no, extension;`,
    },
    {
      key: "received_calls_over_time",
      title: "Eingehende Anrufe über Zeit",
      type: "timeseries",
      sql: `SELECT
    DATE_TRUNC('hour', rg.cdr_started_at) AS "time",
    COUNT(DISTINCT rg.cdr_id) AS num_calls
FROM public.cdroutput AS rg
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
GROUP BY 1
ORDER BY 1
;`,
    },
    {
      key: "call_statistics_by_ring_group_users",
      title: "Statistik nach Rufgruppen-Teilnehmern",
      type: "barchart",
      sql: `SELECT
  agent_polls.destination_dn_number || ' ' || COALESCE(agent_polls.destination_dn_name, 'Unknown') AS agent,
  COUNT(DISTINCT agent_polls.main_call_history_id) AS agent_received_calls_count,
  COUNT(agent_polls.cdr_id) AS agent_received_polls_count,
  COUNT(DISTINCT CASE WHEN rg.termination_reason IN ('continued_in', 'redirected') AND rg.termination_reason_details = 'polling' AND agent_polls.cdr_answered_at IS NOT NULL THEN rg.cdr_id END) AS agent_answered_polls_count
FROM public.cdroutput AS rg
INNER JOIN public.cdroutput AS agent_polls ON
  agent_polls.call_history_id = rg.call_history_id
  AND agent_polls.originating_cdr_id = rg.cdr_id
  AND agent_polls.destination_dn_type = 'extension'
  AND agent_polls.creation_method = 'route_to'
  AND agent_polls.creation_forward_reason = 'polling'
WHERE rg.cdr_started_at >= $1 AND rg.cdr_started_at <= $2
    AND rg.destination_dn_type IN ('ring_group_ring_all', 'ring_group_hunt')
GROUP BY agent
ORDER BY agent
;`,
    },
  ],
  queues: [
    {
      key: "total_talking_duration",
      title: "Gesamte Gesprächszeit",
      type: "stat",
      sql: `SELECT
  SUM(
    CASE
      WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
      THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - continued_in_cdr.cdr_answered_at))
    END
  ) AS total_talking_time
FROM public.cdroutput AS q
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = q.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
;`,
    },
    {
      key: "longest_call_duration",
      title: "Längster Anruf",
      type: "stat",
      sql: `SELECT
  MAX(
    CASE
      WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - q.cdr_started_at))
      ELSE EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at))
    END
  ) AS duration
FROM public.cdroutput AS q
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = q.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
;`,
    },
    {
      key: "average_ringing_time",
      title: "Ø Klingelzeit",
      type: "stat",
      sql: `SELECT
  AVG(EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at))) AS duration
FROM public.cdroutput AS q
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
;`,
    },
    {
      key: "call_outcomes",
      title: "Anrufausgänge",
      type: "piechart",
      sql: `SELECT
    CASE
        WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN COALESCE(continued_in_cdr.termination_reason, 'other')
        WHEN next_queue_cdr.cdr_id IS NOT NULL
        THEN 'forwarded_to_queue'
        ELSE COALESCE('not_answered__' || q.termination_reason, 'other')
    END
    AS call_outcome,
    COUNT(*) AS call_count
FROM public.cdroutput AS q
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = q.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
LEFT JOIN public.cdroutput AS next_queue_cdr ON
  next_queue_cdr.cdr_id = q.continued_in_cdr_id
  AND next_queue_cdr.destination_dn_type = 'queue'
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
GROUP BY call_outcome
ORDER BY call_count DESC
;`,
    },
    {
      key: "average_talking_duration",
      title: "Ø Gesprächszeit",
      type: "stat",
      sql: `SELECT
  AVG(
    CASE
      WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
      THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - continued_in_cdr.cdr_answered_at))
    END
  ) AS total_talking_time
FROM public.cdroutput AS q
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = q.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
;`,
    },
    {
      key: "average_call_duration",
      title: "Ø Anrufdauer",
      type: "stat",
      sql: `SELECT
  AVG(
    CASE
      WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN EXTRACT(EPOCH FROM (continued_in_cdr.cdr_ended_at - q.cdr_started_at))
      ELSE EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at))
    END
  ) AS duration
FROM public.cdroutput AS q
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = q.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
;`,
    },
    {
      key: "received___answered_calls_over_time",
      title: "Eingehend / Angenommen über Zeit",
      type: "timeseries",
      sql: `SELECT
    DATE_TRUNC('hour', q.cdr_started_at) AS call_time,
    COUNT(DISTINCT q.cdr_id) AS total_calls,
    COUNT(DISTINCT
    CASE
        WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
        THEN q.cdr_id
    END
    ) AS answered_calls
FROM public.cdroutput AS q
LEFT JOIN public.cdroutput AS continued_in_cdr ON
  continued_in_cdr.cdr_id = q.continued_in_cdr_id
  AND continued_in_cdr.creation_forward_reason = 'polling'
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
GROUP BY call_time
ORDER BY call_time
;`,
    },
    {
      key: "queue_call_statistics",
      title: "Warteschlangen-Statistik",
      type: "table",
      sql: `-- Queue info with last name
WITH q_info AS (
  SELECT DISTINCT ON (q.destination_dn_number)
    q.destination_dn_number AS dn_number,
    -- The name for 'All' is handled in the final SELECT,
    -- here we ensure the individual queue name is available.
    COALESCE(q.destination_dn_name, 'Unknown') AS name
  FROM public.cdroutput AS q
  WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2
    
    AND q.destination_dn_type = 'queue'
  ORDER BY q.destination_dn_number, q.cdr_started_at DESC, q.cdr_id DESC
),
-- Queue totals
q_totals AS (
	SELECT
    0 AS row_order_no,
		MAX(q.destination_dn_number) AS q_dn,
		MAX(q_info.name) AS q_name,
		COUNT(DISTINCT q.cdr_id) AS q_received_count,
		COUNT(DISTINCT
			CASE
				WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension'
				THEN q.cdr_id
			END
		) AS q_answered_count,
    COUNT(DISTINCT cbi.cdr_id) AS qcb_serviced_count
	FROM public.cdroutput AS q
	INNER JOIN q_info ON TRUE
	LEFT JOIN public.cdroutput AS continued_in_cdr ON
		continued_in_cdr.cdr_id = q.continued_in_cdr_id
		AND continued_in_cdr.creation_forward_reason = 'polling'
  LEFT JOIN public.cdroutput AS qcb ON
    q.termination_reason = 'continued_in'
    AND q.termination_reason_details = 'callback_requested'
    AND qcb.cdr_id = q.continued_in_cdr_id
    AND qcb.creation_forward_reason = 'callback_requested'
    AND qcb.source_entity_type = 'queue'
    AND qcb.destination_dn_number = 'QCB'
    AND qcb.termination_reason = 'continued_in'
  LEFT JOIN public.cdroutput AS cb ON
    cb.cdr_id = qcb.continued_in_cdr_id
    AND cb.source_dn_number = 'QCB'
    AND cb.continued_in_cdr_id IS NOT NULL
    AND cb.termination_reason_details = 'callback'
  LEFT JOIN public.cdroutput AS cbi ON
    cbi.cdr_id = cb.continued_in_cdr_id
    AND cbi.creation_method = 'route_to'
    AND cbi.cdr_answered_at IS NOT NULL
	WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2
    
    AND q.destination_dn_type = 'queue'
),
qcb_user_stat AS (
  SELECT
    MAX(q.destination_dn_number) AS q_dn,
    MAX(q_info.name) AS q_name,
    cbi.source_dn_number AS agent_dn,
    COALESCE(cbi.source_dn_name, 'Unknown') AS agent_name,
    0 AS agent_answered_polls_count,
    0 AS agent_received_polls_count,
    COUNT(DISTINCT cbi.cdr_id) AS agent_qcb_serviced_count
  FROM public.cdroutput AS q
  INNER JOIN q_info ON TRUE
  INNER JOIN public.cdroutput AS qcb ON
    q.termination_reason = 'continued_in'
    AND q.termination_reason_details = 'callback_requested'
    AND qcb.cdr_id = q.continued_in_cdr_id
    AND qcb.creation_forward_reason = 'callback_requested'
    AND qcb.source_entity_type = 'queue'
    AND qcb.destination_dn_number = 'QCB'
    AND qcb.termination_reason = 'continued_in'
  INNER JOIN public.cdroutput AS cb ON
    cb.cdr_id = qcb.continued_in_cdr_id
    AND cb.source_dn_number = 'QCB'
    AND cb.continued_in_cdr_id IS NOT NULL
    AND cb.termination_reason_details = 'callback'
  INNER JOIN public.cdroutput AS cbi ON
    cbi.cdr_id = cb.continued_in_cdr_id
    AND cbi.creation_method = 'route_to'
    AND cbi.cdr_answered_at IS NOT NULL
    AND cbi.source_dn_type = 'extension'
  WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2
    
    AND q.destination_entity_type = 'queue'
    AND q.termination_reason = 'continued_in'
    AND q.termination_reason_details = 'callback_requested'
  GROUP BY cbi.source_dn_number, cbi.source_dn_name
),
-- Queue agents statistics
q_user_stat AS (
  SELECT
    MAX(q.destination_dn_number) AS q_dn,
    MAX(q_info.name) AS q_name,
    agent_polls.destination_dn_number AS agent_dn,
    COALESCE(agent_polls.destination_dn_name, 'Unknown') AS agent_name,
    COUNT(DISTINCT CASE WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND agent_polls.cdr_answered_at IS NOT NULL THEN q.cdr_id END) AS agent_answered_polls_count,
    COUNT(agent_polls.cdr_id) AS agent_received_polls_count,
    0 AS agent_qcb_serviced_count
  FROM public.cdroutput AS q
  INNER JOIN q_info ON TRUE
  INNER JOIN public.cdroutput AS agent_polls ON
    agent_polls.call_history_id = q.call_history_id
    AND agent_polls.originating_cdr_id = q.cdr_id
    AND agent_polls.destination_dn_type = 'extension'
    AND agent_polls.creation_method = 'route_to'
    AND agent_polls.creation_forward_reason = 'polling'
  WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2
    
    AND q.destination_dn_type = 'queue'
  GROUP BY agent_polls.destination_dn_number, agent_polls.destination_dn_name
)
SELECT
  q.row_order_no,
  CASE WHEN '''' != 'All' THEN q.q_dn || ' ' ELSE '' END || q.q_name || ' [totals]' AS extension,
  COALESCE(q.q_received_count, 0) AS calls_received,
  COALESCE(q.q_received_count, 0) - COALESCE(q.q_answered_count, 0) - COALESCE(q.qcb_serviced_count, 0) AS calls_unanswered,
  COALESCE(q.q_answered_count, 0) + COALESCE(q.qcb_serviced_count, 0) AS calls_answered,
  COALESCE(q.qcb_serviced_count, 0) AS qcb_serviced,
  CAST(NULL AS bigint) AS polls_received,
  CAST(NULL AS bigint) AS polls_missed
FROM q_totals AS q
UNION ALL
SELECT
  u.row_order_no,
  u.agent_dn || ' ' || u.agent_name AS extension,
  CAST(NULL AS bigint) AS calls_received,
  CAST(NULL AS bigint) AS calls_unanswered,
  COALESCE(u.agent_answered_polls_count, 0) + COALESCE(u.agent_qcb_serviced_count, 0) AS calls_answered,
  COALESCE(u.agent_qcb_serviced_count, 0) AS qcb_serviced,
  COALESCE(u.agent_received_polls_count, 0) AS polls_received,
  COALESCE(u.agent_received_polls_count, 0) - COALESCE(u.agent_answered_polls_count, 0) AS polls_missed
FROM (
  SELECT
    1 AS row_order_no,
    MAX(u.q_dn) AS q_dn,
    MAX(u.q_name) AS q_name,
    u.agent_dn AS agent_dn,
    u.agent_name AS agent_name,
    SUM(u.agent_answered_polls_count) AS agent_answered_polls_count,
    SUM(u.agent_received_polls_count) AS agent_received_polls_count,
    SUM(u.agent_qcb_serviced_count) AS agent_qcb_serviced_count
  FROM (
    SELECT *
    FROM q_user_stat AS u
    UNION ALL
    SELECT *
    FROM qcb_user_stat AS cb
  ) AS u
  GROUP BY u.agent_dn, u.agent_name
) AS u
ORDER BY row_order_no, extension
;`,
    },
    {
      key: "received_calls_over_time",
      title: "Eingehende Anrufe über Zeit",
      type: "timeseries",
      sql: `SELECT
    DATE_TRUNC('hour', q.cdr_started_at) AS time_bucket,
    COUNT(DISTINCT q.cdr_id) AS num_calls
FROM public.cdroutput AS q
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
GROUP BY time_bucket
ORDER BY time_bucket
;`,
    },
    {
      key: "call_statistics_by_queue_agents",
      title: "Statistik nach Warteschlangen-Agenten",
      type: "barchart",
      sql: `SELECT
  agent_polls.destination_dn_number || ' ' || COALESCE(agent_polls.destination_dn_name, 'Unknown') AS agent,
  COUNT(DISTINCT agent_polls.main_call_history_id) AS agent_received_calls_count,
  COUNT(agent_polls.cdr_id) AS agent_received_polls_count,
  COUNT(DISTINCT CASE WHEN q.termination_reason IN ('continued_in', 'redirected') AND q.termination_reason_details = 'polling' AND agent_polls.cdr_answered_at IS NOT NULL THEN q.cdr_id END) AS agent_answered_polls_count
FROM public.cdroutput AS q
INNER JOIN public.cdroutput AS agent_polls ON
  agent_polls.call_history_id = q.call_history_id
  AND agent_polls.originating_cdr_id = q.cdr_id
  AND agent_polls.destination_dn_type = 'extension'
  AND agent_polls.creation_method = 'route_to'
  AND agent_polls.creation_forward_reason = 'polling'
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2
  
  AND q.destination_dn_type = 'queue'
GROUP BY agent
ORDER BY agent
;`,
    },
  ],
  queueMissed: [
    {
      key: "total_calls",
      title: "Gesamte Anrufe",
      type: "stat",
      sql: `SELECT
  COUNT(DISTINCT q.cdr_id) AS total_calls
FROM public.cdroutput AS q
WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2

AND q.destination_dn_type = 'queue'
;`,
    },
    {
      key: "missed_calls_list___callbacks",
      title: "Verpasste Anrufe & Rückrufe",
      type: "table",
      sql: `WITH q AS (
	SELECT
		q.main_call_history_id,
		q.cdr_id,
		q.source_entity_type,
		q.source_dn_number,
		q.source_participant_phone_number,
		--
		CASE
			WHEN q.source_entity_type = 'external_line'
				THEN q.source_participant_phone_number || ' ' || coalesce(q.source_dn_name, 'Unknown')
			ELSE q.source_dn_number || ' ' || coalesce(q.source_dn_name, 'Unknown')
		END AS source_participant,
		--
		coalesce(q.source_participant_trunk_did, 'Unknown') AS did,
		--
		CASE
			WHEN q.destination_entity_type = 'external_line'
				THEN q.destination_participant_phone_number || ' ' || coalesce(q.destination_dn_name, 'Unknown')
			ELSE q.destination_dn_number || ' ' || coalesce(q.destination_dn_name, 'Unknown')
		END AS queue,
		--
		q.cdr_started_at,
		q.cdr_ended_at,
		EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at)) AS ringing_duration,
		q.termination_reason_details = 'callback_requested' AS has_qcb,
		cbi.cdr_answered_at IS NOT NULL AS qcb_is_answered,
		cbi.cdr_started_at AS qcb_started_at,
		EXTRACT(EPOCH FROM (cbi.cdr_started_at - q.cdr_ended_at)) AS qcb_delay_duration,
		CASE WHEN cbi.cdr_answered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (cbi.cdr_ended_at - cbi.cdr_answered_at)) END AS qcb_talking_duration,
		CASE WHEN cbi.cdr_id IS NOT NULL THEN
			CASE
				WHEN cbi.source_entity_type = 'external_line'
					THEN cbi.source_participant_phone_number || ' ' || coalesce(cbi.source_dn_name, 'Unknown')
				ELSE cbi.source_dn_number || ' ' || coalesce(cbi.source_dn_name, 'Unknown')
			END
		END AS qcb_source_participant,
		cbi.cdr_id AS qcb_cdr_id,
		CASE
			WHEN NOT (
				q.termination_reason IN ('continued_in', 'redirected') AND (
					-- Ring-Group-Polling: zu Extension weitergeleitet und dort beantwortet
					(q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension')
					OR
					-- Zu nächster Warteschlange weitergeleitet → nicht als abgebrochen zählen
					next_queue_cdr.cdr_id IS NOT NULL
				)
			)
				THEN TRUE
		END AS is_missed,
		CASE
			WHEN NOT (
				q.termination_reason IN ('continued_in', 'redirected') AND (
					(q.termination_reason_details = 'polling' AND continued_in_cdr.cdr_id IS NOT NULL AND continued_in_cdr.cdr_answered_at IS NOT NULL AND continued_in_cdr.destination_entity_type = 'extension')
					OR next_queue_cdr.cdr_id IS NOT NULL
				)
			)
				THEN
					(
						SELECT xcb.cdr_id
						FROM public.cdroutput AS xcb
						WHERE xcb.cdr_id > q.cdr_id
						AND xcb.destination_entity_type = q.source_entity_type
						AND
						(
							xcb.destination_entity_type = 'external_line' AND xcb.destination_participant_phone_number = q.source_participant_phone_number
							OR
							xcb.destination_dn_number = q.source_dn_number
						)
						AND xcb.source_entity_type = 'extension'
						-- Rückruf innerhalb von 24 Stunden nach verpasstem Anruf
						AND EXTRACT(EPOCH FROM (xcb.cdr_started_at - q.cdr_ended_at)) <= 86400
						AND xcb.source_dn_number IN (
							SELECT
								c.destination_dn_number
							FROM public.cdroutput AS c
							WHERE c.originating_cdr_id = q.cdr_id
							AND c.creation_forward_reason = 'polling'
							AND c.destination_entity_type = 'extension'
						)
						-- Nur den ersten Rückruf
						ORDER BY xcb.cdr_id
						LIMIT 1
					)
		END AS xcb_cdr_id
	FROM public.cdroutput AS q
	LEFT JOIN public.cdroutput AS continued_in_cdr ON
		continued_in_cdr.cdr_id = q.continued_in_cdr_id
		AND continued_in_cdr.creation_forward_reason = 'polling'
	LEFT JOIN public.cdroutput AS next_queue_cdr ON
		next_queue_cdr.cdr_id = q.continued_in_cdr_id
		AND next_queue_cdr.destination_dn_type = 'queue'
	LEFT JOIN public.cdroutput AS qcb ON
		qcb.cdr_id = q.continued_in_cdr_id
		AND qcb.creation_forward_reason = 'callback_requested'
		AND qcb.destination_dn_number = 'QCB'
	LEFT JOIN public.cdroutput AS cb ON
	    cb.cdr_id = qcb.continued_in_cdr_id
	    AND cb.source_dn_number = 'QCB'
	    AND cb.continued_in_cdr_id IS NOT NULL
		AND cb.termination_reason_details = 'callback'
	LEFT JOIN public.cdroutput AS cbi ON
    	cbi.cdr_id = cb.continued_in_cdr_id
		AND cbi.creation_method = 'route_to'
	WHERE q.cdr_started_at >= $1 AND q.cdr_started_at <= $2
	
	AND q.destination_dn_type = 'queue'
),
qxcb AS (
	SELECT
		q.cdr_id AS q_cdr_id,
		q.main_call_history_id,
		q.source_participant,
		q.did,
		q.queue,
		q.cdr_started_at AS started_at,
		q.cdr_ended_at AS ended_at,
		CASE
			WHEN q.qcb_is_answered
				THEN q.qcb_started_at
			ELSE xcb.cdr_started_at
		END AS xcb_started_at,
		CASE
			WHEN q.qcb_is_answered
			 THEN q.qcb_source_participant
			ELSE
				CASE
					WHEN xcb.source_entity_type = 'external_line'
						THEN xcb.source_participant_phone_number || ' ' || coalesce(xcb.source_dn_name, 'Unknown')
					ELSE xcb.source_dn_number || ' ' || coalesce(xcb.source_dn_name, 'Unknown')
				END
		END AS xcb_source_participant,
		'✅' AS xcb_made,
		CASE
			WHEN q.qcb_is_answered
				THEN q.qcb_delay_duration
			ELSE EXTRACT(EPOCH FROM (xcb.cdr_started_at - q.cdr_ended_at))
		END AS xcb_delay_duration,
		CASE
			WHEN q.has_qcb AND q.qcb_is_answered THEN '✅ Succeeded'
			WHEN q.has_qcb AND NOT q.qcb_is_answered AND xcb.cdr_answered_at IS NOT NULL THEN '✅ Failed, succeeded later'
			WHEN xcb.cdr_answered_at IS NOT NULL THEN '✅ Succeeded later'
			ELSE '⚠️ Failed, abandoned'
		END AS xcb_status,
		CASE WHEN q.has_qcb THEN 'QCB' ELSE 'MCB' END AS xcb_type,
		CASE
			WHEN q.qcb_is_answered
				THEN q.qcb_talking_duration
			WHEN xcb.cdr_answered_at IS NOT NULL
				THEN EXTRACT(EPOCH FROM (xcb.cdr_ended_at - xcb.cdr_answered_at))
		END AS xcb_talking_duration,
		CASE
			WHEN q.qcb_is_answered OR xcb.cdr_answered_at IS NOT NULL
				THEN CAST(NULL AS boolean)
		END AS is_abandoned,
		CASE WHEN xcb_qcb.termination_reason_details != 'callback' THEN xcb.cdr_id END AS mcb_cdr_id,
		CASE WHEN xcb_qcb.cdr_id IS NULL OR xcb_qcb.termination_reason_details = 'callback' THEN 'QCB' ELSE 'MCB' END AS xcb_final_type,
		q.is_missed
	FROM q
	LEFT JOIN public.cdroutput AS xcb ON
		xcb.cdr_id = q.xcb_cdr_id
	LEFT JOIN public.cdroutput AS xcb_qcb ON
		xcb_qcb.cdr_id = xcb.base_cdr_id
	WHERE (q.has_qcb AND xcb.cdr_id IS NULL)
	OR (q.has_qcb AND q.qcb_is_answered) 
	OR xcb.source_dn_number IN (
		SELECT
			c.destination_dn_number
		FROM public.cdroutput AS c
		WHERE c.originating_cdr_id = q.cdr_id
		AND c.creation_forward_reason = 'polling'
		AND c.destination_entity_type = 'extension'
	)
)
SELECT
	q.main_call_history_id,
	q.source_participant,
	q.did,
	q.queue,
	q.started_at,
	q.ended_at,
	q.xcb_started_at,
	q.xcb_source_participant,
	q.xcb_made,
	q.xcb_delay_duration,
	q.xcb_status,
	q.xcb_type,
	q.xcb_talking_duration,
	q.is_abandoned,
	q.mcb_cdr_id,
	q.xcb_final_type,
	q.is_missed,
	CASE WHEN q.xcb_delay_duration < 5 * 60 THEN 1 ELSE 0 END AS xcb_delay_duration_limit_5,
	CASE WHEN q.xcb_delay_duration >= 5 * 60 AND q.xcb_delay_duration < 10 * 60 THEN 1 ELSE 0 END AS xcb_delay_duration_limit_10,
	CASE WHEN q.xcb_delay_duration >= 10 * 60 AND q.xcb_delay_duration < 15 * 60 THEN 1 ELSE 0 END AS xcb_delay_duration_limit_15,
	CASE WHEN q.xcb_delay_duration >= 15 * 60 AND q.xcb_delay_duration < 20 * 60 THEN 1 ELSE 0 END AS xcb_delay_duration_limit_20,
	CASE WHEN q.xcb_delay_duration >= 20 * 60 THEN 1 ELSE 0 END AS xcb_delay_duration_limit_more_20
FROM qxcb AS q
UNION ALL
SELECT
	q.main_call_history_id,
	q.source_participant,
	q.did,
	q.queue,
	q.cdr_started_at AS started_at,
	q.cdr_ended_at AS ended_at,
	CAST(NULL AS timestamptz) AS xcb_started_at,
	CAST(NULL AS varchar) AS xcb_source_participant,
	'❌' AS xcb_made,
	CAST(NULL AS integer) AS xcb_delay_duration,
	'❌ No callbacks, abandoned' AS xcb_status,
	CAST(NULL AS varchar) AS xcb_type,
	CAST(NULL AS integer) AS xcb_talking_duration,
	q.is_missed AS is_abandoned,
	CAST(NULL AS uuid) AS mcb_cdr_id,
	CAST(NULL AS varchar) AS xcb_final_type,
	q.is_missed,
	0 AS xcb_delay_duration_limit_5,
	0 AS xcb_delay_duration_limit_10,
	0 AS xcb_delay_duration_limit_15,
	0 AS xcb_delay_duration_limit_20,
	0 AS xcb_delay_duration_limit_more_20
FROM q
WHERE q.cdr_id NOT IN (
	SELECT q_cdr_id FROM qxcb
)
ORDER BY started_at DESC
;`,
    },
  ],
  extensions: [
    {
      key: "extension_statistics",
      title: "Nebenstellen-Statistik",
      type: "table",
      sql: `WITH cdrs AS (
  SELECT
    c.*
  FROM public.cdroutput AS c
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
  AND c.creation_method NOT IN ('barge_in', 'barge_in_listen', 'barge_in_whisper')	-- Exclude bargein calls
  AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL)		  -- Exclude polling
  AND NOT (c.source_entity_type = 'ivr' AND c.source_dn_number = 'MakeCall')			  -- Don't calc MakeCall calls
  AND c.destination_entity_type NOT IN ('endcall', 'unknown')							          -- Don't calc EndCall/Unknown calls
  AND c.source_entity_type NOT IN ('endcall', 'unknown')								            -- Don't calc EndCall/Unknown calls
),
member_participants AS (
  SELECT
    c.dn,
    c.participant_id,
    MAX(c.dn_name) AS dn_name,
    BOOL_OR(c.is_incoming) AS is_incoming -- Changed for PostgreSQL (assuming is_incoming is boolean)
  FROM (
    SELECT
      c.source_dn_number AS dn,
      c.source_dn_name AS dn_name,
      c.source_participant_id AS participant_id,
      c.source_participant_is_incoming AS is_incoming
    FROM cdrs AS c
    WHERE source_entity_type = 'extension'
    UNION ALL
    SELECT
      c.destination_dn_number AS dn,
      c.destination_dn_name AS dn_name,
      c.destination_participant_id AS participant_id,
      c.destination_participant_is_incoming AS is_incoming
    FROM cdrs AS c
    WHERE destination_entity_type = 'extension'
  ) AS c
  GROUP BY c.dn, c.participant_id
),
outgoing_calls_all AS (
	SELECT
		mp.*,
		c.destination_entity_type,
		COALESCE(a1.is_answered, a2.is_answered, FALSE) AS is_answered
	FROM member_participants AS mp
	INNER JOIN cdrs AS c ON
		c.source_participant_id = mp.participant_id
		AND c.creation_method = 'call_init'
	LEFT JOIN (
		SELECT
			cdrs.source_participant_id AS participant_id,
			CASE WHEN max(cdrs.cdr_answered_at) IS NOT NULL THEN TRUE ELSE FALSE END AS is_answered
		FROM cdrs
		WHERE cdrs.cdr_answered_at IS NOT NULL
		AND cdrs.destination_entity_type NOT IN ('ring_group_ring_all', 'ring_group_hunt', 'queue')
		GROUP BY cdrs.source_participant_id
	) AS a1 ON
		a1.participant_id = mp.participant_id
	LEFT JOIN (
		SELECT
			cdrs.destination_participant_id AS participant_id,
			CASE WHEN max(cdrs.cdr_answered_at) IS NOT NULL THEN TRUE ELSE FALSE END AS is_answered
		FROM cdrs
		WHERE cdrs.cdr_answered_at IS NOT NULL
		AND cdrs.source_entity_type NOT IN ('ring_group_ring_all', 'ring_group_hunt', 'queue')
		GROUP BY cdrs.destination_participant_id
	) AS a2 ON
		a2.participant_id = mp.participant_id
),
outgoing_calls AS (
  SELECT
    oc.dn,
    MAX(oc.dn_name) AS dn_name,
    COUNT(oc.dn) FILTER (WHERE oc.is_answered) AS answered_calls_count, -- Changed COUNTIF
    COUNT(oc.dn) FILTER (WHERE NOT oc.is_answered) AS unanswered_calls_count -- Changed COUNTIF
  FROM outgoing_calls_all AS oc
  GROUP BY oc.dn
),
incoming_calls AS (
	SELECT
		ic.dn,
    MAX(ic.dn_name) AS dn_name,
		SUM(CASE WHEN ic.is_answered THEN 1 ELSE 0 END) AS answered_calls_count,
		SUM(CASE WHEN NOT ic.is_answered THEN 1 ELSE 0 END) AS unanswered_calls_count
	FROM (
		SELECT
			mp.*,
			COALESCE(a1.is_answered, a2.is_answered, FALSE) AS is_answered
		FROM member_participants AS mp
		LEFT JOIN outgoing_calls_all AS oc ON
			oc.participant_id = mp.participant_id
		LEFT JOIN (
			SELECT
				cdrs.source_participant_id AS participant_id,
				CASE WHEN max(cdrs.cdr_answered_at) IS NOT NULL THEN TRUE ELSE FALSE END AS is_answered
			FROM cdrs
			WHERE cdrs.cdr_answered_at IS NOT NULL
			GROUP BY cdrs.source_participant_id
		) AS a1 ON
			a1.participant_id = mp.participant_id
		LEFT JOIN (
			SELECT
				cdrs.destination_participant_id AS participant_id,
				CASE WHEN max(cdrs.cdr_answered_at) IS NOT NULL THEN TRUE ELSE FALSE END AS is_answered
			FROM cdrs
			WHERE cdrs.cdr_answered_at IS NOT NULL
			GROUP BY cdrs.destination_participant_id
		) AS a2 ON
			a2.participant_id = mp.participant_id
		WHERE oc.participant_id IS NULL
	) AS ic
	GROUP BY ic.dn
),
talking_times AS (
  SELECT
    c.dn,
    SUM(c.talking_dur_sec) AS talking_dur_sec
  FROM (
    SELECT 
      c.source_dn_number AS dn,
      EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) AS talking_dur_sec -- Changed TIMESTAMP_DIFF
    FROM cdrs AS c
    WHERE c.cdr_answered_at IS NOT NULL AND c.source_entity_type = 'extension'
    
    UNION ALL
    
    SELECT 
      c.destination_dn_number AS dn,
      EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) AS talking_dur_sec -- Changed TIMESTAMP_DIFF
    FROM cdrs AS c
    WHERE c.cdr_answered_at IS NOT NULL AND c.destination_entity_type = 'extension'
  ) AS c
  GROUP BY c.dn
)
SELECT
  MAX(COALESCE(oc.dn, ic.dn) || ' ' || COALESCE(oc.dn_name, ic.dn_name)) AS extension,
  COALESCE(MAX(ic.answered_calls_count), 0) AS inbound_answered,
  COALESCE(MAX(ic.unanswered_calls_count), 0) AS inbound_unanswered,
  COALESCE(MAX(oc.answered_calls_count), 0) AS outbound_answered,
  COALESCE(MAX(oc.unanswered_calls_count), 0) AS outbound_unanswered,
  COALESCE(MAX(ic.answered_calls_count), 0) + COALESCE(MAX(oc.answered_calls_count), 0) AS total_answered,
  COALESCE(MAX(ic.unanswered_calls_count), 0) + COALESCE(MAX(oc.unanswered_calls_count), 0) AS total_unanswered,
  COALESCE(MAX(t.talking_dur_sec), 0) AS total_talking_sec
FROM outgoing_calls AS oc
FULL JOIN incoming_calls AS ic ON
  ic.dn = oc.dn
LEFT JOIN talking_times AS t ON
  COALESCE(oc.dn, ic.dn) = t.dn
GROUP BY COALESCE(oc.dn, ic.dn)
ORDER BY extension;`,
    },
  ],
  inbound: [
    {
      key: "calls_received",
      title: "Empfangene Anrufe",
      type: "stat",
      sql: `-------------------------------
-- Inbound answered connections
-------------------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND
	(
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type = 'inbound_routing'
			AND c.source_participant_is_incoming = TRUE
			AND c.termination_reason != 'continued_in'
		)
		OR
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type NOT IN ('inbound_routing', 'outbound_rule') 
			AND c.source_participant_is_incoming = TRUE
		)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0) AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	--AND c.cdr_answered_at IS NOT NULL
)
SELECT
	COUNT(DISTINCT c.main_call_history_id) AS calls_received,
	COUNT(DISTINCT CASE WHEN c.talking_duration > 0 THEN c.main_call_history_id END) AS calls_answered,
	COUNT(DISTINCT CASE WHEN c.talking_duration > 0 THEN c.main_call_history_id END) * 100.0 / 
		CASE WHEN COUNT(DISTINCT c.main_call_history_id) = 0 THEN 1 ELSE COUNT(DISTINCT c.main_call_history_id) END AS calls_answered_percent,
	COUNT(DISTINCT c.main_call_history_id) - COUNT(DISTINCT CASE WHEN c.talking_duration > 0 THEN c.main_call_history_id END) AS calls_unanswered,
	SUM(c.talking_duration) AS talking_duration,
	SUM(c.talking_duration) / CASE WHEN COUNT(DISTINCT c.main_call_history_id) = 0 THEN 1 ELSE COUNT(DISTINCT c.main_call_history_id) END AS avg_talking_duration,
	SUM(c.duration) / CASE WHEN COUNT(DISTINCT c.main_call_history_id) = 0 THEN 1 ELSE COUNT(DISTINCT c.main_call_history_id) END AS avg_duration,
	SUM(c.duration) AS duration
FROM inbound_connections AS c
;`,
    },
    {
      key: "calls_by_did",
      title: "Anrufe nach Rufnummer",
      type: "piechart",
      sql: `-------------------------------
-- Inbound answered connections
-------------------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		c.main_call_history_id,
		coalesce(c.source_participant_trunk_did, 'Unknown') AS did
	FROM public.cdroutput AS c
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND
	(
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type = 'inbound_routing'
			AND c.source_participant_is_incoming = TRUE
			AND c.termination_reason != 'continued_in'
		)
		OR
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type NOT IN ('inbound_routing', 'outbound_rule') 
			AND c.source_participant_is_incoming = TRUE
		)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		c.main_call_history_id,
		coalesce(c.destination_participant_trunk_did, 'Unknown') AS did
	FROM public.cdroutput AS c
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	--AND c.cdr_answered_at IS NOT NULL
)
SELECT
	c.did,
	count(DISTINCT c.main_call_history_id) AS calls
FROM inbound_connections AS c
GROUP BY c.did
ORDER BY calls DESC
;`,
    },
    {
      key: "inbound_calls_over_time",
      title: "Eingehende Anrufe über Zeit",
      type: "timeseries",
      sql: `----------------------
-- Inbound connections
----------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		c.main_call_history_id,
		c.source_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at
	FROM public.cdroutput AS c
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND
	(
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type = 'inbound_routing'
			AND c.source_participant_is_incoming = TRUE
			AND c.termination_reason != 'continued_in'
		)
		OR
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type NOT IN ('inbound_routing', 'outbound_rule') 
			AND c.source_participant_is_incoming = TRUE
		)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
	GROUP BY c.main_call_history_id, participant_id
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		c.main_call_history_id,
		c.destination_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	--AND c.cdr_answered_at IS NOT NULL
	GROUP BY c.main_call_history_id, participant_id
)
SELECT
	date_trunc('hour', i.started_at) AS time_bucket,
	COUNT(DISTINCT i.participant_id) AS calls
FROM inbound_connections AS i
GROUP BY time_bucket
ORDER BY time_bucket
;`,
    },
    {
      key: "top_called_extensions",
      title: "Meistangerufene Nebenstellen",
      type: "barchart",
      sql: `----------------------
-- Inbound connections
----------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		--c.main_call_history_id,
    c.destination_participant_id AS extension_participant_id,
		max(CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END) AS extension
	FROM public.cdroutput AS c
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND
	(
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type = 'inbound_routing'
			AND c.source_participant_is_incoming = TRUE
			AND c.termination_reason != 'continued_in'
		)
		OR
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type NOT IN ('inbound_routing', 'outbound_rule') 
			AND c.source_participant_is_incoming = TRUE
		)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
  GROUP BY extension_participant_id
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		--c.main_call_history_id,
    c.source_participant_id AS extension_participant_id,
		max(CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END) AS extension
	FROM public.cdroutput AS c
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	--AND c.cdr_answered_at IS NOT NULL
	GROUP BY extension_participant_id
)
SELECT
	i.extension,
	count(DISTINCT i.extension_participant_id) AS calls
FROM inbound_connections AS i
GROUP BY extension
ORDER BY calls DESC
LIMIT 10
;`,
    },
    {
      key: "inbound_calls_list",
      title: "Liste Eingehender Anrufe",
      type: "table",
      sql: `----------------------
-- Inbound connections
----------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS source_participant,
		--
		coalesce(c.source_participant_trunk_did, 'Unknown') AS did,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	LEFT JOIN public.cdrbilling AS b ON
		b.cdr_id = c.cdr_id
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND
	(
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type = 'inbound_routing'
			AND c.source_participant_is_incoming = TRUE
			AND c.termination_reason != 'continued_in'
		)
		OR
		(	
			c.source_entity_type = 'external_line' 
			AND c.destination_entity_type NOT IN ('inbound_routing', 'outbound_rule') 
			AND c.source_participant_is_incoming = TRUE
		)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS source_participant,
		--
		coalesce(c.destination_participant_trunk_did, 'Unknown') AS did,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0) AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	LEFT JOIN public.cdrbilling AS b ON
		b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	--AND c.cdr_answered_at IS NOT NULL
),
stat AS (
	SELECT
		ROW_NUMBER() OVER(ORDER BY c.started_at DESC) AS id1,
		CASE WHEN (ROW_NUMBER() OVER(PARTITION BY c.main_call_history_id ORDER BY c.started_at DESC) - 1) > 0 THEN 1 ELSE 0 END AS id2,
		*
	FROM inbound_connections AS c
)
SELECT
	(c.id1 - SUM(c.id2) OVER(ORDER BY c.started_at DESC)) % 2 AS gen_call_id,
	-- c.main_call_history_id,
	c.source_participant,
	c.did,
	c.destination_participant,
	c.started_at,
	c.answered_at,
	c.ended_at,
	c.duration,
	c.ringing_duration,
	c.talking_duration,
	c.bill_cost
FROM stat AS c
ORDER BY c.started_at DESC
;`,
    },
  ],
  outbound: [
    {
      key: "calls_made",
      title: "Geführte Ausgehende Anrufe",
      type: "stat",
      sql: `-----------------------
-- Outbound connections
-----------------------
WITH outbound_connections AS (
	--------------
	-- Destination
	--------------
	SELECT
		c.destination_participant_id AS participant_id,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END AS talking_duration
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND 
	(
		(c.destination_entity_type = 'outbound_rule' AND c.destination_participant_is_incoming = FALSE AND c.termination_reason NOT IN ('cancelled', 'continued_in', 'rejected', 'src_participant_terminated', 'dst_participant_terminated'))
		OR
		(c.destination_entity_type = 'external_line' AND c.destination_participant_is_incoming = FALSE)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
	UNION ALL
	--------------
	-- Source
	--------------
	SELECT
		c.source_participant_id AS participant_id,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0) AS talking_duration
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.source_entity_type = 'external_line'
	AND c.source_participant_is_incoming = FALSE
	--AND c.cdr_answered_at IS NOT NULL
)
SELECT
	COUNT(DISTINCT c.participant_id) AS calls_received,
	COUNT(DISTINCT CASE WHEN c.talking_duration > 0 THEN c.participant_id END) AS calls_answered,
	COUNT(DISTINCT CASE WHEN c.talking_duration > 0 THEN c.participant_id END) * 100.0 / 
		CASE WHEN COUNT(DISTINCT c.participant_id) = 0 THEN 1 ELSE COUNT(DISTINCT c.participant_id) END AS calls_answered_percent,
	COUNT(DISTINCT c.participant_id) - COUNT(DISTINCT CASE WHEN c.talking_duration > 0 THEN c.participant_id END) AS calls_unanswered,
	SUM(c.talking_duration) AS talking_duration,
	SUM(c.talking_duration) / CASE WHEN COUNT(DISTINCT c.participant_id) = 0 THEN 1 ELSE COUNT(DISTINCT c.participant_id) END AS avg_talking_duration,
	SUM(c.duration) / CASE WHEN COUNT(DISTINCT c.participant_id) = 0 THEN 1 ELSE COUNT(DISTINCT c.participant_id) END AS avg_duration,
	SUM(c.duration) AS duration
FROM outbound_connections AS c
;`,
    },
    {
      key: "outbound_calls_over_time",
      title: "Ausgehende Anrufe über Zeit",
      type: "timeseries",
      sql: `-----------------------
-- Outbound connections
-----------------------
WITH outbound_connections AS (
	--------------
	-- Destination
	--------------
	SELECT
		c.destination_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at
	FROM public.cdroutput AS c
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND 
	(
		(c.destination_entity_type = 'outbound_rule' AND c.destination_participant_is_incoming = FALSE AND c.termination_reason NOT IN ('cancelled', 'continued_in', 'rejected', 'src_participant_terminated', 'dst_participant_terminated'))
		OR
		(c.destination_entity_type = 'external_line' AND c.destination_participant_is_incoming = FALSE)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
	GROUP BY participant_id
	UNION ALL
	---------
	-- Source
	---------
	SELECT
		c.source_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.source_entity_type = 'external_line'
	AND c.source_participant_is_incoming = FALSE
	--AND c.cdr_answered_at IS NOT NULL
	GROUP BY participant_id
)
SELECT
	date_trunc('hour', i.started_at) AS time_bucket,
	COUNT(DISTINCT i.participant_id) AS calls
FROM outbound_connections AS i
GROUP BY time_bucket
ORDER BY time_bucket
;`,
    },
    {
      key: "top_caller_extensions",
      title: "Meistanrufende Nebenstellen",
      type: "barchart",
      sql: `-----------------------
-- Outbound connections
-----------------------
WITH outbound_connections AS (
	--------------
	-- Destination
	--------------
	SELECT
    c.destination_participant_id AS extension_participant_id,
		max(CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END) AS extension
	FROM public.cdroutput AS c
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND 
	(
		(c.destination_entity_type = 'outbound_rule' AND c.destination_participant_is_incoming = FALSE AND c.termination_reason NOT IN ('cancelled', 'continued_in', 'rejected', 'src_participant_terminated', 'dst_participant_terminated'))
		OR
		(c.destination_entity_type = 'external_line' AND c.destination_participant_is_incoming = FALSE)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
  GROUP BY extension_participant_id
	UNION ALL
	---------
	-- Source
	---------
	SELECT
    c.source_participant_id AS extension_participant_id,
		max(CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END) AS extension
	FROM public.cdroutput AS c
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.source_entity_type = 'external_line'
	AND c.source_participant_is_incoming = FALSE
	--AND c.cdr_answered_at IS NOT NULL
	GROUP BY extension_participant_id
)
SELECT
	o.extension,
	count(DISTINCT o.extension_participant_id) AS calls
FROM outbound_connections AS o
GROUP BY extension
ORDER BY calls DESC
LIMIT 10
;`,
    },
    {
      key: "outbound_calls",
      title: "Ausgehende Anrufe",
      type: "table",
      sql: `-----------------------
-- Outbound connections
-----------------------
WITH outbound_connections AS (
	--------------
	-- Destination
	--------------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END AS talking_duration,
		round(coalesce(CAST(b.destination_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.destination_bill_duration AS INTERVAL)) / 60, 0.00), 2) AS bill_cost
	FROM public.cdroutput AS c
	LEFT JOIN public.cdrbilling AS b ON
		b.cdr_id = c.cdr_id
	LEFT JOIN public.cdroutput AS c_orig ON
		c_orig.cdr_id = c.originating_cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND 
	(
		(c.destination_entity_type = 'outbound_rule' AND c.destination_participant_is_incoming = FALSE AND c.termination_reason NOT IN ('cancelled', 'continued_in', 'rejected', 'src_participant_terminated', 'dst_participant_terminated'))
		OR
		(c.destination_entity_type = 'external_line' AND c.destination_participant_is_incoming = FALSE)
	)
	AND NOT (c.creation_forward_reason = 'polling' AND c.cdr_answered_at IS NULL AND c_orig.destination_entity_type IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue'))		-- Exclude polling
	--AND c.cdr_answered_at IS NOT NULL
	UNION ALL
	--------------
	-- Source
	--------------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at AS answered_at,
		c.cdr_ended_at AS ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		EXTRACT(EPOCH FROM (coalesce(c.cdr_answered_at, c.cdr_ended_at) - c.cdr_started_at)) AS ringing_duration,
		coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0) AS talking_duration,
		round(coalesce(CAST(b.source_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.source_bill_duration AS INTERVAL)) / 60, 0.00), 2) AS bill_cost
	FROM public.cdroutput AS c
	LEFT JOIN public.cdrbilling AS b ON
		b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.source_entity_type = 'external_line'
	AND c.source_participant_is_incoming = FALSE
	--AND c.cdr_answered_at IS NOT NULL
),
stat AS (
	SELECT
		ROW_NUMBER() OVER(ORDER BY c.started_at DESC) AS id1,
		CASE WHEN (ROW_NUMBER() OVER(PARTITION BY c.main_call_history_id ORDER BY c.started_at DESC) - 1) > 0 THEN 1 ELSE 0 END AS id2,
		*
	FROM outbound_connections AS c
)
SELECT
	(c.id1 - SUM(c.id2) OVER(ORDER BY c.started_at DESC)) % 2 AS gen_call_id,
	-- c.main_call_history_id,
	c.source_participant,
	c.destination_participant,
	c.started_at,
	c.answered_at,
	c.ended_at,
	c.duration,
	c.ringing_duration,
	c.talking_duration,
	c.bill_cost
FROM stat AS c
ORDER BY c.started_at DESC;`,
    },
  ],
  inboundOutbound: [
    {
      key: "total_calls",
      title: "Gesamte Anrufe",
      type: "stat",
      sql: `-------------------------------
-- Inbound answered connections
-------------------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		c.source_participant_id AS participant_id,
    min(c.cdr_started_at) AS started_at,
		sum(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at))) AS duration,
		sum(CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END) AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.source_entity_type = 'external_line'
	AND c.source_participant_is_incoming
	AND c.cdr_answered_at IS NOT NULL
	GROUP BY c.source_participant_id
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		c.destination_participant_id AS participant_id,
    min(c.cdr_started_at) AS started_at,
		sum(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at))) AS duration,
		sum(coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0)) AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	AND c.cdr_answered_at IS NOT NULL
	GROUP BY participant_id
),
--------------------------------
-- Outbound answered connections
--------------------------------
outbound_connections AS (
  --------------
  -- Destination
  --------------
  SELECT
    c.destination_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at,
		EXTRACT(EPOCH FROM (max(c.cdr_ended_at) - min(c.cdr_started_at))) AS duration,
		sum(coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0)) AS talking_duration,
    sum(
      round(coalesce(CAST(b.destination_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.destination_bill_duration AS INTERVAL)) / 60, 0.00), 2)
    ) AS bill_cost
  FROM public.cdroutput AS c
  LEFT JOIN public.cdrbilling AS b ON
    b.cdr_id = c.cdr_id
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
  AND c.destination_entity_type = 'external_line'
  AND c.destination_participant_is_incoming = FALSE
  AND c.cdr_answered_at IS NOT NULL
  GROUP BY c.destination_participant_id
  UNION ALL
  ---------
  -- Source
  ---------
  SELECT
    c.source_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at,
		EXTRACT(EPOCH FROM (max(c.cdr_ended_at) - min(c.cdr_started_at))) AS duration,
		sum(CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END) AS talking_duration,
    sum(
      round(coalesce(CAST(b.source_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.source_bill_duration AS INTERVAL)) / 60, 0.00), 2)
    ) AS bill_cost
  FROM public.cdroutput AS c
  LEFT JOIN public.cdrbilling AS b ON
    b.cdr_id = c.cdr_id
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
  AND c.source_entity_type = 'external_line'
  AND c.source_participant_is_incoming = FALSE
  AND c.cdr_answered_at IS NOT NULL
  GROUP BY c.source_participant_id
),
-- Inbound statistics
inbound_stat AS (
	SELECT
		0 AS direction_id,
		'in' AS direction,
		date_trunc('hour', i.started_at) AS time_bucket,
		count(DISTINCT i.participant_id) AS connections_count,
		sum(i.duration) AS duration,
		sum(i.talking_duration) AS talking_duration,
		sum(i.bill_cost) AS bill_cost
	FROM inbound_connections AS i
	GROUP BY time_bucket
),
-- Outbound statistics
outbound_stat AS (
	SELECT
		1 AS direction_id,
		'out' AS direction,
		date_trunc('hour', o.started_at) AS time_bucket,
		count(DISTINCT o.participant_id) AS connections_count,
		sum(o.duration) AS duration,
		sum(o.talking_duration) AS talking_duration,
		sum(o.bill_cost) AS bill_cost
	FROM outbound_connections AS o
	GROUP BY time_bucket
)
SELECT
	coalesce(i.time_bucket, o.time_bucket) AS time_bucket,
	coalesce(i.connections_count, 0) + coalesce(o.connections_count, 0) AS connections_count,
	coalesce(i.connections_count, 0) AS inbound_connections_count,
	coalesce(i.duration, 0) AS inbound_duration,
	coalesce(i.talking_duration, 0) AS inbound_talking_duration,
	coalesce(i.bill_cost, 0.00) AS inbound_bill_cost,
	coalesce(o.connections_count, 0) AS outbound_connections_count,
	coalesce(o.duration, 0) AS outbound_duration,
	coalesce(o.talking_duration, 0) AS outbound_talking_duration,
	coalesce(o.bill_cost, 0.00) AS outbound_bill_cost
FROM inbound_stat AS i
FULL JOIN outbound_stat AS o ON
	o.time_bucket = i.time_bucket
ORDER BY coalesce(i.time_bucket, o.time_bucket)
;`,
    },
    {
      key: "inbound_call_duration",
      title: "Dauer Eingehender Anrufe",
      type: "piechart",
      sql: `-------------------------------
-- Inbound answered connections
-------------------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		c.source_participant_id AS participant_id,
    min(c.cdr_started_at) AS started_at,
		sum(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at))) AS duration,
		sum(CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END) AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.source_entity_type = 'external_line'
	AND c.source_participant_is_incoming
	AND c.cdr_answered_at IS NOT NULL
	GROUP BY c.source_participant_id
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		c.destination_participant_id AS participant_id,
    min(c.cdr_started_at) AS started_at,
		sum(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at))) AS duration,
		sum(coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0)) AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	AND c.cdr_answered_at IS NOT NULL
	GROUP BY participant_id
),
inbound_stat AS (
	SELECT
		0 AS direction_id,
		'in' AS direction,
		min(i.started_at) AS started_at,
		sum(i.duration) AS duration,
		sum(i.talking_duration) AS talking_duration,
		sum(i.bill_cost) AS bill_cost
	FROM inbound_connections AS i
	GROUP BY i.participant_id
),
inbound_counts AS (
	SELECT
		count(*) AS total_calls,
		count(CASE WHEN i.duration < 60 THEN 1 END) AS less_than_1min,
		count(CASE WHEN i.duration BETWEEN 60 AND 180 THEN 1 END) AS between_1min_and_3mins,
		count(CASE WHEN i.duration > 180 THEN 1 END) AS more_than_3mins
	FROM inbound_stat AS i
)
SELECT
	*,
	100.00 / (CASE WHEN i.total_calls IS NULL OR i.total_calls = 0 THEN 1 ELSE i.total_calls END) * coalesce(i.less_than_1min, 0) AS less_than_1min_perc,
	100.00 / (CASE WHEN i.total_calls IS NULL OR i.total_calls = 0 THEN 1 ELSE i.total_calls END) * coalesce(i.between_1min_and_3mins, 0) AS between_1min_and_3mins_perc,
	100.00 / (CASE WHEN i.total_calls IS NULL OR i.total_calls = 0 THEN 1 ELSE i.total_calls END) * coalesce(i.more_than_3mins, 0) AS more_than_3mins_perc
FROM inbound_counts AS i
;`,
    },
    {
      key: "outbound_call_duration",
      title: "Dauer Ausgehender Anrufe",
      type: "piechart",
      sql: `--------------------------------
-- Outbound answered connections
--------------------------------
WITH outbound_connections AS (
  --------------
  -- Destination
  --------------
  SELECT
    c.destination_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at,
    sum(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at))) AS duration,
		sum(coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0)) AS talking_duration,
    sum(
      round(coalesce(CAST(b.destination_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.destination_bill_duration AS INTERVAL)) / 60, 0.00), 2)
    ) AS bill_cost
  FROM public.cdroutput AS c
  LEFT JOIN public.cdrbilling AS b ON
    b.cdr_id = c.cdr_id
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
  AND c.destination_entity_type = 'external_line'
  AND c.destination_participant_is_incoming = FALSE
  AND c.cdr_answered_at IS NOT NULL
  GROUP BY c.destination_participant_id
  UNION ALL
  ---------
  -- Source
  ---------
  SELECT
    c.source_participant_id AS participant_id,
		min(c.cdr_started_at) AS started_at,
    sum(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at))) AS duration,
		sum(CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END) AS talking_duration,
    sum(
      round(coalesce(CAST(b.source_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.source_bill_duration AS INTERVAL)) / 60, 0.00), 2)
    ) AS bill_cost
  FROM public.cdroutput AS c
  LEFT JOIN public.cdrbilling AS b ON
    b.cdr_id = c.cdr_id
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
  AND c.source_entity_type = 'external_line'
  AND c.source_participant_is_incoming = FALSE
  AND c.cdr_answered_at IS NOT NULL
  GROUP BY c.source_participant_id
),
outbound_stat AS (
	SELECT
		1 AS direction_id,
		'out' AS direction,
		min(o.started_at) AS started_at,
		sum(o.duration) AS duration,
		sum(o.talking_duration) AS talking_duration,
		sum(o.bill_cost) AS bill_cost
	FROM outbound_connections AS o
	GROUP BY o.participant_id
),
outbound_counts AS (
	SELECT
		count(*) AS total_calls,
		count(CASE WHEN o.duration < 60 THEN 1 END) AS less_than_1min,
		count(CASE WHEN o.duration BETWEEN 60 AND 180 THEN 1 END) AS between_1min_and_3mins,
		count(CASE WHEN o.duration > 180 THEN 1 END) AS more_than_3mins,
		sum(CASE WHEN o.bill_cost < 1.00 THEN 1 END) AS cost_less_than_1,
		sum(CASE WHEN o.bill_cost BETWEEN 1.00 AND 2.00 THEN 1 END) AS cost_between_1_and_2,
		sum(CASE WHEN o.bill_cost > 2.00 THEN 1 END) AS cost_more_than_2
	FROM outbound_stat AS o
)
SELECT
	*,
	100.00 / (CASE WHEN o.total_calls IS NULL OR o.total_calls = 0 THEN 1 ELSE o.total_calls END) * coalesce(o.less_than_1min, 0) AS less_than_1min_perc,
	100.00 / (CASE WHEN o.total_calls IS NULL OR o.total_calls = 0 THEN 1 ELSE o.total_calls END) * coalesce(o.between_1min_and_3mins, 0) AS between_1min_and_3mins_perc,
	100.00 / (CASE WHEN o.total_calls IS NULL OR o.total_calls = 0 THEN 1 ELSE o.total_calls END) * coalesce(o.more_than_3mins, 0) AS more_than_3mins_perc,
	100.00 / (CASE WHEN o.total_calls IS NULL OR o.total_calls = 0 THEN 1 ELSE o.total_calls END) * coalesce(o.cost_less_than_1, 0) AS cost_less_than_1_perc,
	100.00 / (CASE WHEN o.total_calls IS NULL OR o.total_calls = 0 THEN 1 ELSE o.total_calls END) * coalesce(o.cost_between_1_and_2, 0) AS cost_between_1_and_2_perc,
	100.00 / (CASE WHEN o.total_calls IS NULL OR o.total_calls = 0 THEN 1 ELSE o.total_calls END) * coalesce(o.cost_more_than_2, 0) AS cost_more_than_2_perc
FROM outbound_counts AS o
;`,
    },
    {
      key: "answered_inbound",
      title: "Angenommene Eingehende",
      type: "table",
      sql: `-------------------------------
-- Inbound answered connections
-------------------------------
WITH inbound_connections AS (
	---------
	-- Source
	---------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at,
		c.cdr_ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		CASE WHEN c.destination_entity_type NOT IN ('group', 'ring_group_ring_all', 'ring_group_hunt', 'queue') THEN EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)) ELSE 0 END AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.source_entity_type = 'external_line'
	AND c.source_participant_is_incoming
	AND c.cdr_answered_at IS NOT NULL
	UNION ALL
	--------------
	-- Destination
	--------------
	SELECT
		c.main_call_history_id,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at,
		c.cdr_ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0) AS talking_duration,
		0.00 AS bill_cost
	FROM public.cdroutput AS c
	-- LEFT JOIN public.cdrbilling AS b ON
	-- 	b.cdr_id = c.cdr_id
	WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
	AND c.destination_entity_type = 'external_line'
	AND c.destination_participant_is_incoming
	AND c.cdr_answered_at IS NOT NULL
)
SELECT *
FROM inbound_connections AS c
ORDER BY c.started_at DESC
;`,
    },
    {
      key: "answered_outbound",
      title: "Angenommene Ausgehende",
      type: "table",
      sql: `--------------------------------
-- Outbound answered connections
--------------------------------
WITH outbound_connections AS (
  --------------
  -- Destination
  --------------
  SELECT
		c.main_call_history_id,
    --
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS source_participant,
		--
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at,
		c.cdr_ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0) AS talking_duration,
    round(coalesce(CAST(b.destination_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.destination_bill_duration AS INTERVAL)) / 60, 0.00), 2) AS bill_cost
  FROM public.cdroutput AS c
  LEFT JOIN public.cdrbilling AS b ON
    b.cdr_id = c.cdr_id
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
  AND c.destination_entity_type = 'external_line'
  AND c.destination_participant_is_incoming = FALSE
  AND c.cdr_answered_at IS NOT NULL
  UNION ALL
  ---------
  -- Source
  ---------
  SELECT
		c.main_call_history_id,
    --
		CASE
			WHEN c.destination_entity_type = 'external_line'
				THEN c.destination_participant_phone_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
			ELSE c.destination_dn_number || ' ' || coalesce(c.destination_dn_name, 'Unknown')
		END AS source_participant,
    --
		CASE
			WHEN c.source_entity_type = 'external_line'
				THEN c.source_participant_phone_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
			ELSE c.source_dn_number || ' ' || coalesce(c.source_dn_name, 'Unknown')
		END AS destination_participant,
		--
    c.cdr_started_at AS started_at,
		c.cdr_answered_at,
		c.cdr_ended_at,
		EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS duration,
		coalesce(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)), 0) AS talking_duration,
		round(coalesce(CAST(b.source_bill_rate AS numeric), 0.00) * coalesce(EXTRACT(EPOCH FROM CAST(b.source_bill_duration AS INTERVAL)) / 60, 0.00), 2) AS bill_cost
  FROM public.cdroutput AS c
  LEFT JOIN public.cdrbilling AS b ON
    b.cdr_id = c.cdr_id
  WHERE c.cdr_started_at >= $1 AND c.cdr_started_at <= $2
  AND c.source_entity_type = 'external_line'
  AND c.source_participant_is_incoming = FALSE
  AND c.cdr_answered_at IS NOT NULL
)
SELECT *
FROM outbound_connections AS c
ORDER BY c.started_at DESC
;`,
    },
  ],
  sla: [
    {
      key: "kpi_sla",
      title: "SLA-Kennzahlen",
      type: "stat",
      sql: `WITH incoming AS (
  SELECT
    q.main_call_history_id,
    q.cdr_id,
    q.cdr_started_at,
    q.cdr_ended_at,
    q.termination_reason,
    q.continued_in_cdr_id,
    EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at)) AS wait_seconds
  FROM public.cdroutput q
  WHERE q.destination_dn_type = 'queue'
    AND q.source_participant_is_incoming = true
    AND q.source_entity_type != 'queue'
    AND q.cdr_started_at >= $1
    AND q.cdr_started_at <= $2
),
direct_answered AS (
  SELECT DISTINCT i.main_call_history_id
  FROM incoming i
  JOIN public.cdroutput q2 ON q2.cdr_id = i.continued_in_cdr_id
    AND q2.destination_dn_type = 'extension'
)
SELECT
  COUNT(*)::int                                                                        AS total_incoming,
  (SELECT COUNT(*)::int FROM direct_answered)                                          AS answered,
  COUNT(*) FILTER (WHERE termination_reason = 'src_participant_terminated')::int      AS abandoned,
  COUNT(*) FILTER (WHERE wait_seconds > 20)::int                                      AS over_20s
FROM incoming;`,
    },
    {
      key: "sla_by_queue",
      title: "SLA nach Warteschlange",
      type: "table",
      sql: `SELECT
  q.destination_dn_number                                                        AS queue_number,
  q.destination_dn_name                                                          AS queue_name,
  COUNT(*)::int                                                                   AS total,
  COUNT(*) FILTER (WHERE q2_ext.cdr_id IS NOT NULL)::int                        AS answered,
  COUNT(*) FILTER (WHERE q.termination_reason = 'src_participant_terminated')::int AS abandoned,
  COUNT(*) FILTER (WHERE wait_seconds > 20)::int                                AS over_20s,
  ROUND(100.0 * COUNT(*) FILTER (WHERE wait_seconds > 20) / NULLIF(COUNT(*), 0), 1) AS over_20s_pct,
  ROUND(AVG(wait_seconds)::numeric, 1)                                          AS avg_wait_seconds
FROM (
  SELECT
    c.destination_dn_number,
    c.destination_dn_name,
    c.termination_reason,
    EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_started_at)) AS wait_seconds,
    (q2.cdr_id IS NOT NULL) AS has_abwurf,
    q2_ext.cdr_id AS q2_ext_cdr_id
  FROM public.cdroutput c
  LEFT JOIN public.cdroutput q2
    ON q2.cdr_id = c.continued_in_cdr_id
    AND q2.destination_dn_type = 'queue'
  LEFT JOIN public.cdroutput q2_ext
    ON q2_ext.cdr_id = c.continued_in_cdr_id
    AND q2_ext.destination_dn_type = 'extension'
  WHERE c.destination_dn_type = 'queue'
    AND c.source_participant_is_incoming = true
    AND c.source_entity_type != 'queue'
    AND c.cdr_started_at >= $1
    AND c.cdr_started_at <= $2
) q
GROUP BY 1, 2
ORDER BY total DESC;`,
    },
    {
      key: "abwurf_funnel",
      title: "Abwurf-Funnel",
      type: "piechart",
      sql: `WITH incoming AS (
  SELECT
    q.main_call_history_id,
    q.cdr_id,
    q.continued_in_cdr_id
  FROM public.cdroutput q
  WHERE q.destination_dn_type = 'queue'
    AND q.source_participant_is_incoming = true
    AND q.source_entity_type != 'queue'
    AND q.cdr_started_at >= $1
    AND q.cdr_started_at <= $2
),
direct_answered AS (
  SELECT DISTINCT i.main_call_history_id
  FROM incoming i
  JOIN public.cdroutput q2 ON q2.cdr_id = i.continued_in_cdr_id
    AND q2.destination_dn_type = 'extension'
),
abwurf1 AS (
  SELECT DISTINCT i.main_call_history_id
  FROM incoming i
  JOIN public.cdroutput q2 ON q2.cdr_id = i.continued_in_cdr_id
    AND q2.destination_dn_type = 'queue'
),
abwurf2 AS (
  SELECT DISTINCT i.main_call_history_id
  FROM incoming i
  JOIN public.cdroutput q2 ON q2.cdr_id = i.continued_in_cdr_id
    AND q2.destination_dn_type = 'queue'
  JOIN public.cdroutput q3 ON q3.cdr_id = q2.continued_in_cdr_id
    AND q3.destination_dn_type = 'queue'
)
SELECT
  'Direkt angenommen' AS kategorie,
  (SELECT COUNT(*)::int FROM direct_answered) AS anzahl
FROM incoming i
UNION ALL
SELECT 'Abwurf 1', (SELECT COUNT(*)::int FROM abwurf1)
UNION ALL
SELECT 'Abwurf 2', (SELECT COUNT(*)::int FROM abwurf2);`,
    },
    {
      key: "hourly_volume",
      title: "Stündliches Anrufaufkommen",
      type: "barchart",
      sql: `SELECT
  date_trunc('hour', c.cdr_started_at)                                            AS hour,
  COUNT(*)::int                                                                     AS total,
  COUNT(q2_ext.cdr_id)::int                                                        AS answered,
  COUNT(*) FILTER (WHERE c.termination_reason = 'src_participant_terminated')::int AS abandoned
FROM public.cdroutput c
LEFT JOIN public.cdroutput q2_ext
  ON q2_ext.cdr_id = c.continued_in_cdr_id
  AND q2_ext.destination_dn_type = 'extension'
WHERE c.destination_dn_type = 'queue'
  AND c.source_participant_is_incoming = true
  AND c.source_entity_type != 'queue'
  AND c.cdr_started_at >= $1
  AND c.cdr_started_at <= $2
GROUP BY 1
ORDER BY 1;`,
    },
    {
      key: "agent_performance",
      title: "Agenten-Performance (Queue)",
      type: "table",
      sql: `SELECT
  c.destination_dn_number                                               AS agent_dn,
  c.destination_dn_name                                                 AS agent_name,
  COUNT(*)::int                                                         AS calls_answered,
  ROUND(AVG(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)))::numeric, 0) AS avg_talk_seconds,
  SUM(EXTRACT(EPOCH FROM (c.cdr_ended_at - c.cdr_answered_at)))::int  AS total_talk_seconds
FROM public.cdroutput c
WHERE c.cdr_started_at >= $1
  AND c.cdr_started_at <= $2
  AND c.destination_dn_type = 'extension'
  AND c.source_entity_type = 'queue'
  AND c.cdr_answered_at IS NOT NULL
GROUP BY 1, 2
ORDER BY calls_answered DESC;`,
    },
  ],
};