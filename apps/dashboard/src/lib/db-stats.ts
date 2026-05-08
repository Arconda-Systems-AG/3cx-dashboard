import { createPool } from "@/lib/pg";
import type { TodayStats } from "@3cx-dash/types";

export interface FullDayStats {
  today: TodayStats;
  stundenverteilung: Record<string, number>;
  queues: Array<{
    name: string;
    anrufe: number;
    angenommen: number;
    abgebrochen: number;
    nicht_in_20s: number;
    avg_wartezeit_s: number;
  }>;
}

function getTodayRange(): { today: Date; now: Date } {
  const nowBerlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const todayBerlin = new Date(nowBerlin.getFullYear(), nowBerlin.getMonth(), nowBerlin.getDate());
  const berlinOffset = new Date().getTime() - new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime();
  return {
    today: new Date(todayBerlin.getTime() + berlinOffset),
    now: new Date(),
  };
}

export async function collectFullDayStats(): Promise<FullDayStats | null> {
  const pool = await createPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    const { today, now } = getTodayRange();
    const p = [today.toISOString(), now.toISOString()];

    // ── KPI (identisch zu /api/stats/today) ──────────────────────────────────
    const kpiSql = `
      WITH incoming_queue_calls AS (
        SELECT DISTINCT ON (q.main_call_history_id)
          q.main_call_history_id, q.cdr_id, q.cdr_started_at,
          q.cdr_ended_at, q.termination_reason, q.continued_in_cdr_id,
          EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at)) AS wait_seconds
        FROM public.cdroutput q
        WHERE q.destination_dn_type = 'queue'
          AND q.source_participant_is_incoming = true
          AND q.cdr_started_at >= $1 AND q.cdr_started_at < $2
          AND q.source_entity_type != 'queue'
        ORDER BY q.main_call_history_id, q.cdr_started_at
      ),
      answered AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput ext ON ext.main_call_history_id = iqc.main_call_history_id
          AND ext.destination_dn_type = 'extension'
      ),
      abwurf1 AS (
        SELECT DISTINCT iqc.main_call_history_id FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.cdr_id = iqc.continued_in_cdr_id AND q2.destination_dn_type = 'queue'
      ),
      abwurf2 AS (
        SELECT DISTINCT iqc.main_call_history_id FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.cdr_id = iqc.continued_in_cdr_id AND q2.destination_dn_type = 'queue'
        JOIN public.cdroutput q3 ON q3.cdr_id = q2.continued_in_cdr_id AND q3.destination_dn_type = 'queue'
      ),
      max_wait AS (
        SELECT destination_dn_name,
          EXTRACT(EPOCH FROM (cdr_ended_at - cdr_started_at)) AS secs
        FROM public.cdroutput
        WHERE destination_dn_type = 'queue' AND source_participant_is_incoming = true
          AND cdr_started_at >= $1 AND cdr_started_at < $2
        ORDER BY secs DESC LIMIT 1
      )
      SELECT
        COUNT(*)::int                                                    AS total_incoming,
        (SELECT COUNT(*)::int FROM answered)                             AS answered,
        (COUNT(*) - (SELECT COUNT(*) FROM answered))::int               AS abandoned,
        COUNT(*) FILTER (WHERE wait_seconds > 20)::int                  AS not_in_20s,
        ROUND(AVG(wait_seconds)::numeric, 0)::int                       AS avg_wait_seconds,
        (SELECT ROUND(secs::numeric, 0)::int FROM max_wait)             AS max_wait_seconds,
        (SELECT destination_dn_name FROM max_wait)                      AS max_wait_queue,
        (SELECT COUNT(*)::int FROM abwurf1)                             AS abwurf1_reached,
        (SELECT COUNT(*)::int FROM abwurf2)                             AS abwurf2_reached
      FROM incoming_queue_calls
    `;

    // ── Stündliche Verteilung ─────────────────────────────────────────────────
    const hourlySql = `
      SELECT
        EXTRACT(HOUR FROM cdr_started_at AT TIME ZONE 'Europe/Berlin')::int AS h,
        COUNT(DISTINCT main_call_history_id)::int AS n
      FROM public.cdroutput
      WHERE destination_dn_type = 'queue'
        AND source_participant_is_incoming = true
        AND source_entity_type != 'queue'
        AND cdr_started_at >= $1 AND cdr_started_at < $2
      GROUP BY 1 ORDER BY 1
    `;

    // ── Pro-Queue-Stats ───────────────────────────────────────────────────────
    const queueSql = `
      WITH incoming AS (
        SELECT DISTINCT ON (q.main_call_history_id)
          q.main_call_history_id, q.destination_dn_name,
          EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at)) AS wait_s
        FROM public.cdroutput q
        WHERE q.destination_dn_type = 'queue'
          AND q.source_participant_is_incoming = true
          AND q.source_entity_type != 'queue'
          AND q.cdr_started_at >= $1 AND q.cdr_started_at < $2
        ORDER BY q.main_call_history_id, q.cdr_started_at
      ),
      answered AS (
        SELECT DISTINCT main_call_history_id FROM public.cdroutput
        WHERE destination_dn_type = 'extension'
          AND cdr_started_at >= $1 AND cdr_started_at < $2
      )
      SELECT
        i.destination_dn_name                                      AS queue,
        COUNT(*)::int                                              AS anrufe,
        COUNT(a.main_call_history_id)::int                         AS angenommen,
        (COUNT(*) - COUNT(a.main_call_history_id))::int            AS abgebrochen,
        COUNT(*) FILTER (WHERE i.wait_s > 20)::int                 AS nicht_in_20s,
        ROUND(AVG(i.wait_s), 0)::int                              AS avg_wait_s
      FROM incoming i
      LEFT JOIN answered a ON a.main_call_history_id = i.main_call_history_id
      GROUP BY i.destination_dn_name
      ORDER BY anrufe DESC
      LIMIT 12
    `;

    const [kpiRes, hourlyRes, queueRes] = await Promise.all([
      client.query(kpiSql, p),
      client.query(hourlySql, p),
      client.query(queueSql, p),
    ]);

    const row = kpiRes.rows[0] ?? {};
    const todayStats: TodayStats = {
      total_incoming: Number(row.total_incoming ?? 0),
      answered: Number(row.answered ?? 0),
      abandoned: Number(row.abandoned ?? 0),
      not_in_20s: Number(row.not_in_20s ?? 0),
      avg_wait_seconds: Number(row.avg_wait_seconds ?? 0),
      max_wait_seconds: Number(row.max_wait_seconds ?? 0),
      max_wait_queue: String(row.max_wait_queue ?? ""),
      abwurf1_reached: Number(row.abwurf1_reached ?? 0),
      abwurf2_reached: Number(row.abwurf2_reached ?? 0),
    };

    const stundenverteilung: Record<string, number> = {};
    for (const r of hourlyRes.rows) stundenverteilung[String(r.h).padStart(2, "0")] = Number(r.n);

    return {
      today: todayStats,
      stundenverteilung,
      queues: queueRes.rows.map((r) => ({
        name: r.queue,
        anrufe: Number(r.anrufe),
        angenommen: Number(r.angenommen),
        abgebrochen: Number(r.abgebrochen),
        nicht_in_20s: Number(r.nicht_in_20s ?? 0),
        avg_wartezeit_s: Number(r.avg_wait_s ?? 0),
      })),
    };
  } catch {
    return null;
  } finally {
    client.release();
    await pool.end();
  }
}
