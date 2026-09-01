import { NextResponse } from "next/server";
import { trackAccess } from "@/lib/access-tracker";
import { promises as fs } from "fs";
import path from "path";
import { xapiFetch } from "@/lib/threecx-client";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import { createPool } from "@/lib/pg";
import type { ODataList } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import type { AppSettings } from "@3cx-dash/types";

// "Anrufer wartet noch in Queue X" wird über den CALLEE erkannt, nicht den Status:
// Live-verifiziert (01.09): Bei Annahme wechselt der Callee zur Agenten-Extension
// (37/38 verbundene Gespräche hatten Callee=Extension). Solange Callee die Queue-DN
// ist, hat KEIN Agent angenommen — der Anruf wartet (Talking = Warteschleife/Ansage,
// Ringing = klingelt, Rerouting = Umleitungs-Moment). Interne Vermittlungs-Legs
// (Callee="ROUTER") matchen keine Queue-DN und fallen automatisch raus.
// Wartezeit = serverNow − EstablishedAt (== LastChangeStatus, konstant = Anrufbeginn).

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

// Geschäftszeiten (wie KI-Analyse): Mo–Fr 07–18, Sa 09–13, So zu (Europe/Berlin).
// Gate für die "Unbesetzt"-Meldung — sonst fluten nachts alle Queues die Ansicht.
function isBusinessHours(): boolean {
  const berlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const day = berlin.getDay(); // 0=So
  const mins = berlin.getHours() * 60 + berlin.getMinutes();
  if (day === 0) return false;
  if (day === 6) return mins >= 9 * 60 && mins < 13 * 60;
  return mins >= 7 * 60 && mins < 18 * 60;
}

