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

export async function GET() {
  try {
    const callsData = await xapiFetch<ODataList<ActiveCallLive>>(
      "ActiveCalls?$select=Id,Caller,Callee,Status,LastChangeStatus,ServerNow"
    ).catch(() => ({ value: [] as ActiveCallLive[] }));

    const serverNow =
      callsData.value[0]?.ServerNow
        ? Date.parse(callsData.value[0].ServerNow)
        : Date.now();

    const violations: SlaViolation[] = callsData.value
      .filter((c) => c.Status === "Ringing" && c.LastChangeStatus)
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
