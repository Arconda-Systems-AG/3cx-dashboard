import { NextResponse } from "next/server";
import { createPool } from "@/lib/pg";

// Anrufprotokoll aus der CDR-DB (statt der trägen XAPI-CallHistoryView, die
// zudem bei Dello leer liefert). Eine Zeile pro echtem Anruf
// (main_call_history_id); Suche matcht ALLE Segmente des Anrufs — dadurch
// findet "Kiel Zentrale"/"04900" auch Anrufe, deren erste Station eine
// Warteschlange oder ein IVR war.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "100") || 100, 1), 500);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0") || 0, 0);
  const q = (searchParams.get("q") ?? "").trim();
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "7") || 7, 1), 90);

  const pool = await createPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Keine Datenbankverbindung konfiguriert." },
      { status: 503 }
    );
  }

  const client = await pool.connect();
  try {
    const params: unknown[] = [days];
    let matchJoin = "";
    if (q) {
      params.push(`%${q}%`);
      matchJoin = `
      JOIN (
        SELECT DISTINCT main_call_history_id FROM public.cdroutput
        WHERE cdr_started_at >= now() - ($1 || ' days')::interval
          AND (source_dn_number ILIKE $2 OR source_dn_name ILIKE $2
            OR source_participant_name ILIKE $2 OR source_participant_phone_number ILIKE $2
            OR destination_dn_number ILIKE $2 OR destination_dn_name ILIKE $2
            OR destination_participant_name ILIKE $2)
      ) m USING (main_call_history_id)`;
    }
    params.push(limit, offset);
    const pLimit = params.length - 1;
    const pOffset = params.length;

    const sql = `
      WITH calls AS (
        SELECT c.main_call_history_id,
          min(c.cdr_started_at) AS started_at,
          max(c.cdr_ended_at)   AS ended_at,
          (array_agg(COALESCE(NULLIF(c.source_participant_name,''), NULLIF(c.source_dn_name,'')) ORDER BY c.cdr_started_at))[1] AS src_name,
          (array_agg(COALESCE(NULLIF(c.source_participant_phone_number,''), NULLIF(c.source_dn_number,'')) ORDER BY c.cdr_started_at))[1] AS src_number,
          (array_agg(COALESCE(NULLIF(c.destination_dn_name,''), NULLIF(c.destination_participant_name,'')) ORDER BY c.cdr_started_at))[1] AS dst_name,
          (array_agg(COALESCE(NULLIF(c.destination_dn_number,''), NULLIF(c.destination_participant_phone_number,'')) ORDER BY c.cdr_started_at))[1] AS dst_number,
          -- Echte Annahme: extension (intern/eingehend) oder provider (ausgehend
          -- extern). queue/ivr/script "beantworten" automatisch (Ansagen).
          min(c.cdr_answered_at) FILTER (WHERE c.destination_dn_type IN ('extension','provider') AND c.cdr_answered_at IS NOT NULL) AS answer_ts,
          (array_agg(COALESCE(NULLIF(c.destination_dn_name,''), c.destination_dn_number) ORDER BY c.cdr_answered_at)
            FILTER (WHERE c.destination_dn_type = 'extension' AND c.cdr_answered_at IS NOT NULL))[1] AS answered_by
        FROM public.cdroutput c${matchJoin}
        WHERE c.cdr_started_at >= now() - ($1 || ' days')::interval
        GROUP BY c.main_call_history_id
      )
      SELECT main_call_history_id AS id,
        started_at, answer_ts IS NOT NULL AS answered, answered_by,
        src_name, src_number, dst_name, dst_number,
        CASE WHEN answer_ts IS NOT NULL AND ended_at >= answer_ts
             THEN EXTRACT(EPOCH FROM (ended_at - answer_ts))::int ELSE 0 END AS duration_seconds
      FROM calls
      WHERE ended_at IS NOT NULL
      ORDER BY started_at DESC
      LIMIT $${pLimit} OFFSET $${pOffset};
    `;

    const res = await client.query(sql, params);
    return NextResponse.json({
      value: res.rows.map((r) => ({
        id: String(r.id),
        startedAt: r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
        answered: Boolean(r.answered),
        answeredBy: r.answered_by ?? null,
        srcName: r.src_name ?? null,
        srcNumber: r.src_number ?? null,
        dstName: r.dst_name ?? null,
        dstNumber: r.dst_number ?? null,
        durationSeconds: Number(r.duration_seconds ?? 0),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
