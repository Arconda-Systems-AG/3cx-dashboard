import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { xapiFetch } from "@/lib/threecx-client";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import { createPool } from "@/lib/pg";
import type { ODataList } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import type { AppSettings } from "@3cx-dash/types";

// Status-Werte, die "Anrufer wartet noch in der Queue" bedeuten (noch kein Agent verbunden).
// Bewusst tolerant, bis an Live-Daten final verifiziert (sla-live nutzt "Ringing",
// queue-data nutzt "Rerouting" — wir decken beide + "Routing" ab).
const WAITING_STATUSES = new Set(["Rerouting", "Ringing", "Routing"]);

interface ActiveCallLive {
  Id: number;
  Caller: string;
  Callee: string;
  Status: string;
  LastChangeStatus?: string;
  ServerNow?: string;
}

interface QueueThresholds {
  maxWaiting: number;   // Überlastung: mehr Wartende als …
  waitSeconds: number;  // Fallback-Wartezeit-Schwelle, wenn Queue-SLATime = 0
  slaTargetPct: number; // SLA-Tagesquote-Schwelle (Sorgenkind-Kennzeichnung)
  slaMinCalls: number;  // Mindest-Anrufe heute, damit SLA-% aussagekräftig ist
}

function getSettingsPath(): string {
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

function parseDn(field: string): string {
  return (field ?? "").split(" ")[0];
}

export async function GET() {
  try {
    const settings = await loadSettings();
    const activeSystem = settings.systems?.find((s) => s.id === settings.activeSystemId);
    const t: QueueThresholds = {
      maxWaiting: (activeSystem as any)?.qpMaxWaiting ?? (settings as any).qpMaxWaiting ?? 5,
      waitSeconds: (activeSystem as any)?.qpWaitSeconds ?? (settings as any).qpWaitSeconds ?? 20,
      slaTargetPct: (activeSystem as any)?.qpSlaTarget ?? (settings as any).qpSlaTarget ?? 50,
      slaMinCalls: (activeSystem as any)?.qpSlaMinCalls ?? (settings as any).qpSlaMinCalls ?? 10,
    };

    // 1) Angereicherte Queues (Wartende, eingeloggte Agenten, SLATime)
    const { queues } = await fetchEnrichedQueues();

    // 2) Live-Wartezeit pro Queue aus ActiveCalls (LastChangeStatus)
    const callsData = await xapiFetch<ODataList<ActiveCallLive>>(
      "ActiveCalls?$select=Id,Caller,Callee,Status,LastChangeStatus,ServerNow"
    ).catch(() => ({ value: [] as ActiveCallLive[] }));
    const serverNow = callsData.value[0]?.ServerNow
      ? Date.parse(callsData.value[0].ServerNow)
      : Date.now();
    const longestWaitByQueue = new Map<string, number>();
    for (const c of callsData.value) {
      if (!WAITING_STATUSES.has(c.Status) || !c.LastChangeStatus) continue;
      const q = parseDn(c.Callee);
      const secs = Math.floor((serverNow - Date.parse(c.LastChangeStatus)) / 1000);
      if (secs > (longestWaitByQueue.get(q) ?? -1)) longestWaitByQueue.set(q, secs);
    }

    // 3) SLA-Tagesquote pro Queue aus der CDR-DB (heute, Europe/Berlin) — nur mit genug Volumen
    const slaTodayByQueue = new Map<string, { pct: number; calls: number; within: number }>();
    try {
      const pool = await createPool();
      if (pool) {
        const res = await pool.query(
          `SELECT stats.q AS queue,
                  COUNT(*) AS calls,
                  COUNT(*) FILTER (WHERE stats.wait <= $1) AS within_sla,
                  ROUND(100.0 * COUNT(*) FILTER (WHERE stats.wait <= $1) / NULLIF(COUNT(*),0), 1) AS sla_pct
             FROM (
               SELECT q.destination_dn_number AS q,
                      EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at)) AS wait
                 FROM public.cdroutput q
                WHERE q.destination_dn_type = 'queue'
                  AND q.source_participant_is_incoming = true
                  AND q.source_entity_type != 'queue'
                  AND q.cdr_started_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin')
             ) stats
            GROUP BY 1`,
          [t.waitSeconds]
        );
        for (const row of res.rows)
          slaTodayByQueue.set(String(row.queue), {
            pct: Number(row.sla_pct),
            calls: Number(row.calls),
            within: Number(row.within_sla),
          });
        await pool.end();
      }
    } catch {
      // CDR-DB optional — ohne sie fehlt nur die SLA-Tagesquote-Kennzeichnung
    }

    // 4) Probleme prüfen. Akut (rot) = Echtzeit; SLA-Sorgenkind (orange) = Tagesbilanz.
    const problemQueues = queues
      .map((q: any) => {
        const number = String(q.Number);
        const waiting = q.WaitingCallCount ?? 0;
        const active = q.ActiveCallCount ?? 0;
        const loggedIn = q.LoggedInAgents ?? 0;
        const longestWait = longestWaitByQueue.get(number) ?? 0;
        const waitLimit = q.SLATime && q.SLATime > 0 ? q.SLATime : t.waitSeconds;
        const sla = slaTodayByQueue.get(number);

        // Freie Agenten = eingeloggt, registriert UND nicht im Gespräch
        const freeAgents = (q.Agents ?? []).filter(
          (a: any) => a.QueueStatus === "LoggedIn" && a.IsRegistered && !a.HasActiveCall
        ).length;

        const acuteProblems: string[] = [];
        if (waiting > t.maxWaiting) acuteProblems.push(`Überlastung: ${waiting} wartende Anrufer`);
        if (longestWait > waitLimit) acuteProblems.push(`Wartezeit ${longestWait}s > ${waitLimit}s`);
        if (freeAgents === 0 && (waiting > 0 || active > 0))
          acuteProblems.push(
            loggedIn === 0
              ? `Kein Agent eingeloggt bei ${waiting + active} Anruf(en)`
              : `Kein freier Agent (${loggedIn} im Gespräch) bei ${waiting + active} Anruf(en)`
          );

        // SLA-Sorgenkind nur mit genug Volumen (sonst rauscht es bei 341 Queues)
        const slaProblem =
          sla && sla.calls >= t.slaMinCalls && sla.pct < t.slaTargetPct
            ? `SLA heute ${sla.pct}% < ${t.slaTargetPct}% (${sla.calls} Anrufe)`
            : null;

        const problems = [...acuteProblems, ...(slaProblem ? [slaProblem] : [])];
        return {
          number,
          name: q.Name,
          waiting,
          active,
          loggedInAgents: loggedIn,
          freeAgents,
          totalAgents: (q.Agents ?? []).length,
          longestWaitSeconds: longestWait,
          waitLimit,
          slaTodayPct: sla ? sla.pct : null,
          slaTodayCalls: sla ? sla.calls : null,
          slaTodayWithin: sla ? sla.within : null,
          slaTodayOver: sla ? sla.calls - sla.within : null,
          acute: acuteProblems.length > 0,
          problems,
        };
      })
      .filter((q) => q.problems.length > 0)
      // akute zuerst, dann schlechteste SLA
      .sort(
        (a, b) =>
          Number(b.acute) - Number(a.acute) ||
          b.waiting - a.waiting ||
          (a.slaTodayPct ?? 999) - (b.slaTodayPct ?? 999)
      );

    return NextResponse.json({
      generatedAt: new Date(serverNow).toISOString(),
      thresholds: t,
      totalQueues: queues.length,
      acuteCount: problemQueues.filter((q) => q.acute).length,
      slaOnlyCount: problemQueues.filter((q) => !q.acute).length,
      problemCount: problemQueues.length,
      queues: problemQueues,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
