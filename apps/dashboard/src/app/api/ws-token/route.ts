import { NextResponse } from "next/server";
import { getTokenForWebSocket } from "@/lib/threecx-client";

export async function GET() {
  try {
    const { token, wsUrl } = await getTokenForWebSocket();
    return NextResponse.json({ token, wsUrl });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 401 });
  }
}
