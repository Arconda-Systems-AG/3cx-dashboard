import { NextResponse } from "next/server";
import { createPool } from "@/lib/pg";
import type { HourlyBucket } from "@3cx-dash/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const nowBerlin = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const berlinOffset = now.getTime() - nowBerlin.getTime();
  const todayBerlinMidnight = new Date(nowBerlin.getFullYear(), nowBerlin.getMonth(), nowBerlin.getDate());
  const todayStart = new Date(todayBerlinMidnight.getTime() + berlinOffset);

  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : todayStart;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : now;

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
    const params: unknown[] = [from.toISOString(), to.toISOString()];
    const queueWhere = queueFilter.length > 0
      ? `AND c.destination_dn_number = ANY($${params.push(queueFilter)})`
      : "";

    // Angenommen = Extension-Segment MIT cdr_answered_at (echte Agenten-Annahme).
    // Klingel-Legs ohne answered_at zählten hier früher fälschlich als angenommen —
    // das Chart widersprach dann den (korrekten) end-to-end-Zahlen der KI/Kacheln.
    const sql = `
      SELECT
        date_trunc('hour', sub.first_start AT TIME ZONE 'Europe/Berlin') AS hour,
        COUNT(*)::int                                                                     AS total,
        COUNT(sub.answer_ts)::int                                                         AS answered,
        COUNT(CASE WHEN sub.answer_ts IS NULL THEN 1 END)::int                            AS abandoned
      FROM (
        SELECT
          c.main_call_history_id,
          MIN(c.cdr_started_at)                                                              AS first_start,
          MIN(ext.cdr_answered_at)                                                           AS answer_ts
        FROM public.cdroutput c
        LEFT JOIN public.cdroutput ext
          ON ext.main_call_history_id = c.main_call_history_id
          AND ext.destination_dn_type = 'extension'
          AND ext.cdr_answered_at IS NOT NULL
        WHERE c.destination_dn_type = 'queue'
          AND c.source_participant_is_incoming = true
          AND c.source_entity_type != 'queue'
          AND c.cdr_started_at >= $1
          AND c.cdr_started_at < $2
          ${queueWhere}
        GROUP BY c.main_call_history_id
      ) sub
      GROUP BY 1
      ORDER BY 1;
    `;

    const res = await client.query(sql, params);

    const buckets: HourlyBucket[] = res.rows.map((r) => ({
      hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
      total: Number(r.total),
      answered: Number(r.answered),
      abandoned: Number(r.abandoned),
    }));

    return NextResponse.json({ buckets });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
