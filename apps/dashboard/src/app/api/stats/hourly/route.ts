import { NextResponse } from "next/server";
import { createPool } from "@/lib/pg";
import type { HourlyBucket } from "@3cx-dash/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : todayStart;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : now;

  const pool = await createPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Keine Datenbankverbindung konfiguriert." },
      { status: 503 }
    );
  }

  const client = await pool.connect();
  try {
    const sql = `
      SELECT
        date_trunc('hour', cdr_started_at) AS hour,
        COUNT(*)::int AS total,
        COUNT(cdr_answered_at)::int AS answered,
        COUNT(*) FILTER (WHERE termination_reason = 'abandoned')::int AS abandoned
      FROM public.cdroutput
      WHERE destination_dn_type = 'queue'
        AND source_participant_is_incoming = true
        AND source_entity_type != 'queue'
        AND cdr_started_at >= $1
        AND cdr_started_at < $2
      GROUP BY 1
      ORDER BY 1;
    `;

    const res = await client.query(sql, [from.toISOString(), to.toISOString()]);

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
