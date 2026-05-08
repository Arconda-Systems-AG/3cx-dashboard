import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, AiAnalysis } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import { appendSnapshot, buildAiTrendContext, type QueueSnapshot } from "@/lib/snapshots";
import { collectFullDayStats } from "@/lib/db-stats";

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

  // ─── Daten parallel sammeln ────────────────────────────────────────────────

  const [queueData, dbStats] = await Promise.all([
    fetchEnrichedQueues().catch(() => null),
    collectFullDayStats(),
  ]);

  const queues = queueData?.queues ?? [];
  const activeCalls = queueData?.activeCalls ?? [];
  const activeDns = queueData?.activeDns ?? new Set<string>();

  // ─── Queue-Zusammenfassung ────────────────────────────────────────────────

  const queuesSummary = queues
    .filter((q) => (q.Agents?.length ?? 0) > 0)
    .map((q) => ({
      name: q.Name,
      agenten_angemeldet: q.LoggedInAgents ?? 0,
      agenten_gesamt: q.Agents?.length ?? 0,
      agenten_im_gespraech: (q.Agents ?? []).filter((a) => activeDns.has(a.Number)).length,
      wartende_anrufe: q.WaitingCallCount ?? 0,
    }));

  // ─── Snapshot speichern (ganztägiger Rolling Buffer) ──────────────────────

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

  // ─── currentData für KI-Prompt ────────────────────────────────────────────

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
    currentData.verlauf_heute = trend;
  }

  if (dbStats) {
    currentData.datenbank_heute = {
      gesamt: dbStats.today.total_incoming,
      angenommen: dbStats.today.answered,
      abgebrochen: dbStats.today.abandoned,
      nicht_in_20s: dbStats.today.not_in_20s,
      avg_wartezeit_s: dbStats.today.avg_wait_seconds,
      max_wartezeit_s: dbStats.today.max_wait_seconds,
      max_wartezeit_queue: dbStats.today.max_wait_queue,
      abwurf1: dbStats.today.abwurf1_reached,
      abwurf2: dbStats.today.abwurf2_reached,
      stundenverteilung: dbStats.stundenverteilung,
      queues: dbStats.queues,
    };
  }

  // ─── KI-Prompt ───────────────────────────────────────────────────────────

  const systemPrompt =
    "Du bist ein Call-Center-Analyse-Assistent für ein 3CX-Telefonanlage-Dashboard. " +
    "Analysiere Echtzeit- UND Tagesverlaufsdaten. Erkenne Muster, Peaks und Probleme im Tagesverlauf. " +
    "Antworte NUR mit validem JSON.";

  const userPrompt =
    `3CX-Daten:\n${JSON.stringify(currentData)}\n\n` +
    `Hinweise:\n` +
    `- 'datenbank_heute': CDR-Daten aus PostgreSQL (alle Anrufe heute, zuverlässig)\n` +
    `- 'datenbank_heute.stundenverteilung': Anrufvolumen pro Stunde ({"08":23,"09":45,...})\n` +
    `- 'datenbank_heute.queues': Pro-Queue-Statistik mit nicht_in_20s und avg_wartezeit_s\n` +
    `- 'verlauf_heute': Echtzeit-Snapshots (Agenten-Besetzung über den Tag)\n` +
    `- 'warteschlangen': aktueller Live-Status\n\n` +
    `Erkenne: Stoßzeiten, SLA-Probleme (nicht_in_20s), Queue-Unterbesetzung, Abwurf-Kaskaden.\n\n` +
    `JSON mit: status ("gut"|"warnung"|"kritisch"), ` +
    `zusammenfassung (1-2 Sätze), ` +
    `erkenntnisse (max. 3: Aufkommen/SLA/Besetzung), ` +
    `empfehlungen (max. 2 konkrete Maßnahmen), ` +
    `anomalien (auffällige Queue, Stunde, Muster — leer wenn unauffällig).`;

  // ─── KI-API aufrufen ────────────────────────────────────────────────────

  let aiResponse: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
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
