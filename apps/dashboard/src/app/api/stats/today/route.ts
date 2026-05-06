import { NextResponse } from "next/server";
import { createPool } from "@/lib/pg";
import type { TodayStats } from "@3cx-dash/types";

export async function GET() {
  const pool = await createPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Keine Datenbankverbindung konfiguriert." },
      { status: 503 }
    );
  }

  const client = await pool.connect();
  try {
    // Heute 00:00 bis jetzt (lokale Serverzeit in UTC)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const sql = `
      WITH incoming_queue_calls AS (
        SELECT
          q.main_call_history_id,
          q.cdr_id,
          q.cdr_answered_at,
          q.cdr_started_at,
          q.cdr_ended_at,
          q.termination_reason,
          q.continued_in_cdr_id,
          EXTRACT(EPOCH FROM (COALESCE(q.cdr_answered_at, q.cdr_ended_at) - q.cdr_started_at)) AS wait_seconds
        FROM public.cdroutput q
        WHERE q.destination_dn_type = 'queue'
          AND q.source_participant_is_incoming = true
          AND q.cdr_started_at >= $1
          AND q.cdr_started_at < $2
          AND q.source_entity_type != 'queue'
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
      )
      SELECT
        COUNT(*)::int                                                        AS total_incoming,
        COUNT(cdr_answered_at)::int                                          AS answered,
        COUNT(*) FILTER (WHERE termination_reason = 'abandoned')::int       AS abandoned,
        COUNT(*) FILTER (WHERE wait_seconds > 20)::int                      AS not_in_20s,
        (SELECT COUNT(*)::int FROM abwurf1)                                 AS abwurf1_reached,
        (SELECT COUNT(*)::int FROM abwurf2)                                 AS abwurf2_reached
      FROM incoming_queue_calls;
    `;

    const res = await client.query(sql, [today.toISOString(), now.toISOString()]);
    const row = res.rows[0] ?? {};

    const stats: TodayStats = {
      total_incoming: Number(row.total_incoming ?? 0),
      answered: Number(row.answered ?? 0),
      abandoned: Number(row.abandoned ?? 0),
      not_in_20s: Number(row.not_in_20s ?? 0),
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
