import { NextResponse } from "next/server";
import { trackAccess } from "@/lib/access-tracker";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, ActiveCall } from "@3cx-dash/types";

export async function GET(request: Request) {
  trackAccess(request);
  try {
    const data = await xapiFetch<ODataList<ActiveCall>>(
      "ActiveCalls?$select=Id,Caller,Callee,Status,EstablishedAt,LastChangeStatus,ServerNow"
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
