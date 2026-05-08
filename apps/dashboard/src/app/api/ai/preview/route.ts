import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import { loadTodaySnapshots, buildAiTrendContext, type QueueSnapshot } from "@/lib/snapshots";
import { createPool } from "@/lib/pg";

function getSettingsPath() {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function GET() {
  const settings = await loadSettings();
  const [queueData, snapshots, dbStats] = await Promise.all([
    fetchEnrichedQueues().catch(() => null),
    loadTodaySnapshots().catch(() => [] as QueueSnapshot[]),
    collectDbPreview(settings),
  ]);

  const queues = queueData?.queues ?? [];
  const activeCalls = queueData?.activeCalls ?? [];
  const activeDns = queueData?.activeDns ?? new Set<string>();

  const queuesSummary = queues
    .filter((q) => (q.Agents?.length ?? 0) > 0)
    .map((q) => ({
      name: q.Name,
      agenten_angemeldet: q.LoggedInAgents ?? 0,
      agenten_gesamt: q.Agents?.length ?? 0,
      agenten_im_gespraech: (q.Agents ?? []).filter((a) => activeDns.has(a.Number)).length,
      wartende_anrufe: q.WaitingCallCount ?? 0,
    }));

  const trend = buildAiTrendContext(snapshots);

  return NextResponse.json({
    _meta: {
      snapshots_heute: snapshots.length,
      db_connected: dbStats !== null,
    },
    warteschlangen: queuesSummary,
    aktive_anrufe: activeCalls.length,
    ...(trend ?? {}),
    ...(dbStats ? { datenbank_heute: dbStats } : {}),
  });
}

async function collectDbPreview(settings: AppSettings) {
  const pool = await createPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    const nowBerlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const todayBerlin = new Date(nowBerlin.getFullYear(), nowBerlin.getMonth(), nowBerlin.getDate());
    const berlinOffset = new Date().getTime() - new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime();
    const today = new Date(todayBerlin.getTime() + berlinOffset);
    const now = new Date();

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

    const queueSql = `
      WITH incoming AS (
        SELECT DISTINCT ON (main_call_history_id)
          main_call_history_id, destination_dn_name,
          EXTRACT(EPOCH FROM (COALESCE(cdr_answered_at, cdr_ended_at) - cdr_started_at))::numeric AS wait_s
        FROM public.cdroutput
        WHERE destination_dn_type = 'queue' AND source_participant_is_incoming = true
          AND source_entity_type != 'queue'
          AND cdr_started_at >= $1 AND cdr_started_at < $2
        ORDER BY main_call_history_id, cdr_started_at
      ),
      answered AS (
        SELECT DISTINCT main_call_history_id FROM public.cdroutput WHERE destination_dn_type = 'extension'
      )
      SELECT i.destination_dn_name AS queue,
        COUNT(*)::int AS anrufe,
        COUNT(a.main_call_history_id)::int AS angenommen,
        (COUNT(*) - COUNT(a.main_call_history_id))::int AS abgebrochen,
        ROUND(AVG(i.wait_s), 0)::int AS avg_wait_s
      FROM incoming i LEFT JOIN answered a ON a.main_call_history_id = i.main_call_history_id
      GROUP BY i.destination_dn_name ORDER BY anrufe DESC LIMIT 10
    `;

    const [hourly, queueStats] = await Promise.all([
      client.query(hourlySql, [today.toISOString(), now.toISOString()]),
      client.query(queueSql, [today.toISOString(), now.toISOString()]),
    ]);

    const stundenverteilung: Record<string, number> = {};
    for (const row of hourly.rows) stundenverteilung[String(row.h).padStart(2, "0")] = Number(row.n);

    return {
      stundenverteilung,
      queues: queueStats.rows.map((r) => ({
        name: r.queue,
        anrufe: Number(r.anrufe),
        angenommen: Number(r.angenommen),
        abgebrochen: Number(r.abgebrochen),
        avg_wartezeit_s: Number(r.avg_wait_s ?? 0),
      })),
    };
  } catch (e) {
    return { error: String(e) };
  } finally {
    client.release();
    await pool.end();
  }
}
