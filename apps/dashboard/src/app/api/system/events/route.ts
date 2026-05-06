import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, EventLogEntry } from "@3cx-dash/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const top = searchParams.get("top") ?? "50";
    const filter = searchParams.get("filter");
    const orderby = searchParams.get("orderby") ?? "TimeGenerated desc";

    let path = `EventLogs?$top=${top}&$orderby=${encodeURIComponent(orderby)}`;
    if (filter) path += `&$filter=${encodeURIComponent(filter)}`;

    const data = await xapiFetch<ODataList<EventLogEntry>>(path);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
