import { promises as fs } from "fs";
import path from "path";

export interface QueueSnapshot {
  t: string;
  queues: Array<{ name: string; loggedIn: number; total: number; inCall: number; waiting: number }>;
  calls: number;
  talking: number;
}

// ─── Pfad für den heutigen Tag (Europe/Berlin) ────────────────────────────────

function getTodayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); // "2026-05-08"
}

function getSnapshotDir(): string {
  return process.env.SETTINGS_PATH
    ? path.dirname(process.env.SETTINGS_PATH)
    : path.join(process.cwd(), "data");
}

function getSnapshotPath(dateKey: string): string {
  return path.join(getSnapshotDir(), `snapshots-${dateKey}.json`);
}

// ─── Snapshots laden ──────────────────────────────────────────────────────────

export async function loadTodaySnapshots(): Promise<QueueSnapshot[]> {
  try {
    const content = await fs.readFile(getSnapshotPath(getTodayKey()), "utf-8");
    return JSON.parse(content) as QueueSnapshot[];
  } catch {
    return [];
  }
}

// ─── Snapshot anhängen (ganzer Tag — kein Limit) ─────────────────────────────

export async function appendSnapshot(snap: QueueSnapshot): Promise<QueueSnapshot[]> {
  const dateKey = getTodayKey();
  const filePath = getSnapshotPath(dateKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let existing: QueueSnapshot[] = [];
  try {
    const content = await fs.readFile(filePath, "utf-8");
    existing = JSON.parse(content) as QueueSnapshot[];
  } catch {}

  const updated = [...existing, snap];
  await fs.writeFile(filePath, JSON.stringify(updated), "utf-8");
  return updated;
}

// ─── Tages-Zusammenfassung für KI-Prompt ─────────────────────────────────────

export interface HourBucket {
  stunde: string;           // "08", "09", ...
  anrufe_max: number;
  talking_max: number;
  snapshots: number;
  queues: Record<string, { avg_angemeldet: number; min: number; max: number }>;
}

export function buildDaySummary(snapshots: QueueSnapshot[]): {
  messwerte: number;
  stunden: HourBucket[];
  peak_anrufe: number;
  peak_stunde: string;
  queue_names: string[];
} | null {
  if (snapshots.length < 2) return null;

  const queueNames = [...new Set(snapshots.flatMap((s) => s.queues.map((q) => q.name)))];

  // Gruppieren nach Stunde (Europe/Berlin)
  const byHour: Record<string, QueueSnapshot[]> = {};
  for (const snap of snapshots) {
    const hour = new Date(snap.t).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hour12: false,
    });
    if (!byHour[hour]) byHour[hour] = [];
    byHour[hour].push(snap);
  }

  const stunden: HourBucket[] = Object.entries(byHour)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stunde, snaps]) => {
      const queues: HourBucket["queues"] = {};
      for (const name of queueNames) {
        const vals = snaps
          .map((s) => s.queues.find((q) => q.name === name)?.loggedIn ?? 0);
        queues[name] = {
          avg_angemeldet: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
          min: Math.min(...vals),
          max: Math.max(...vals),
        };
      }
      return {
        stunde,
        anrufe_max: Math.max(...snaps.map((s) => s.calls)),
        talking_max: Math.max(...snaps.map((s) => s.talking)),
        snapshots: snaps.length,
        queues,
      };
    });

  const peakBucket = stunden.reduce((a, b) => (a.anrufe_max >= b.anrufe_max ? a : b), stunden[0]);

  return {
    messwerte: snapshots.length,
    stunden,
    peak_anrufe: peakBucket?.anrufe_max ?? 0,
    peak_stunde: peakBucket?.stunde ?? "–",
    queue_names: queueNames,
  };
}

// ─── Kompaktes KI-Summary (Token-sparend) ────────────────────────────────────

export function buildAiTrendContext(snapshots: QueueSnapshot[]): Record<string, unknown> | null {
  const summary = buildDaySummary(snapshots);
  if (!summary) return null;

  return {
    verlauf_heute: {
      messwerte: summary.messwerte,
      peak_anrufe: summary.peak_anrufe,
      peak_stunde: summary.peak_stunde,
      stunden: summary.stunden.map((h) => ({
        h: h.stunde,
        calls: h.anrufe_max,
        talking: h.talking_max,
        agenten: Object.fromEntries(
          Object.entries(h.queues).map(([name, v]) => [name, v.avg_angemeldet])
        ),
      })),
    },
  };
}