export async function GET(request: Request) {
  trackAccess(request);
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

    // 2) Live-Wartezeit pro Queue aus ActiveCalls: Warter = Callee ist eine Queue-DN
    //    (siehe Kommentar oben), Wartezeit seit Anrufbeginn (LastChangeStatus == EstablishedAt).
    const queueNumbers = new Set(queues.map((q: any) => String(q.Number)));
    const callsData = await xapiFetch<ODataList<ActiveCallLive>>(
      "ActiveCalls?$select=Id,Caller,Callee,Status,LastChangeStatus,ServerNow"
    ).catch(() => ({ value: [] as ActiveCallLive[] }));
    const serverNow = callsData.value[0]?.ServerNow
      ? Date.parse(callsData.value[0].ServerNow)
      : Date.now();
    const longestWaitByQueue = new Map<string, number>();
    for (const c of callsData.value) {
      const q = parseDn(c.Callee);
      if (!queueNumbers.has(q) || !c.LastChangeStatus) continue;
      const secs = Math.floor((serverNow - Date.parse(c.LastChangeStatus)) / 1000);
      if (secs > (longestWaitByQueue.get(q) ?? -1)) longestWaitByQueue.set(q, secs);
    }

    // 3) SLA-Tagesquote pro EINGANGS-Queue aus der CDR-DB (heute, Europe/Berlin).
    //    End-to-end über Overflow-Kaskaden: ein Anruf (main_call_history_id) zählt zur
    //    ersten Queue, in die er kam; Wartezeit = bis zur ersten echten Agenten-Annahme
    //    (Extension mit cdr_answered_at). Overflow-Ziel-Queues (z.B. Kiel 20/40) tauchen
    //    dadurch NICHT als eigene Sorgenkinder auf, der Verursacher (Eingang) schon.
    const slaTodayByQueue = new Map<string, { pct: number; calls: number; within: number }>();
    try {
      const pool = await createPool();
      if (pool) {
        const res = await pool.query(
          `WITH calls AS (
             SELECT main_call_history_id
               FROM public.cdroutput
              WHERE destination_dn_type = 'queue'
                AND cdr_started_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin')
              GROUP BY main_call_history_id
           ),
           agg AS (
             SELECT
               (array_agg(c.destination_dn_number ORDER BY c.cdr_started_at)
                  FILTER (WHERE c.destination_dn_type = 'queue'))[1] AS entry_queue,
               min(c.cdr_started_at) FILTER (WHERE c.destination_dn_type = 'queue') AS arrival_ts,
               min(c.cdr_answered_at) FILTER (WHERE c.destination_dn_type = 'extension'
                                                AND c.cdr_answered_at IS NOT NULL) AS answer_ts
               FROM public.cdroutput c
               JOIN calls USING (main_call_history_id)
              GROUP BY c.main_call_history_id
           )
           SELECT entry_queue AS queue,
                  COUNT(*) AS calls,
                  COUNT(*) FILTER (
                    WHERE answer_ts IS NOT NULL AND answer_ts >= arrival_ts
                      AND extract(epoch FROM (answer_ts - arrival_ts)) <= $1
                  ) AS within_sla,
                  ROUND(100.0 * COUNT(*) FILTER (
                    WHERE answer_ts IS NOT NULL AND answer_ts >= arrival_ts
                      AND extract(epoch FROM (answer_ts - arrival_ts)) <= $1
                  ) / NULLIF(COUNT(*),0), 1) AS sla_pct
             FROM agg
            WHERE entry_queue IS NOT NULL
            GROUP BY entry_queue`,
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
        // Akut: kein freier Agent UND jemand wartet (Anrufer hängt fest)
        if (freeAgents === 0 && waiting > 0)
          acuteProblems.push(
            loggedIn === 0
              ? `Kein Agent eingeloggt, ${waiting} warten`
              : `Kein freier Agent (${loggedIn} im Gespräch), ${waiting} warten`
          );

        // Am Limit (Vorwarnung): kein freier Agent, niemand wartet. Zwei Fälle:
        // (a) Agenten eingeloggt, aber alle belegt (auch durch fremde Calls).
        // (b) UNBESETZT: 0 eingeloggt — nur während Geschäftszeiten und nur für
        //     Queues mit relevantem Tagesverkehr (sonst fluten nachts/inaktive
        //     Queues die Ansicht).
        const atLimitText =
          freeAgents === 0 && waiting === 0
            ? loggedIn > 0
              ? active > 0
                ? `Am Limit: ${active} Gespräch(e) · kein freier Agent`
                : `Am Limit: kein freier Agent (${loggedIn} eingeloggt, alle belegt)`
              : sla && sla.calls >= t.slaMinCalls && isBusinessHours()
                ? `Unbesetzt: 0 Agenten eingeloggt (${sla.calls} Anrufe heute)`
                : null
            : null;

        // SLA-Sorgenkind nur mit genug Volumen (sonst rauscht es bei 341 Queues)
        const slaProblemText =
          sla && sla.calls >= t.slaMinCalls && sla.pct < t.slaTargetPct
            ? `SLA heute ${sla.pct}% < ${t.slaTargetPct}% (${sla.calls} Anrufe)`
            : null;

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
          atLimit: atLimitText !== null,
          isSlaProblem: slaProblemText !== null,
          acuteProblems,
          atLimitText,
          slaProblemText,
        };
      })
      .filter((q) => q.acute || q.atLimit || q.isSlaProblem)
      // akut zuerst, dann am Limit, dann schlechteste SLA
      .sort(
        (a, b) =>
          Number(b.acute) - Number(a.acute) ||
          Number(b.atLimit) - Number(a.atLimit) ||
          b.waiting - a.waiting ||
          (a.slaTodayPct ?? 999) - (b.slaTodayPct ?? 999)
      );

    return NextResponse.json({
      generatedAt: new Date(serverNow).toISOString(),
      thresholds: t,
      totalQueues: queues.length,
      // Zählweise = Sektionen der Seite (Doppelanzeige: SLA-Sorgenkinder
      // erscheinen ZUSÄTZLICH als akut/Limit-Karte)
      acuteCount: problemQueues.filter((q) => q.acute).length,
      atLimitCount: problemQueues.filter((q) => q.atLimit && !q.acute).length,
      // SLA-Sektion = alle mit schlechter Tages-SLA (stabil), inkl. der gerade akuten
      slaCount: problemQueues.filter((q) => q.isSlaProblem).length,
      problemCount: problemQueues.length,
      queues: problemQueues,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
