import { NextResponse } from "next/server";
import { createPool } from "@/lib/pg";
import type { TodayStats } from "@3cx-dash/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queuesParam = searchParams.get("queues");
  const queueFilter = queuesParam ? queuesParam.split(",").map((q) => q.trim()).filter(Boolean) : [];

  const pool = await createPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Keine Datenbankverbindung konfiguriert." },
      { status: 503 }
    );
  }

  const client = await pool.connect();
  try {
    // Heute 00:00 bis jetzt in Europe/Berlin
    const nowBerlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const todayBerlin = new Date(nowBerlin.getFullYear(), nowBerlin.getMonth(), nowBerlin.getDate());
    // Als UTC-ISO zurückrechnen (Berlin-Mitternacht in UTC)
    const berlinOffset = new Date().getTime() - new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime();
    const now = new Date();
    const today = new Date(todayBerlin.getTime() + berlinOffset);

    const params: unknown[] = [today.toISOString(), now.toISOString()];
    const queueWhere = queueFilter.length > 0
      ? `AND q.destination_dn_number = ANY($${params.push(queueFilter)})`
      : "";

    // End-to-end über Overflow-Kaskaden: Wartezeit = Eingang in die erste Queue bis
    // zur ersten ECHTEN Agenten-Annahme (Extension mit cdr_answered_at). Die alte
    // per-Segment-Messung zählte 0,1s-Overflow-Segmente als "in 20s" und Klingel-Legs
    // ohne Annahme als "angenommen".
    const sql = `
      WITH incoming_queue_calls AS (
        -- Ein Eintrag pro echtem Anruf (DISTINCT ON main_call_history_id = frühester Hop)
        SELECT DISTINCT ON (q.main_call_history_id)
          q.main_call_history_id,
          q.cdr_id,
          q.cdr_started_at,
          q.destination_dn_name,
          q.continued_in_cdr_id,
          q.source_participant_phone_number AS anrufer
        FROM public.cdroutput q
        WHERE q.destination_dn_type = 'queue'
          AND q.source_participant_is_incoming = true
          AND q.cdr_started_at >= $1
          AND q.cdr_started_at < $2
          AND q.source_entity_type != 'queue'
          ${queueWhere}
        ORDER BY q.main_call_history_id, q.cdr_started_at
      ),
      -- Erste echte Agenten-Annahme (Extension-Segment MIT cdr_answered_at;
      -- Klingel-Legs haben answered_at = NULL)
      answers AS (
        SELECT ext.main_call_history_id, MIN(ext.cdr_answered_at) AS answer_ts
        FROM public.cdroutput ext
        JOIN incoming_queue_calls iqc USING (main_call_history_id)
        WHERE ext.destination_dn_type = 'extension'
          AND ext.cdr_answered_at IS NOT NULL
        GROUP BY ext.main_call_history_id
      ),
      waits AS (
        SELECT iqc.main_call_history_id,
               iqc.destination_dn_name,
               iqc.continued_in_cdr_id,
               iqc.anrufer,
               a.answer_ts,
               CASE WHEN a.answer_ts IS NOT NULL AND a.answer_ts >= iqc.cdr_started_at
                    THEN EXTRACT(EPOCH FROM (a.answer_ts - iqc.cdr_started_at)) END AS wait_seconds
        FROM incoming_queue_calls iqc
        LEFT JOIN answers a USING (main_call_history_id)
      ),
      -- Anrufer-Sicht (Wiederwähler dedupliziert): verloren = keiner der
      -- heutigen Versuche dieser Rufnummer wurde je angenommen
      lost AS (
        SELECT COUNT(DISTINCT w1.anrufer) FILTER (WHERE NOT EXISTS (
                 SELECT 1 FROM waits w2 WHERE w2.anrufer = w1.anrufer AND w2.answer_ts IS NOT NULL
               )) AS lost_callers,
               COUNT(DISTINCT w1.anrufer) FILTER (WHERE EXISTS (
                 SELECT 1 FROM waits w2 WHERE w2.anrufer = w1.anrufer AND w2.answer_ts IS NOT NULL
               )) AS retried_ok
        FROM waits w1
        WHERE w1.answer_ts IS NULL AND COALESCE(w1.anrufer, '') != ''
      ),
      abwurf1 AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.cdr_id = iqc.continued_in_cdr_id
          AND q2.destination_dn_type = 'queue'
      ),
      abwurf2 AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.cdr_id = iqc.continued_in_cdr_id
          AND q2.destination_dn_type = 'queue'
        JOIN public.cdroutput q3 ON q3.cdr_id = q2.continued_in_cdr_id
          AND q3.destination_dn_type = 'queue'
      ),
      max_wait AS (
        SELECT destination_dn_name, wait_seconds
        FROM waits
        WHERE wait_seconds IS NOT NULL
        ORDER BY wait_seconds DESC
        LIMIT 1
      )
      SELECT
        COUNT(*)::int                                                                     AS total_incoming,
        COUNT(answer_ts)::int                                                             AS answered,
        (COUNT(*) - COUNT(answer_ts))::int                                                AS abandoned,
        (COUNT(*) - COUNT(*) FILTER (WHERE wait_seconds <= 20))::int                      AS not_in_20s,
        COALESCE(ROUND(AVG(wait_seconds)::numeric, 0), 0)::int                            AS avg_wait_seconds,
        (SELECT ROUND(wait_seconds::numeric, 0)::int FROM max_wait)                       AS max_wait_seconds,
        (SELECT destination_dn_name FROM max_wait)                                        AS max_wait_queue,
        (SELECT COUNT(*)::int FROM abwurf1)                                               AS abwurf1_reached,
        (SELECT COUNT(*)::int FROM abwurf2)                                               AS abwurf2_reached,
        (SELECT lost_callers::int FROM lost)                                              AS lost_callers,
        (SELECT retried_ok::int FROM lost)                                                AS lost_retried_ok
      FROM waits;
    `;

    const res = await client.query(sql, params);
    const row = res.rows[0] ?? {};

    const stats: TodayStats = {
      total_incoming: Number(row.total_incoming ?? 0),
      answered: Number(row.answered ?? 0),
      abandoned: Number(row.abandoned ?? 0),
      not_in_20s: Number(row.not_in_20s ?? 0),
      avg_wait_seconds: Number(row.avg_wait_seconds ?? 0),
      max_wait_seconds: Number(row.max_wait_seconds ?? 0),
      max_wait_queue: String(row.max_wait_queue ?? ""),
      abwurf1_reached: Number(row.abwurf1_reached ?? 0),
      abwurf2_reached: Number(row.abwurf2_reached ?? 0),
      lost_callers: Number(row.lost_callers ?? 0),
      lost_retried_ok: Number(row.lost_retried_ok ?? 0),
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
