import { NextResponse } from "next/server";
import { fetchEnrichedQueues } from "@/lib/queue-data";

export async function GET() {
  try {
    const { queues, activeCalls } = await fetchEnrichedQueues();
    return NextResponse.json({ value: queues, "@odata.count": queues.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
