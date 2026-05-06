import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

interface CallHistorySegment {
  SegmentId: number;
  SegmentStartTime: string;
  DstDnType: number;
  CallAnswered: boolean;
}

export async function GET() {
  try {
    // Echte 3CX-Daten (keine DB nötig):
    // DstDnType=4 = Queue-Anruf, CallAnswered=false = nicht angenommen
    // $top=300 holt die neuesten 300 verpassten Queue-Anrufe; client-seitig auf 60 Min filtern
    const data = await xapiFetch<{ value: CallHistorySegment[] }>(
      "CallHistoryView?$filter=CallAnswered eq false and DstDnType eq 4" +
        "&$orderby=SegmentStartTime desc&$top=300" +
        "&$select=SegmentId,SegmentStartTime,DstDnType,CallAnswered",
      { signal: AbortSignal.timeout(15_000) }
    );

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const missed_count = (data.value ?? []).filter(
      (s) => new Date(s.SegmentStartTime) >= since
    ).length;

    return NextResponse.json({ missed_count });
  } catch (err) {
    return NextResponse.json({ missed_count: null, error: String(err) });
  }
}
