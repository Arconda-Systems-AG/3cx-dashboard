import { NextResponse } from "next/server";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import { appendSnapshot, type QueueSnapshot } from "@/lib/snapshots";

export async function POST() {
  try {
    const { queues, activeCalls, activeDns } = await fetchEnrichedQueues();

    const snap: QueueSnapshot = {
      t: new Date().toISOString(),
      queues: queues
        .filter((q) => (q.Agents?.length ?? 0) > 0)
        .map((q) => ({
          name: q.Name,
          loggedIn: q.LoggedInAgents ?? 0,
          total: q.Agents?.length ?? 0,
          inCall: (q.Agents ?? []).filter((a) => activeDns.has(a.Number)).length,
          waiting: q.WaitingCallCount ?? 0,
        })),
      calls: activeCalls.length,
      talking: activeCalls.filter((c) => c.Status === "Talking").length,
    };

    await appendSnapshot(snap);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
