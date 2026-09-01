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

export async function collectFullDayStats(queueFilter?: string[]): Promise<FullDayStats | null> {
  const pool = await createPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    const { today, now } = getTodayRange();
    const hasFilter = queueFilter && queueFilter.length > 0;
    const p: (string | string[])[] = [today.toISOString(), now.toISOString()];
    if (hasFilter) p.push(queueFilter);

    const filterClause = hasFilter ? " AND q.destination_dn_number = ANY($3::text[])" : "";
    const filterClauseSimple = hasFilter ? " AND destination_dn_number = ANY($3::text[])" : "";

    // ── KPI (identisch zu /api/stats/today) — end-to-end über Overflow-Kaskaden:
    //    Wartezeit = Eingang erste Queue → erste echte Agenten-Annahme (cdr_answered_at).
    const kpiSql = `
      WITH incoming_queue_calls AS (
        SELECT DISTINCT ON (q.main_call_history_id)
          q.main_call_history_id, q.cdr_id, q.cdr_started_at,
          q.destination_dn_name, q.continued_in_cdr_id
        FROM public.cdroutput q
        WHERE q.destination_dn_type = 'queue'
          AND q.source_participant_is_incoming = true
          AND q.cdr_started_at >= $1 AND q.cdr_started_at < $2
          AND q.source_entity_type != 'queue'${filterClause}
        ORDER BY q.main_call_history_id, q.cdr_started_at
      ),
      answers AS (
        SELECT ext.main_call_history_id, MIN(ext.cdr_answered_at) AS answer_ts
        FROM public.cdroutput ext
        JOIN incoming_queue_calls iqc USING (main_call_history_id)
        WHERE ext.destination_dn_type = 'extension'
          AND ext.cdr_answered_at IS NOT NULL
        GROUP BY ext.main_call_history_id
      ),
      waits AS (
        SELECT iqc.main_call_history_id, iqc.destination_dn_name, iqc.continued_in_cdr_id,
               a.answer_ts,
               CASE WHEN a.answer_ts IS NOT NULL AND a.answer_ts >= iqc.cdr_started_at
                    THEN EXTRACT(EPOCH FROM (a.answer_ts - iqc.cdr_started_at)) END AS wait_seconds
        FROM incoming_queue_calls iqc
        LEFT JOIN answers a USING (main_call_history_id)
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
        SELECT destination_dn_name, wait_seconds FROM waits
        WHERE wait_seconds IS NOT NULL
        ORDER BY wait_seconds DESC LIMIT 1
      )
      SELECT
        COUNT(*)::int                                                    AS total_incoming,
        COUNT(answer_ts)::int                                            AS answered,
        (COUNT(*) - COUNT(answer_ts))::int                               AS abandoned,
        (COUNT(*) - COUNT(*) FILTER (WHERE wait_seconds <= 20))::int     AS not_in_20s,
        COALESCE(ROUND(AVG(wait_seconds)::numeric, 0), 0)::int           AS avg_wait_seconds,
        (SELECT ROUND(wait_seconds::numeric, 0)::int FROM max_wait)      AS max_wait_seconds,
        (SELECT destination_dn_name FROM max_wait)                       AS max_wait_queue,
        (SELECT COUNT(*)::int FROM abwurf1)                              AS abwurf1_reached,
        (SELECT COUNT(*)::int FROM abwurf2)                              AS abwurf2_reached
      FROM waits
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
        AND cdr_started_at >= $1 AND cdr_started_at < $2${filterClauseSimple}
      GROUP BY 1 ORDER BY 1
    `;

    // ── Pro-Queue-Stats (pro EINGANGS-Queue, end-to-end — Overflow-Ziele wie
    //    "… 20"/"… 40"/"Abwurf" erscheinen dadurch NICHT als eigene Queues) ─────
    const queueSql = `
      WITH incoming AS (
        SELECT DISTINCT ON (q.main_call_history_id)
          q.main_call_history_id, q.destination_dn_name, q.cdr_started_at
        FROM public.cdroutput q
        WHERE q.destination_dn_type = 'queue'
          AND q.source_participant_is_incoming = true
          AND q.source_entity_type != 'queue'
          AND q.cdr_started_at >= $1 AND q.cdr_started_at < $2${filterClause}
        ORDER BY q.main_call_history_id, q.cdr_started_at
      ),
      answers AS (
        SELECT ext.main_call_history_id, MIN(ext.cdr_answered_at) AS answer_ts
        FROM public.cdroutput ext
        JOIN incoming i USING (main_call_history_id)
        WHERE ext.destination_dn_type = 'extension'
          AND ext.cdr_answered_at IS NOT NULL
        GROUP BY ext.main_call_history_id
      ),
      waits AS (
        SELECT i.destination_dn_name, a.answer_ts,
               CASE WHEN a.answer_ts IS NOT NULL AND a.answer_ts >= i.cdr_started_at
                    THEN EXTRACT(EPOCH FROM (a.answer_ts - i.cdr_started_at)) END AS wait_s
        FROM incoming i
        LEFT JOIN answers a USING (main_call_history_id)
      )
      SELECT
        destination_dn_name                                        AS queue,
        COUNT(*)::int                                              AS anrufe,
        COUNT(answer_ts)::int                                      AS angenommen,
        (COUNT(*) - COUNT(answer_ts))::int                         AS abgebrochen,
        (COUNT(*) - COUNT(*) FILTER (WHERE wait_s <= 20))::int     AS nicht_in_20s,
        COALESCE(ROUND(AVG(wait_s)::numeric, 0), 0)::int           AS avg_wait_s
      FROM waits
      GROUP BY destination_dn_name
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
