import { promises as fs } from "fs";
import path from "path";
import { xapiFetch } from "@/lib/threecx-client";
import { fetchEnrichedQueues } from "@/lib/queue-data";
import type { ODataList } from "@3cx-dash/types";

// Ringpuffer der Live-Kennzahlen pro Queue (3h) auf dem Settings-PVC.
// Serverseitiger Timer (Start via instrumentation.ts) — sammelt unabhängig
// davon, ob jemand das Dashboard offen hat. Kennzahlen, die es in der CDR-DB
// NICHT gibt: Wartende, freie Agenten, eingeloggt, längste aktuelle Wartezeit.

const SAMPLE_INTERVAL_MS = 60_000;
const WINDOW_MS = 3 * 60 * 60 * 1000;

export interface LiveSample {
  t: string;
  // pro Queue-Nummer: [wartend, frei, eingeloggt, längste Wartezeit s]
  q: Record<string, [number, number, number, number]>;
}

function historyPath(): string {
  const dir = process.env.SETTINGS_PATH
    ? path.dirname(process.env.SETTINGS_PATH)
    : path.join(process.cwd(), "data");
  return path.join(dir, "live-history.json");
}

export async function loadHistory(): Promise<LiveSample[]> {
  try {
    const raw = JSON.parse(await fs.readFile(historyPath(), "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

interface ActiveCallLive {
  Callee: string;
  LastChangeStatus?: string;
  ServerNow?: string;
}

async function takeSample(): Promise<void> {
  const { queues } = await fetchEnrichedQueues();
  const queueNumbers = new Set(queues.map((q) => String(q.Number)));

  // Längste Wartezeit pro Queue: Callee == Queue-DN, seit Anrufbeginn
  const callsData = await xapiFetch<ODataList<ActiveCallLive>>(
    "ActiveCalls?$select=Callee,LastChangeStatus,ServerNow"
  ).catch(() => ({ value: [] as ActiveCallLive[] }));
  const serverNow = callsData.value[0]?.ServerNow
    ? Date.parse(callsData.value[0].ServerNow)
    : Date.now();
  const longestByQueue = new Map<string, number>();
  for (const c of callsData.value) {
    const qn = String(c.Callee ?? "").split(" ")[0];
    if (!queueNumbers.has(qn) || !c.LastChangeStatus) continue;
    const secs = Math.floor((serverNow - Date.parse(c.LastChangeStatus)) / 1000);
    if (secs > (longestByQueue.get(qn) ?? -1)) longestByQueue.set(qn, secs);
  }

  const sample: LiveSample = { t: new Date().toISOString(), q: {} };
  for (const q of queues) {
    if ((q.Agents?.length ?? 0) === 0) continue;
    const number = String(q.Number);
    const free = (q.Agents ?? []).filter(
      (a) => a.QueueStatus === "LoggedIn" && a.IsRegistered && !a.HasActiveCall
    ).length;
    sample.q[number] = [
      q.WaitingCallCount ?? 0,
      free,
      q.LoggedInAgents ?? 0,
      longestByQueue.get(number) ?? 0,
    ];
  }

  const cutoff = Date.now() - WINDOW_MS;
  const history = (await loadHistory()).filter((s) => Date.parse(s.t) >= cutoff);
  history.push(sample);
  const p = historyPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  // atomar: erst temp, dann rename — halbe Dateien bei Absturz vermeiden
  await fs.writeFile(p + ".tmp", JSON.stringify(history), "utf-8");
  await fs.rename(p + ".tmp", p);
}

// ─── Timer (einmal pro Node-Prozess) ─────────────────────────────────────────
const g = globalThis as unknown as { __liveHistoryTimer?: ReturnType<typeof setInterval> };

export function startLiveHistoryCollector(): void {
  if (g.__liveHistoryTimer) return;
  g.__liveHistoryTimer = setInterval(() => {
    takeSample().catch(() => {
      // XAPI nicht erreichbar o.ä. — Sample überspringen, nächste Minute erneut
    });
  }, SAMPLE_INTERVAL_MS);
  // Erstes Sample zeitnah nach dem Start
  setTimeout(() => takeSample().catch(() => {}), 10_000);
}
