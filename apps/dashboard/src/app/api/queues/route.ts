import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, Queue, QueueAgent, ActiveCall } from "@3cx-dash/types";

/** Extrahiert die Nebenstellennummer aus einem ActiveCall-Feld ("11 Max Muster" → "11") */
function parseCallDn(field: string): string {
  return (field ?? "").split(" ")[0];
}

/**
 * Ein Agent ist "LoggedIn" wenn:
 * - QueueStatus = "LoggedIn" (Mitglied der Queue)
 * - UND CurrentProfileName = "Available" (aktiv, nimmt Anrufe an)
 *
 * QueueStatus allein reicht nicht — es zeigt nur Queue-Mitgliedschaft,
 * nicht ob der Agent gerade aktiv Anrufe annimmt.
 */
function isAgentLoggedIn(queueStatus?: string, profileName?: string): boolean {
  return queueStatus === "LoggedIn" && profileName === "Available";
}

export async function GET() {
  try {
    // Parallel: Queues + Extensions (QueueStatus + CurrentProfileName) + ActiveCalls
    const [queuesData, extData, callsData] = await Promise.all([
      xapiFetch<ODataList<Queue>>("Queues?$expand=Agents,Managers"),
      xapiFetch<ODataList<{ Number: string; QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean }>>(
        "Users?$select=Number,QueueStatus,CurrentProfileName,IsRegistered"
      ).catch(() => ({ value: [] as { Number: string; QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean }[] })),
      xapiFetch<ODataList<ActiveCall>>("ActiveCalls?$select=Id,Caller,Callee,Status,EstablishedAt").catch(
        () => ({ value: [] as ActiveCall[] })
      ),
    ]);

    // Number → { queueStatus, profileName, isRegistered }
    const extMap = new Map(
      extData.value.map((e) => [e.Number, {
        queueStatus: e.QueueStatus,
        profileName: e.CurrentProfileName,
        isRegistered: e.IsRegistered ?? false,
        currentProfile: e.CurrentProfileName ?? "Available",
      }])
    );

    // Alle aktiven DNs (Caller + Callee, any status)
    const activeDns = new Set<string>(
      callsData.value.flatMap((c) => [parseCallDn(c.Caller), parseCallDn(c.Callee)])
    );
    // Agent-ringing ist via XAPI nicht detektierbar (3CX erstellt kein separates Leg).
    // Stattdessen: WaitingCallCount pro Queue = Calls in Queue ohne EstablishedAt.

    // Agenten anreichern + LoggedInAgents + ActiveCallCount berechnen
    const enriched: Queue[] = queuesData.value.map((queue) => {
      const enrichedAgents: QueueAgent[] = (queue.Agents ?? []).map((agent) => {
        const ext = extMap.get(agent.Number);
        const loggedIn = isAgentLoggedIn(ext?.queueStatus, ext?.profileName);
        return {
          ...agent,
          QueueStatus: (loggedIn ? "LoggedIn" : "LoggedOut") as "LoggedIn" | "LoggedOut",
          IsRegistered: ext?.isRegistered ?? false,
          CurrentProfile: ext?.currentProfile ?? "Available",
          HasActiveCall: activeDns.has(agent.Number),
        };
      });

      const loggedInCount = enrichedAgents.filter((a) => a.QueueStatus === "LoggedIn" && a.IsRegistered).length;

      // Aktive Anrufe IN dieser Queue: Callee beginnt mit der Queue-Nummer
      const queueCalls = callsData.value.filter((c) => parseCallDn(c.Callee) === queue.Number);
      const activeCallCount = queueCalls.length;
      // Wartende (klingende) Calls: Status "Rerouting" = 3CX verteilt gerade an Agenten
      const waitingCallCount = queueCalls.filter((c) => c.Status === "Rerouting").length;

      return { ...queue, Agents: enrichedAgents, LoggedInAgents: loggedInCount, ActiveCallCount: activeCallCount, WaitingCallCount: waitingCallCount };
    });

    return NextResponse.json({ ...queuesData, value: enriched });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
