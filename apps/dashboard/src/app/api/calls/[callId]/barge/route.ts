import { NextResponse } from "next/server";
import { callControlFetch } from "@/lib/threecx-client";

export async function POST(_req: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await params;
    const result = await callControlFetch(`${callId}/Barge`, { method: "POST", body: "{}" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
