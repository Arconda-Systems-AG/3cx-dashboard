import { NextResponse } from "next/server";
import { trackAccess } from "@/lib/access-tracker";
import { getAccessToken, getActiveSystem } from "@/lib/threecx-client";

// 3CX-Status gecacht — verhindert CrashLoopBackOff wenn 3CX kurz nicht erreichbar ist
// (Liveness-Probe bekommt immer HTTP 200, Banner im Frontend zeigt den echten Status)
let cachedConnected = false;
let lastCheck = 0;
const CHECK_INTERVAL_MS = 30_000;

export async function GET(request: Request) {
  trackAccess(request);
  const now = Date.now();
  if (now - lastCheck > CHECK_INTERVAL_MS) {
    lastCheck = now;
    try {
      const system = await getActiveSystem();
      await getAccessToken(system);
      cachedConnected = true;
    } catch {
      cachedConnected = false;
    }
  }

  return NextResponse.json({
    ok: true,
    connected: cachedConnected,
    timestamp: new Date().toISOString(),
  });
}
