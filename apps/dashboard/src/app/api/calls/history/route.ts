import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, CallHistoryEntry } from "@3cx-dash/types";
import { parseIsoDuration } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // CallHistoryView unterstützt kein $filter – Sortierung nach Datum, Client filtert
    // Die View ist träge (~20s) → explizit 35s Timeout
    const path = `CallHistoryView?$orderby=SegmentStartTime desc&$top=${limit}&$skip=${offset}`;
    const data = await xapiFetch<ODataList<CallHistoryEntry>>(path, {
      signal: AbortSignal.timeout(35_000),
    });

    // CallTime (ISO-Duration "PT4M9S") → Duration in Millisekunden
    const enriched = (data.value ?? []).map((entry) => ({
      ...entry,
      Duration: entry.CallTime ? parseIsoDuration(entry.CallTime) : 0,
    }));

    return NextResponse.json({ ...data, value: enriched });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
