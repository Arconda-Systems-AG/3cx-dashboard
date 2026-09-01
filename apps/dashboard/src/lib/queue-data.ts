import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, Queue, QueueAgent, ActiveCall } from "@3cx-dash/types";

export interface EnrichedQueueData {
  queues: Queue[];
  activeCalls: ActiveCall[];
  activeDns: Set<string>;
}

function parseCallDn(field: string): string {
  return (field ?? "").split(" ")[0];
}

function isAgentLoggedIn(queueStatus?: string, profileName?: string): boolean {
  return queueStatus === "LoggedIn" && profileName === "Available";
}

export async function fetchEnrichedQueues(): Promise<EnrichedQueueData> {
  const [queuesData, extData, callsData] = await Promise.all([
    xapiFetch<ODataList<Queue>>("Queues?$expand=Agents,Managers"),
    xapiFetch<ODataList<{ Number: string; QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean }>>(
      "Users?$select=Number,QueueStatus,CurrentProfileName,IsRegistered"
    ).catch(() => ({ value: [] as { Number: string; QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean }[] })),
    xapiFetch<ODataList<ActiveCall>>("ActiveCalls?$select=Id,Caller,Callee,Status,EstablishedAt").catch(
      () => ({ value: [] as ActiveCall[] })
    ),
  ]);

  const extMap = new Map(
    extData.value.map((e) => [e.Number, {
      queueStatus: e.QueueStatus,
      profileName: e.CurrentProfileName,
      isRegistered: e.IsRegistered ?? false,
      currentProfile: e.CurrentProfileName ?? "Available",
    }])
  );

  const activeDns = new Set<string>(
    callsData.value.flatMap((c) => [parseCallDn(c.Caller), parseCallDn(c.Callee)])
  );

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
    // Live-verifiziert: Bei Agenten-Annahme wechselt der Callee zur Extension.
    // Callee == Queue-DN heißt also "wartet noch in dieser Queue" (Warteschleife/
    // klingelnd/Umleitung) — unabhängig vom Status. Verbundene Gespräche der Queue
    // laufen unter Callee=<Agent> und werden über die Agenten gezählt.
    const queueCalls = callsData.value.filter((c) => parseCallDn(c.Callee) === queue.Number);
    const waitingCallCount = queueCalls.length;
    const agentActiveCalls = enrichedAgents.filter((a) => a.HasActiveCall).length;

    return {
      ...queue,
      Agents: enrichedAgents,
      LoggedInAgents: loggedInCount,
      ActiveCallCount: agentActiveCalls,
      WaitingCallCount: waitingCallCount,
    };
  });

  return { queues: enriched, activeCalls: callsData.value, activeDns };
}
