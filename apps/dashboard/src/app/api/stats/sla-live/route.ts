import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, SlaViolation } from "@3cx-dash/types";

interface ActiveCallLive {
  Id: number;
  Caller: string;
  Callee: string;
  Status: string;
  LastChangeStatus?: string;
  ServerNow?: string;
}

// Warter = Callee ist eine Queue-DN (bei Agenten-Annahme wechselt der Callee zur
// Extension — live-verifiziert). Der frühere Status-Filter ("Ringing") fand
// praktisch nie etwas, weil Warteschleifen-Anrufer als "Talking" erscheinen.
export async function GET() {
  try {
    const [queuesData, callsData] = await Promise.all([
      xapiFetch<ODataList<{ Number: string }>>("Queues?$select=Number").catch(
        () => ({ value: [] as { Number: string }[] })
      ),
      xapiFetch<ODataList<ActiveCallLive>>(
        "ActiveCalls?$select=Id,Caller,Callee,Status,LastChangeStatus,ServerNow"
      ).catch(() => ({ value: [] as ActiveCallLive[] })),
    ]);

    const queueNums = new Set(queuesData.value.map((q) => String(q.Number)));
    const serverNow =
      callsData.value[0]?.ServerNow
        ? Date.parse(callsData.value[0].ServerNow)
        : Date.now();

    const violations: SlaViolation[] = callsData.value
      .filter(
        (c) =>
          queueNums.has(String(c.Callee ?? "").split(" ")[0]) && c.LastChangeStatus
      )
      .map((c) => ({
        callId: c.Id,
        caller: c.Caller,
        callee: c.Callee,
        waitingSince: c.LastChangeStatus!,
        waitingSeconds: Math.floor((serverNow - Date.parse(c.LastChangeStatus!)) / 1000),
      }))
      .filter((c) => c.waitingSeconds > 20)
      .sort((a, b) => b.waitingSeconds - a.waitingSeconds);

    return NextResponse.json({ violations });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
