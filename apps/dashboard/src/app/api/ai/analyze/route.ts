import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, AiAnalysis } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import { appendSnapshot, buildAiTrendContext, type QueueSnapshot } from "@/lib/snapshots";
import { collectFullDayStats } from "@/lib/db-stats";
import { xapiFetch } from "@/lib/threecx-client";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

function getAnalysisPath(departmentId?: string): string {
  const filename = departmentId ? `ai-analysis-dept-${departmentId}.json` : "ai-analysis.json";
  return process.env.SETTINGS_PATH
    ? path.join(path.dirname(process.env.SETTINGS_PATH), filename)
    : path.join(process.cwd(), "data", filename);
}

async function resolveQueueNumbersForDepartment(departmentId: number): Promise<string[]> {
  try {
    const groupData = await xapiFetch<{
      value: Array<{ Id: number; Members?: Array<{ Number?: string }> }>;
    }>(`Groups?$filter=Id eq ${departmentId}&$expand=Members($select=Number)`);

    const memberNums = new Set(
      (groupData.value[0]?.Members ?? [])
        .map((m) => m.Number)
        .filter((n): n is string => Boolean(n))
    );

    const queuesData = await xapiFetch<{
      value: Array<{ Number?: string; Agents?: Array<{ Number?: string }> }>;
    }>("Queues?$expand=Agents($select=Number)");

    return (queuesData.value ?? [])
      .filter((q) => (q.Agents ?? []).some((a) => a.Number && memberNums.has(a.Number)))
      .map((q) => q.Number)
      .filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId") ?? undefined;
  try {
    const analysisPath = getAnalysisPath(departmentId);
    const content = await fs.readFile(analysisPath, "utf-8");
    const analysis: AiAnalysis = JSON.parse(content);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json(null);
  }
}

// ─── POST: neue Analyse triggern ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  const body = await request.json().catch(() => ({})) as { departmentId?: string | number; all?: boolean };

  // ─── all=true: global + alle Dept-Analysen aus Berichtsprofilen ──────────
  if (body.all) {
    const settings = await loadSettings();
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    const host = request.headers.get("host") ?? "localhost:3000";
    const base = `${proto}://${host}`;

    // Globale Analyse
    const globalRes = await fetch(`${base}/api/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(90_000),
    });
    const globalData = await globalRes.json().catch(() => null);

    // Dept-Analysen für alle aktiven Profile mit departmentId
    const deptIds = [
      ...new Set(
        (settings.reportProfiles ?? [])
          .filter((p) => p.enabled && p.departmentId != null)
          .map((p) => String(p.departmentId))
      ),
    ];
    const deptResults: Record<string, unknown> = {};
    for (const deptId of deptIds) {
      try {
        const res = await fetch(`${base}/api/ai/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ departmentId: deptId }),
          signal: AbortSignal.timeout(90_000),
        });
        deptResults[deptId] = await res.json().catch(() => null);
      } catch (err) {
        deptResults[deptId] = { error: String(err) };
      }
    }

    return NextResponse.json({ global: globalData, departments: deptResults });
  }
  const departmentId = body.departmentId != null ? String(body.departmentId) : undefined;

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

  // Wenn Abteilungsfilter: Queue-Nummern auflösen
  let queueFilter: string[] | undefined;
  if (departmentId) {
    const resolved = await resolveQueueNumbersForDepartment(Number(departmentId));
    queueFilter = resolved.length > 0 ? resolved : undefined;
  }

  const [queueData, dbStats] = await Promise.all([
    fetchEnrichedQueues().catch(() => null),
    collectFullDayStats(queueFilter),
  ]);

  const allQueues = queueData?.queues ?? [];
  const queues = queueFilter
    ? allQueues.filter((q) => queueFilter!.includes(String(q.Number)))
    : allQueues;
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

  // ─── Snapshot speichern (nur bei globaler Analyse) ───────────────────────
  // Dept-Analysen dürfen den globalen Snapshot-Buffer nicht mit Partial-Daten überschreiben

  let trend: ReturnType<typeof buildAiTrendContext> = null;
  if (!departmentId) {
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
    trend = buildAiTrendContext(allSnapshots);
  } else {
    // Dept-Analyse: globale Snapshots laden und auf Dept-Queues filtern
    const { loadTodaySnapshots } = await import("@/lib/snapshots");
    const globalSnapshots = await loadTodaySnapshots();
    const deptQueueNames = new Set(queuesSummary.map((q) => q.name));
    const filteredSnapshots = globalSnapshots.map((snap) => ({
      ...snap,
      queues: snap.queues.filter((q) => deptQueueNames.has(q.name)),
    }));
    trend = buildAiTrendContext(filteredSnapshots);
  }

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

  // Wochentag Europe/Berlin für Öffnungszeiten-Kontext
  const berlinDay = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long" });
  const berlinTime = new Date().toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  const openingHours =
    ["Samstag"].includes(berlinDay) ? "09:00–13:00 Uhr" :
    ["Sonntag"].includes(berlinDay) ? "geschlossen" :
    "07:00–18:00 Uhr";
  const isOpen = berlinDay !== "Sonntag" && (() => {
    const [h, m] = berlinTime.split(":").map(Number);
    const mins = h * 60 + m;
    if (berlinDay === "Samstag") return mins >= 9 * 60 && mins < 13 * 60;
    return mins >= 7 * 60 && mins < 18 * 60;
  })();

  const systemPrompt =
    "Du bist ein Call-Center-Analyse-Assistent für ein 3CX-Telefonanlage-Dashboard. " +
    "Analysiere Echtzeit- UND Tagesverlaufsdaten. Erkenne Muster, Peaks und Probleme im Tagesverlauf. " +
    "Bewerte Besetzung und SLA IMMER relativ zu den Öffnungszeiten: " +
    "Mo–Fr 07:00–18:00 Uhr, Sa 09:00–13:00 Uhr, So geschlossen. " +
    "Anrufe oder Agenten außerhalb der Öffnungszeiten sind kein Problem. " +
    "Antworte NUR mit validem JSON.";

  const userPrompt =
    `Aktuell: ${berlinDay}, ${berlinTime} Uhr — Betrieb ${isOpen ? "GEÖFFNET" : "GESCHLOSSEN"} (${openingHours})\n` +
    `3CX-Daten:\n${JSON.stringify(currentData)}\n\n` +
    `Felderklärungen:\n` +
    `- 'aktive_anrufe_gesamt': Anzahl aktiver Gespräche/Anrufe im System gerade (systemweit, nicht gefiltert)\n` +
    `- 'aktive_anrufe_status.talking': Davon aktive Gespräche (Teilnehmer verbunden)\n` +
    `- 'aktive_anrufe_status.ringing': Davon klingelnd (noch nicht angenommen)\n` +
    `- 'aktive_anrufe_status.held': Davon in der Warteschleife gehalten\n` +
    `- 'warteschlangen': Liste der Warteschlangen (Queues) — jede Queue hat folgende Felder:\n` +
    `    name: Name der Queue\n` +
    `    agenten_angemeldet: Anzahl eingeloggter Agenten in dieser Queue\n` +
    `    agenten_gesamt: Gesamtzahl zugewiesener Agenten dieser Queue\n` +
    `    agenten_im_gespraech: Agenten die gerade aktiv telefonieren\n` +
    `    wartende_anrufe: Anzahl Anrufe die GERADE in dieser Queue warten (0 = niemand wartet aktuell, NICHT: 0 Queues vorhanden)\n` +
    `- 'datenbank_heute': CDR-Daten aus PostgreSQL (historische Anrufe heute, zuverlässig)\n` +
    `    gesamt: Gesamtzahl eingehender Anrufe heute\n` +
    `    angenommen: Davon angenommene Anrufe\n` +
    `    abgebrochen: Vom Anrufer aufgelegte Anrufe\n` +
    `    nicht_in_20s: Anrufe die länger als 20 Sekunden gewartet haben (SLA-Verletzung)\n` +
    `    avg_wartezeit_s / max_wartezeit_s: Durchschnittliche/maximale Wartezeit in Sekunden\n` +
    `    abwurf1/abwurf2: Anrufe die zur 1./2. Overflow-Queue weitergeleitet wurden\n` +
    `- 'datenbank_heute.stundenverteilung': Anrufvolumen pro Stunde ({"08":23,"09":45,...})\n` +
    `- 'datenbank_heute.queues': Pro-Queue-Statistik mit nicht_in_20s und avg_wartezeit_s\n` +
    `- 'verlauf_heute': Echtzeit-Snapshots der Agenten-Besetzung über den heutigen Tag\n\n` +
    `Hinweise:\n` +
    `- Öffnungszeiten: Mo–Fr 07:00–18:00, Sa 09:00–13:00, So geschlossen\n` +
    `- Anrufe/Besetzungsprobleme außerhalb der Öffnungszeiten IGNORIEREN\n` +
    `- Erkenne NUR innerhalb der Öffnungszeiten: Stoßzeiten, SLA-Probleme (nicht_in_20s), Queue-Unterbesetzung, Abwurf-Kaskaden\n\n` +
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

  const analysisPath = getAnalysisPath(departmentId);
  await fs.mkdir(path.dirname(analysisPath), { recursive: true });
  await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2), "utf-8");

  return NextResponse.json(analysis);
}
