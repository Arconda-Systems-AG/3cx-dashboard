import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";

function getDataPath(file: string): string {
  return process.env.SETTINGS_PATH
    ? path.join(path.dirname(process.env.SETTINGS_PATH), file)
    : path.join(process.cwd(), "data", file);
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getDataPath("settings.json"), "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface CronState {
  lastAiRun?: string;
  lastReportSent?: string;
  profileLastSent?: Record<string, string>;   // profileId → ISO timestamp
  deptAiLastRun?: Record<string, string>;     // departmentId → ISO timestamp
}

async function loadCronState(): Promise<CronState> {
  try {
    const content = await fs.readFile(getDataPath("cron-state.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveCronState(state: CronState) {
  const p = getDataPath("cron-state.json");
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(state, null, 2), "utf-8");
}

function berlinTime(): { dow: number; hour: number; minute: number } {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  return { dow: local.getDay(), hour: local.getHours(), minute: local.getMinutes() };
}

export async function GET(request: NextRequest) {
  const settings = await loadSettings();
  const state = await loadCronState();
  const now = new Date();
  const { dow, hour, minute } = berlinTime();

  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;

  const actions: string[] = [];

  // ─── KI-Analyse ──────────────────────────────────────────────
  const aiSched = settings.aiSchedule;
  if (aiSched?.enabled && settings.aiUrl) {
    const inDay = aiSched.days.includes(dow);
    const inTime = hour >= aiSched.fromHour && hour < aiSched.toHour;
    const lastRun = state.lastAiRun ? new Date(state.lastAiRun) : null;
    const minSince = lastRun ? (now.getTime() - lastRun.getTime()) / 60_000 : Infinity;

    if (inDay && inTime && minSince >= aiSched.intervalMinutes) {
      try {
        await fetch(`${base}/api/ai/analyze`, { method: "POST", signal: AbortSignal.timeout(90_000) });
        state.lastAiRun = now.toISOString();
        actions.push("ai-analyze");
      } catch (err) {
        actions.push(`ai-analyze-failed: ${String(err)}`);
      }

      // ─── Abteilungs-spezifische KI-Analysen ──────────────────────────────
      // Alle Departments aus aktiven Berichtsprofilen die eine departmentId haben
      const deptIds = [
        ...new Set(
          (settings.reportProfiles ?? [])
            .filter((p) => p.enabled && p.departmentId != null)
            .map((p) => String(p.departmentId))
        ),
      ];
      if (!state.deptAiLastRun) state.deptAiLastRun = {};
      for (const deptId of deptIds) {
        const lastDeptRun = state.deptAiLastRun[deptId] ? new Date(state.deptAiLastRun[deptId]) : null;
        const deptMinSince = lastDeptRun ? (now.getTime() - lastDeptRun.getTime()) / 60_000 : Infinity;
        if (deptMinSince >= aiSched.intervalMinutes) {
          try {
            await fetch(`${base}/api/ai/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ departmentId: deptId }),
              signal: AbortSignal.timeout(90_000),
            });
            state.deptAiLastRun[deptId] = now.toISOString();
            actions.push(`ai-analyze-dept-${deptId}`);
          } catch (err) {
            actions.push(`ai-analyze-dept-failed-${deptId}: ${String(err)}`);
          }
        }
      }
    }
  }

  // ─── E-Mail-Report ────────────────────────────────────────────
  const repSched = settings.reportSchedule;
  if (repSched?.enabled && settings.smtpHost && settings.reportRecipients) {
    const inDay = repSched.days.includes(dow);
    const [sendH, sendM] = repSched.sendTime.split(":").map(Number);
    const inWindow = hour === sendH && Math.abs(minute - sendM) <= 2;
    const lastSent = state.lastReportSent ? new Date(state.lastReportSent) : null;
    const hoursSince = lastSent ? (now.getTime() - lastSent.getTime()) / 3_600_000 : Infinity;

    if (inDay && inWindow && hoursSince > 23) {
      try {
        await fetch(`${base}/api/reports/daily`, { method: "POST", signal: AbortSignal.timeout(60_000) });
        state.lastReportSent = now.toISOString();
        actions.push("report-sent");
      } catch (err) {
        actions.push(`report-failed: ${String(err)}`);
      }
    }
  }

  // ─── Profil-Berichte ─────────────────────────────────────────────
  for (const profile of (settings.reportProfiles ?? [])) {
    if (!profile.enabled || !settings.smtpHost) continue;
    const inDay = profile.days.includes(dow);
    const [sendH, sendM] = profile.sendTime.split(":").map(Number);
    const inWindow = hour === sendH && Math.abs(minute - sendM) <= 2;
    const lastSentStr = state.profileLastSent?.[profile.id];
    const lastSent = lastSentStr ? new Date(lastSentStr) : null;
    const hoursSince = lastSent ? (now.getTime() - lastSent.getTime()) / 3_600_000 : Infinity;
    if (inDay && inWindow && hoursSince > 23) {
      try {
        await fetch(`${base}/api/reports/daily?profileId=${profile.id}`, { method: "POST", signal: AbortSignal.timeout(120_000) });
        if (!state.profileLastSent) state.profileLastSent = {};
        state.profileLastSent[profile.id] = now.toISOString();
        actions.push(`report-profile-${profile.id}`);
      } catch (err) {
        actions.push(`report-profile-failed-${profile.id}: ${String(err)}`);
      }
    }
  }

  await saveCronState(state);
  return NextResponse.json({ ok: true, time: now.toISOString(), dow, hour, minute, actions });
}
