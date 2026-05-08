import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, AiAnalysis, Queue, ActiveCall, ODataList } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { xapiFetch } from "@/lib/threecx-client";
import { createPool } from "@/lib/pg";

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
    // Noch keine Analyse vorhanden
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

  // ─── Daten parallel sammeln ────────────────────────────────────────────────

  const [queuesResult, callsResult, extResult, dbResult] = await Promise.allSettled([
    xapiFetch<ODataList<Queue>>("Queues?$expand=Agents,Managers"),
    xapiFetch<ODataList<ActiveCall>>("ActiveCalls?$select=Id,Caller,Callee,Status,EstablishedAt"),
    xapiFetch<ODataList<{ Number: string; QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean }>>(
      "Users?$select=Number,QueueStatus,CurrentProfileName,IsRegistered"
    ),
    collectDbStats(settings),
  ]);

  const queues = queuesResult.status === "fulfilled" ? (queuesResult.value.value ?? []) : [];
  const activeCalls = callsResult.status === "fulfilled" ? (callsResult.value.value ?? []) : [];
  const dbStats = dbResult.status === "fulfilled" ? dbResult.value : null;

  // Extension-Map für korrekte LoggedIn-Berechnung (wie in /api/queues)
  const extMap = extResult.status === "fulfilled"
    ? new Map((extResult.value.value ?? []).map((e) => [e.Number, e]))
    : new Map<string, { QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean }>();

  const activeDns = new Set(activeCalls.flatMap((c) => [
    (c.Caller ?? "").split(" ")[0],
    (c.Callee ?? "").split(" ")[0],
  ]));

  // ─── Zusammenfassung aufbauen ──────────────────────────────────────────────

  const queuesSummary = queues.map((q) => {
    const agents = q.Agents ?? [];
    const loggedIn = agents.filter((a) => {
      const ext = extMap.get(a.Number);
      return ext?.QueueStatus === "LoggedIn" && ext?.CurrentProfileName === "Available";
    }).length;
    const inCall = agents.filter((a) => activeDns.has(a.Number)).length;
    const queueCalls = activeCalls.filter((c) => (c.Callee ?? "").split(" ")[0] === q.Number);
    return {
      name: q.Name,
      agenten_angemeldet: loggedIn,
      agenten_gesamt: agents.length,
      agenten_im_gespraech: inCall,
      wartende_anrufe: queueCalls.filter((c) => c.Status === "Rerouting").length,
    };
  }).filter((q) => q.agenten_gesamt > 0);

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

  if (dbStats) {
    currentData.tages_statistiken = dbStats;
  }

  // ─── KI-Prompt aufbauen ───────────────────────────────────────────────────

  const systemPrompt =
    "Du bist ein Call-Center-Analyse-Assistent für ein 3CX-Telefonanlage-Dashboard. " +
    "Analysiere die bereitgestellten Echtzeitdaten und gib präzise, actionable Erkenntnisse auf Deutsch. " +
    "Antworte NUR mit validem JSON.";

  const userPrompt =
    `3CX-Daten:\n${JSON.stringify(currentData)}\n\n` +
    `JSON-Antwort mit: status ("gut"|"warnung"|"kritisch"), ` +
    `zusammenfassung (1 Satz), ` +
    `erkenntnisse (max. 3 kurze Stichpunkte), ` +
    `empfehlungen (max. 2 konkrete Empfehlungen), ` +
    `anomalien (nur wenn wirklich auffällig, sonst leer Array).`;

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
        max_tokens: 512,
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
    // Manche Modelle wrappen JSON in Markdown-Codeblöcke
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

async function collectDbStats(
  _settings: AppSettings
): Promise<Record<string, number> | null> {
  const pool = await createPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    const nowBerlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const todayBerlin = new Date(nowBerlin.getFullYear(), nowBerlin.getMonth(), nowBerlin.getDate());
    const berlinOffset =
      new Date().getTime() -
      new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime();
    const today = new Date(todayBerlin.getTime() + berlinOffset);
    const now = new Date();

    const sql = `
      WITH incoming AS (
        SELECT DISTINCT ON (main_call_history_id) main_call_history_id, continued_in_cdr_id
        FROM public.cdroutput
        WHERE destination_dn_type = 'queue'
          AND source_participant_is_incoming = true
          AND cdr_started_at >= $1
          AND cdr_started_at < $2
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
        COUNT(*)::int AS total_incoming,
        (SELECT COUNT(*)::int FROM answered) AS answered,
        (COUNT(*) - (SELECT COUNT(*) FROM answered))::int AS abandoned
      FROM incoming
    `;

    const res = await client.query(sql, [today.toISOString(), now.toISOString()]);
    const row = res.rows[0] ?? {};
    return {
      eingehend_heute: Number(row.total_incoming ?? 0),
      angenommen_heute: Number(row.answered ?? 0),
      abgebrochen_heute: Number(row.abandoned ?? 0),
    };
  } catch {
    return null;
  } finally {
    client.release();
    await pool.end();
  }
}
