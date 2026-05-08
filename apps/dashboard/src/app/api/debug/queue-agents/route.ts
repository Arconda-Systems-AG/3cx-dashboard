import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, Queue } from "@3cx-dash/types";

export async function GET() {
  try {
    const [queuesData, extData] = await Promise.all([
      xapiFetch<ODataList<Queue>>("Queues?$expand=Agents"),
      xapiFetch<ODataList<{ Number: string; QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean }>>(
        "Users?$select=Number,QueueStatus,CurrentProfileName,IsRegistered"
      ),
    ]);

    const extMap = new Map(extData.value.map((e) => [e.Number, e]));

    const summary = queuesData.value
      .filter((q) => (q.Agents?.length ?? 0) > 0)
      .slice(0, 5)
      .map((q) => {
        const agents = (q.Agents ?? []).slice(0, 3).map((a) => {
          const ext = extMap.get(a.Number);
          return {
            number: a.Number,
            name: a.Name,
            rawQueueStatus: ext?.QueueStatus,
            rawProfile: ext?.CurrentProfileName,
            isRegistered: ext?.IsRegistered,
            inExtMap: !!ext,
          };
        });
        return { queue: q.Name, agentCount: q.Agents?.length, agents };
      });

    return NextResponse.json({
      totalQueues: queuesData.value.length,
      totalExtensions: extData.value.length,
      sampleQueues: summary,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
