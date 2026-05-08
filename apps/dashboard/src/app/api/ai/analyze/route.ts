import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, AiAnalysis } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { createPool } from "@/lib/pg";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import { appendSnapshot, buildAiTrendContext, type QueueSnapshot } from "@/lib/snapshots";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

function getAnalysisPath(): string {
  return process.env.SETTINGS_PATH
    ? path.join(path.dirname(process.env.SETTINGS_PATH), "ai-analysis.json")
    : path.join(process.cwd(), "data", "ai-analysis.json");
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ─── GET: letzte gespeicherte Analyse zurückgeben ─────────────────────────────

export async function GET() {
  try {
    const analysisPath = getAnalysisPath();
    const content = await fs.readFile(analysisPath, "utf-8");
    const analysis: AiAnalysis = JSON.parse(content);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json(null);
  }
}

// ─── POST: neue Analyse triggern ──────────────────────────────────────────────

export async function POST() {
  const startTime = Date.now();

  const settings = await loadSettings();

  if (!settings.aiUrl) {
    return NextResponse.json(
      { error: "KI-API nicht konfiguriert. Bitte aiUrl in den Einstellungen hinterlegen." },
      { status: 400 }
    );
  }
  if (!settings.aiModel) {
    return NextResponse.json(
      { error: "KI-Modell nicht konfiguriert. Bitte aiModel in den Einstellungen hinterlegen." },
      { status: 400 }
    );
  }

  // ─── Daten parallel sammeln (gleiche Logik wie /api/queues) ──────────────

  const [queueData, dbStats] = await Promise.all([
    fetchEnrichedQueues().catch(() => null),
    collectDbStats(settings),
  ]);

  const queues = queueData?.queues ?? [];
  const activeCalls = queueData?.activeCalls ?? [];
  const activeDns = queueData?.activeDns ?? new Set<string>();

  // ─── Zusammenfassung aufbauen ──────────────────────────────────────────────

  const queuesSummary = queues
    .filter((q) => (q.Agents?.length ?? 0) > 0)
    .map((q) => ({
      name: q.Name,
      agenten_angemeldet: q.LoggedInAgents ?? 0,
      agenten_gesamt: q.Agents?.length ?? 0,
      agenten_im_gespraech: (q.Agents ?? []).filter((a) => activeDns.has(a.Number)).length,
      wartende_anrufe: q.WaitingCallCount ?? 0,
    }));

  // ─── Snapshot speichern (Rolling Buffer) ──────────────────────────────────

  const snap: QueueSnapshot = {
    t: new Date().toISOString(),
    queues: queuesSummary.map((q) => ({
      name: q.name,
      loggedIn: q.agenten_angemeldet,
      total: q.agenten_gesamt,
      inCall: q.agenten_im_gespraech,
      waiting: q.wartende_anrufe,
    })),
    calls: activeCalls.length,
    talking: activeCalls.filter((c) => c.Status === "Talking").length,
  };
  const allSnapshots = await appendSnapshot(snap);
  const trend = buildAiTrendContext(allSnapshots);

  // ─── currentData zusammenstellen ─────────────────────────────────────────

  const currentData: Record<string, unknown> = {
    zeitpunkt: new Date().toISOString(),
    aktive_anrufe_gesamt: activeCalls.length,
    aktive_anrufe_status: {
      talking: activeCalls.filter((c) => c.Status === "Talking").length,
      ringing: activeCalls.filter((c) => c.Status === "Ringing").length,
      held: activeCalls.filter((c) => c.Status === "Held").length,
    },
    warteschlangen: queuesSummary,
  };

  if (trend) {
    currentData.verlauf_letzte_stunde = trend;
  }

  if (dbStats) {
    currentData.datenbank_heute = dbStats;
  }

  // ─── KI-Prompt aufbauen ───────────────────────────────────────────────────

  const systemPrompt =
    "Du bist ein Call-Center-Analyse-Assistent für ein 3CX-Telefonanlage-Dashboard. " +
    "Analysiere Echtzeit- UND Tagesverlaufsdaten. Erkenne Muster, Peaks und Probleme im Tagesverlauf. " +
    "Antworte NUR mit validem JSON.";

  const userPrompt =
    `3CX-Daten:\n${JSON.stringify(currentData)}\n\n` +
    `Hinweise zur Analyse:\n` +
    `- 'datenbank_heute': historische CDR-Daten aus PostgreSQL (zuverlässig, alle Anrufe heute)\n` +
    `- 'verlauf_heute': Echtzeit-Snapshots (Agenten-Status stündlich gemittelt)\n` +
    `- 'warteschlangen': aktueller Live-Status\n` +
    `Kombiniere alle drei Quellen. Erkenne Stoßzeiten, Unterbesetzungen, SLA-Probleme (nicht_in_20s).\n\n` +
    `JSON-Antwort mit: status ("gut"|"warnung"|"kritisch"), ` +
    `zusammenfassung (1-2 Sätze, Tagesüberblick), ` +
    `erkenntnisse (max. 3 Stichpunkte: Aufkommen, SLA, Agenten-Deckung), ` +
    `empfehlungen (max. 2 konkrete Maßnahmen basierend auf heutigen Daten), ` +
    `anomalien (auffällige Queue, Stunde oder Muster — leer wenn nichts Auffälliges).`;

  // ─── KI-API aufrufen ───────────────────────────────────────────────────────

  let aiResponse: Response;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (settings.aiApiKey) {
      headers["Authorization"] = `Bearer ${settings.aiApiKey}`;
    }

    aiResponse = await fetch(`${settings.aiUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 700,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `KI-API nicht erreichbar: ${String(err)}` },
      { status: 502 }
    );
  }

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text().catch(() => "");
    return NextResponse.json(
      { error: `KI-API Fehler (${aiResponse.status}): ${errorText}` },
      { status: 502 }
    );
  }

  const aiData = await aiResponse.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = aiData.choices?.[0]?.message?.content ?? "";

  // ─── JSON aus KI-Antwort extrahieren ─────────────────────────────────────

  let parsed: Partial<AiAnalysis>;
  try {
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ??
      rawContent.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawContent;
    parsed = JSON.parse(jsonStr);
  } catch {
    return NextResponse.json(
      { error: `KI-Antwort konnte nicht geparst werden: ${rawContent.slice(0, 200)}` },
      { status: 500 }
    );
  }

  const dauer_ms = Date.now() - startTime;

  const analysis: AiAnalysis = {
    timestamp: new Date().toISOString(),
    status: (parsed.status as AiAnalysis["status"]) ?? "warnung",
    zusammenfassung: parsed.zusammenfassung ?? "",
    erkenntnisse: Array.isArray(parsed.erkenntnisse) ? parsed.erkenntnisse : [],
    empfehlungen: Array.isArray(parsed.empfehlungen) ? parsed.empfehlungen : [],
    anomalien: Array.isArray(parsed.anomalien) ? parsed.anomalien : [],
    dauer_ms,
  };

  // ─── Analyse speichern ────────────────────────────────────────────────────

  const analysisPath = getAnalysisPath();
  await fs.mkdir(path.dirname(analysisPath), { recursive: true });
  await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2), "utf-8");

  return NextResponse.json(analysis);
}

// ─── DB-Statistiken für heute (optional) ─────────────────────────────────────

interface DbStats {
  gesamt: number;
  angenommen: number;
  abgebrochen: number;
  nicht_in_20s: number;
  avg_wartezeit_s: number;
  max_wartezeit_s: number;
  stundenverteilung: Record<string, number>;
  queues: Array<{ name: string; anrufe: number; angenommen: number; abgebrochen: number; avg_wartezeit_s: number }>;
}

async function collectDbStats(
  _settings: AppSettings
): Promise<DbStats | null> {
  const pool = await createPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    // Tages-Grenzen in Europe/Berlin → UTC
    const nowBerlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const todayBerlin = new Date(nowBerlin.getFullYear(), nowBerlin.getMonth(), nowBerlin.getDate());
    const berlinOffset = new Date().getTime() - new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime();
    const today = new Date(todayBerlin.getTime() + berlinOffset);
    const now = new Date();

    // ── KPI-Query ─────────────────────────────────────────────────────────────
    const kpiSql = `
      WITH incoming AS (
        SELECT DISTINCT ON (main_call_history_id)
          main_call_history_id,
          cdr_started_at,
          cdr_answered_at,
          cdr_ended_at,
          destination_dn_name,
          EXTRACT(EPOCH FROM (COALESCE(cdr_answered_at, cdr_ended_at) - cdr_started_at))::numeric AS wait_s
        FROM public.cdroutput
        WHERE destination_dn_type = 'queue'
          AND source_participant_is_incoming = true
          AND cdr_started_at >= $1 AND cdr_started_at < $2
          AND source_entity_type != 'queue'
        ORDER BY main_call_history_id, cdr_started_at
      ),
      answered AS (
        SELECT DISTINCT i.main_call_history_id
        FROM incoming i
        JOIN public.cdroutput ext ON ext.main_call_history_id = i.main_call_history_id
          AND ext.destination_dn_type = 'extension'
      )
      SELECT
        COUNT(*)::int                                            AS gesamt,
        (SELECT COUNT(*)::int FROM answered)                    AS angenommen,
        (COUNT(*) - (SELECT COUNT(*) FROM answered))::int       AS abgebrochen,
        COUNT(*) FILTER (WHERE wait_s > 20)::int                AS nicht_in_20s,
        ROUND(AVG(wait_s), 1)::float                            AS avg_wait_s,
        COALESCE(MAX(wait_s)::int, 0)                           AS max_wait_s
      FROM incoming
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
        AND cdr_started_at >= $1 AND cdr_started_at < $2
      GROUP BY 1 ORDER BY 1
    `;

    // ── Pro-Queue-Stats ───────────────────────────────────────────────────────
    const queueSql = `
      WITH incoming AS (
        SELECT DISTINCT ON (main_call_history_id)
          main_call_history_id,
          destination_dn_name,
          EXTRACT(EPOCH FROM (COALESCE(cdr_answered_at, cdr_ended_at) - cdr_started_at))::numeric AS wait_s
        FROM public.cdroutput
        WHERE destination_dn_type = 'queue'
          AND source_participant_is_incoming = true
          AND source_entity_type != 'queue'
          AND cdr_started_at >= $1 AND cdr_started_at < $2
        ORDER BY main_call_history_id, cdr_started_at
      ),
      answered AS (
        SELECT DISTINCT main_call_history_id
        FROM public.cdroutput WHERE destination_dn_type = 'extension'
      )
      SELECT
        i.destination_dn_name                                       AS queue,
        COUNT(*)::int                                               AS anrufe,
        COUNT(a.main_call_history_id)::int                          AS angenommen,
        (COUNT(*) - COUNT(a.main_call_history_id))::int             AS abgebrochen,
        ROUND(AVG(i.wait_s), 0)::int                               AS avg_wait_s
      FROM incoming i
      LEFT JOIN answered a ON a.main_call_history_id = i.main_call_history_id
      GROUP BY i.destination_dn_name
      ORDER BY anrufe DESC
      LIMIT 10
    `;

    const [kpiRes, hourlyRes, queueRes] = await Promise.all([
      client.query(kpiSql, [today.toISOString(), now.toISOString()]),
      client.query(hourlySql, [today.toISOString(), now.toISOString()]),
      client.query(queueSql, [today.toISOString(), now.toISOString()]),
    ]);

    const kpi = kpiRes.rows[0] ?? {};
    const stundenverteilung: Record<string, number> = {};
    for (const row of hourlyRes.rows) {
      stundenverteilung[String(row.h).padStart(2, "0")] = Number(row.n);
    }

    return {
      gesamt: Number(kpi.gesamt ?? 0),
      angenommen: Number(kpi.angenommen ?? 0),
      abgebrochen: Number(kpi.abgebrochen ?? 0),
      nicht_in_20s: Number(kpi.nicht_in_20s ?? 0),
      avg_wartezeit_s: Number(kpi.avg_wait_s ?? 0),
      max_wartezeit_s: Number(kpi.max_wait_s ?? 0),
      stundenverteilung,
      queues: queueRes.rows.map((r) => ({
        name: r.queue,
        anrufe: Number(r.anrufe),
        angenommen: Number(r.angenommen),
        abgebrochen: Number(r.abgebrochen),
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
