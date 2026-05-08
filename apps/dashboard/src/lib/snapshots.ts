import { promises as fs } from "fs";
import path from "path";

export interface QueueSnapshot {
  t: string;
  queues: Array<{ name: string; loggedIn: number; total: number; inCall: number; waiting: number }>;
  calls: number;
  talking: number;
}

const MAX_SNAPSHOTS = 12; // ~1 Stunde bei 5-min-Intervall

function getSnapshotPath(): string {
  return process.env.SETTINGS_PATH
    ? path.join(path.dirname(process.env.SETTINGS_PATH), "queue-snapshots.json")
    : path.join(process.cwd(), "data", "queue-snapshots.json");
}

export async function loadSnapshots(): Promise<QueueSnapshot[]> {
  try {
    const content = await fs.readFile(getSnapshotPath(), "utf-8");
    return JSON.parse(content) as QueueSnapshot[];
  } catch {
    return [];
  }
}

export async function appendSnapshot(snap: QueueSnapshot): Promise<QueueSnapshot[]> {
  const existing = await loadSnapshots();
  const updated = [...existing, snap].slice(-MAX_SNAPSHOTS);
  const filePath = getSnapshotPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(updated), "utf-8");
  return updated;
}

export function buildTrendSummary(snapshots: QueueSnapshot[]): Record<string, unknown> | null {
  if (snapshots.length < 2) return null;

  const queueNames = [...new Set(snapshots.flatMap((s) => s.queues.map((q) => q.name)))];

  const queueTrends = queueNames.map((name) => {
    const entries = snapshots
      .map((s) => s.queues.find((q) => q.name === name))
      .filter(Boolean) as QueueSnapshot["queues"];
    const loggedInValues = entries.map((e) => e.loggedIn);
    const avg = loggedInValues.reduce((a, b) => a + b, 0) / loggedInValues.length;
    const min = Math.min(...loggedInValues);
    const max = Math.max(...loggedInValues);
    const latest = loggedInValues[loggedInValues.length - 1] ?? 0;
    return { name, avg: Math.round(avg * 10) / 10, min, max, jetzt: latest };
  });

  const callValues = snapshots.map((s) => s.calls);
  return {
    messwerte: snapshots.length,
    zeitraum_min: Math.round(
      (new Date(snapshots[snapshots.length - 1].t).getTime() - new Date(snapshots[0].t).getTime()) / 60_000
    ),
    anrufe_avg: Math.round(callValues.reduce((a, b) => a + b, 0) / callValues.length),
    anrufe_max: Math.max(...callValues),
    warteschlangen: queueTrends,
  };
}
