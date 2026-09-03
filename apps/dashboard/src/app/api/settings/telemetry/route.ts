import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import { isSettingsAuthorized } from "@/lib/settings-auth";
import type { ODataList } from "@3cx-dash/types";

// Anlagen-Telemetrie (CPU/RAM/Disk) aus der 3CX-eigenen Historie:
// GET /xapi/v1/SystemStatus/Pbx.SystemTelemetry() — ~2-Min-Takt, Wochen an
// Daten. Nur für den geschützten Einstellungen-Bereich.
interface TelemetryRow {
  Time: string;
  CpuUsage: number;
  TotalVirtualMemory: number;
  FreeVirtualMemory: number;
  TotalPhysicalMemory: number;
  FreePhysicalMemory: number;
  TotalDiskSpace: number;
  FreeDiskSpace: number;
  TickCount: number;
}

const MAX_POINTS = 500;

export async function GET(request: Request) {
  if (!(await isSettingsAuthorized(request))) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const hours = Math.min(Math.max(Number(searchParams.get("hours")) || 24, 1), 14 * 24);

  try {
    const data = await xapiFetch<ODataList<TelemetryRow>>(
      "SystemStatus/Pbx.SystemTelemetry()",
      { signal: AbortSignal.timeout(30_000) }
    );
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const rows = (data.value ?? []).filter((r) => Date.parse(r.Time) >= cutoff);
    // Auf max. MAX_POINTS ausdünnen (jeden n-ten Punkt)
    const step = Math.max(1, Math.ceil(rows.length / MAX_POINTS));
    const sampled = rows.filter((_, i) => i % step === 0);

    const points = sampled.map((r) => ({
      t: r.Time,
      cpu: Math.round(r.CpuUsage * 10) / 10,
      ramPct: r.TotalPhysicalMemory > 0
        ? Math.round((1 - r.FreePhysicalMemory / r.TotalPhysicalMemory) * 1000) / 10
        : 0,
      vramPct: r.TotalVirtualMemory > 0
        ? Math.round((1 - r.FreeVirtualMemory / r.TotalVirtualMemory) * 1000) / 10
        : 0,
      diskFreeGb: Math.round(r.FreeDiskSpace / 1e9 * 10) / 10,
    }));

    const last = rows[rows.length - 1];
    return NextResponse.json({
      hours,
      points,
      current: last
        ? {
            t: last.Time,
            cpu: Math.round(last.CpuUsage * 10) / 10,
            ramPct: Math.round((1 - last.FreePhysicalMemory / last.TotalPhysicalMemory) * 1000) / 10,
            ramUsedGb: Math.round((last.TotalPhysicalMemory - last.FreePhysicalMemory) / 1e9 * 10) / 10,
            ramTotalGb: Math.round(last.TotalPhysicalMemory / 1e9 * 10) / 10,
            vramPct: Math.round((1 - last.FreeVirtualMemory / last.TotalVirtualMemory) * 1000) / 10,
            diskFreeGb: Math.round(last.FreeDiskSpace / 1e9 * 10) / 10,
            diskTotalGb: Math.round(last.TotalDiskSpace / 1e9 * 10) / 10,
            diskUsedPct: last.TotalDiskSpace > 0
              ? Math.round((1 - last.FreeDiskSpace / last.TotalDiskSpace) * 1000) / 10
              : 0,
            uptimeDays: Math.round(last.TickCount / 86_400_000 * 10) / 10,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
