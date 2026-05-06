import { NextResponse } from "next/server";
import { createPool } from "@/lib/pg";
import type { HourlyBucket } from "@3cx-dash/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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

    const sql = `
      SELECT
        date_trunc('hour', c.cdr_started_at) AS hour,
        COUNT(*)::int AS total,
        COUNT(q2_ext.cdr_id)::int AS answered,
        COUNT(*) FILTER (WHERE c.termination_reason = 'src_participant_terminated')::int AS abandoned
      FROM public.cdroutput c
      LEFT JOIN public.cdroutput q2_ext
        ON q2_ext.cdr_id = c.continued_in_cdr_id
        AND q2_ext.destination_dn_type = 'extension'
      WHERE c.destination_dn_type = 'queue'
        AND c.source_participant_is_incoming = true
        AND c.source_entity_type != 'queue'
        AND c.cdr_started_at >= $1
        AND c.cdr_started_at < $2
        ${queueWhere}
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
