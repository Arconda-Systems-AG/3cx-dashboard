import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

export async function POST(_req: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await params;
    // XAPI: POST /xapi/v1/ActiveCalls({id})/Pbx.DropCall
    const result = await xapiFetch(`ActiveCalls(${callId})/Pbx.DropCall`, {
      method: "POST",
      body: "{}",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
