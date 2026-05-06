import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, ActiveCall } from "@3cx-dash/types";

export async function GET() {
  try {
    const data = await xapiFetch<ODataList<ActiveCall>>(
      "ActiveCalls?$select=Id,Caller,Callee,Status,EstablishedAt,LastChangeStatus,ServerNow"
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
