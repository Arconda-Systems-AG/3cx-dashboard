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
    const queueWhereGlobal = queueFilter.length > 0
      ? `AND destination_dn_number = ANY($3)`
      : "";

    const sql = `
      WITH incoming_queue_calls AS (
        -- Ein Eintrag pro echtem Anruf (DISTINCT ON main_call_history_id = frühester Hop)
        SELECT DISTINCT ON (q.main_call_history_id)
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
          AND q.cdr_started_at >= $1
          AND q.cdr_started_at < $2
          AND q.source_entity_type != 'queue'
          ${queueWhere}
        ORDER BY q.main_call_history_id, q.cdr_started_at
      ),
      -- Angenommen = irgendein CDR im Anrufverlauf erreichte eine Extension
      answered AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput ext ON ext.main_call_history_id = iqc.main_call_history_id
          AND ext.destination_dn_type = 'extension'
      ),
      -- Abgebrochen = Caller legte in irgendeinem Queue-Hop auf (auch Abwurf-Queue)
      aborted AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.main_call_history_id = iqc.main_call_history_id
          AND q2.destination_dn_type = 'queue'
          AND q2.termination_reason = 'src_participant_terminated'
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
        SELECT destination_dn_name,
          EXTRACT(EPOCH FROM (cdr_ended_at - cdr_started_at)) AS secs
        FROM public.cdroutput
        WHERE destination_dn_type = 'queue'
          AND source_participant_is_incoming = true
          AND cdr_started_at >= $1
          AND cdr_started_at < $2
          ${queueWhereGlobal}
        ORDER BY secs DESC
        LIMIT 1
      )
      SELECT
        COUNT(*)::int                                                                                              AS total_incoming,
        (SELECT COUNT(*)::int FROM answered)                                                                       AS answered,
        (SELECT COUNT(*)::int FROM aborted
           WHERE main_call_history_id NOT IN (SELECT main_call_history_id FROM answered))                        AS abandoned,
        COUNT(*) FILTER (WHERE wait_seconds > 20)::int                                    AS not_in_20s,
        ROUND(AVG(wait_seconds)::numeric, 0)::int                                         AS avg_wait_seconds,
        (SELECT ROUND(secs::numeric, 0)::int FROM max_wait)                               AS max_wait_seconds,
        (SELECT destination_dn_name FROM max_wait)                                        AS max_wait_queue,
        (SELECT COUNT(*)::int FROM abwurf1)                                                AS abwurf1_reached,
        (SELECT COUNT(*)::int FROM abwurf2)                                                AS abwurf2_reached
      FROM incoming_queue_calls;
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
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
