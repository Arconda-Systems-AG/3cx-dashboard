import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, SystemInfo } from "@3cx-dash/types";

export async function GET() {
  try {
    // SystemStatus ist ein Singleton in der XAPI v1 → GET, kein POST
    const data = await xapiFetch<SystemInfo>("SystemStatus");
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
