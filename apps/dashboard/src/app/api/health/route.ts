import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/threecx-client";

export async function GET() {
  try {
    // Prüft ob Token-Auth funktioniert (ohne Admin-Rechte nötig)
    await getAccessToken();
    return NextResponse.json({
      connected: true,
      url: process.env.THREECX_URL ?? "unknown",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}
