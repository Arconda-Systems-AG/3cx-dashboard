// Läuft einmal beim Serverstart (Next.js Instrumentation Hook).
// Startet den Live-History-Sammler (Ringpuffer für die Problem-Historie).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLiveHistoryCollector } = await import("@/lib/live-history");
    startLiveHistoryCollector();
  }
}
