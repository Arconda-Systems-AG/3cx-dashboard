// Läuft einmal beim Serverstart (Next.js Instrumentation Hook).
// Startet den Live-History-Sammler (Ringpuffer für die Problem-Historie)
// und den Cron-Taktgeber (KI-Zeitplan + E-Mail-Berichte).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLiveHistoryCollector } = await import("@/lib/live-history");
    startLiveHistoryCollector();
    const { startCronRunner } = await import("@/lib/cron-runner");
    startCronRunner();
  }
}
