// Serverinterner Taktgeber für /api/cron/tick (KI-Zeitplan + E-Mail-Berichte).
// Es gibt keinen externen K8s-CronJob — ohne diesen Timer liefen die
// zeitgesteuerten Dienste nur, solange zufällig ein Browser offen war.

const TICK_INTERVAL_MS = 60_000;

const g = globalThis as unknown as {
  __cronRunner?: boolean;
  __cronTickRunning?: boolean;
};

async function tick(): Promise<void> {
  if (g.__cronTickRunning) return; // Überlappung vermeiden (KI-Läufe können Minuten dauern)
  g.__cronTickRunning = true;
  try {
    const port = Number(process.env.PORT) || 3031;
    await fetch(`http://127.0.0.1:${port}/api/cron/tick`, {
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
  } catch {
    // Server startet noch / KI-Backend down — nächste Minute erneut
  } finally {
    g.__cronTickRunning = false;
  }
}

export function startCronRunner(): void {
  if (g.__cronRunner) return;
  g.__cronRunner = true;
  setInterval(() => void tick(), TICK_INTERVAL_MS);
  // erster Tick kurz nach dem Start (Server muss lauschen)
  setTimeout(() => void tick(), 20_000);
}
