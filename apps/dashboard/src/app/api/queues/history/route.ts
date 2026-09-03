import { NextResponse } from "next/server";
import { loadHistory } from "@/lib/live-history";
import { createPool } from "@/lib/pg";

// Historie einer Queue für das Klick-Modal der Live-Probleme:
// - Echtzeit-Verlauf (3h) aus dem Ringpuffer: wartend/frei/eingeloggt/längste Wartezeit
// - CDR-Statistik der letzten 3h (end-to-end pro Eingangs-Queue)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queue = (searchParams.get("queue") ?? "").trim();
  if (!queue) {
    return NextResponse.json({ error: "queue-Parameter fehlt" }, { status: 400 });
  }

  const history = await loadHistory();
  const samples = history
    .filter((s) => s.q[queue])
    .map((s) => {
      const [waiting, free, loggedIn, longestWait] = s.q[queue];
      return { t: s.t, waiting, free, loggedIn, longestWait };
    });

  // CDR: letzte 3h end-to-end für diese Eingangs-Queue
  let cdr: Record<string, number | null> | null = null;
  try {
    const pool = await createPool();
    if (pool) {
      const client = await pool.connect();
      try {
        const res = await client.query(
          `WITH incoming AS (
             SELECT DISTINCT ON (q.main_call_history_id)
               q.main_call_history_id, q.destination_dn_number, q.cdr_started_at
             FROM public.cdroutput q
             WHERE q.destination_dn_type = 'queue'
               AND q.source_participant_is_incoming = true
               AND q.source_entity_type != 'queue'
               AND q.cdr_started_at >= now() - interval '3 hours'
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
             SELECT i.destination_dn_number, a.answer_ts,
               CASE WHEN a.answer_ts IS NOT NULL AND a.answer_ts >= i.cdr_started_at
                    THEN EXTRACT(EPOCH FROM (a.answer_ts - i.cdr_started_at)) END AS ws
             FROM incoming i
             LEFT JOIN answers a USING (main_call_history_id)
             WHERE i.destination_dn_number = $1
           )
           SELECT COUNT(*)::int AS calls,
                  COUNT(answer_ts)::int AS answered,
                  COUNT(*) FILTER (WHERE ws <= 20)::int AS within_sla,
                  COALESCE(ROUND(AVG(ws)::numeric, 0), 0)::int AS avg_wait_s,
                  COALESCE(ROUND(MAX(ws)::numeric, 0), 0)::int AS max_wait_s
           FROM waits`,
          [queue]
        );
        const r = res.rows[0] ?? {};
        const calls = Number(r.calls ?? 0);
        cdr = {
          calls,
          answered: Number(r.answered ?? 0),
          withinSla: Number(r.within_sla ?? 0),
          slaPct: calls > 0 ? Math.round((Number(r.within_sla ?? 0) / calls) * 1000) / 10 : null,
          avgWaitSeconds: Number(r.avg_wait_s ?? 0),
          maxWaitSeconds: Number(r.max_wait_s ?? 0),
        };
      } finally {
        client.release();
        await pool.end();
      }
    }
  } catch {
    // ohne CDR-DB fehlt nur die Statistik-Zeile
  }

  return NextResponse.json({ queue, samples, cdr });
}
