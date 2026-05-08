import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { createPool } from "@/lib/pg";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

export async function GET() {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    const settings: AppSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(content) };

    const activeSystem = settings.systems?.find((s) => s.id === settings.activeSystemId);

    const resolvedHost = activeSystem?.pgHost || settings.pgHost || null;
    const resolvedPassword = (activeSystem?.pgPassword || settings.pgPassword) ? "SET" : "EMPTY";

    // Try to connect
    let dbStatus: { ok: boolean; error?: string; latency?: number } = { ok: false };
    try {
      const pool = await createPool();
      if (!pool) {
        dbStatus = { ok: false, error: "Pool null — kein pgHost konfiguriert" };
      } else {
        const t = Date.now();
        await pool.query("SELECT 1");
        dbStatus = { ok: true, latency: Date.now() - t };
        await pool.end();
      }
    } catch (e) {
      dbStatus = { ok: false, error: String(e) };
    }

    return NextResponse.json({
      activeSystemId: settings.activeSystemId,
      activeSystemName: activeSystem?.name ?? null,
      // Per-system config
      system: {
        pgHost: activeSystem?.pgHost ?? null,
        pgPort: activeSystem?.pgPort ?? null,
        pgDatabase: activeSystem?.pgDatabase ?? null,
        pgUser: activeSystem?.pgUser ?? null,
        pgPassword: activeSystem?.pgPassword ? "SET" : "EMPTY",
      },
      // Top-level fallback
      topLevel: {
        pgHost: settings.pgHost ?? null,
        pgPassword: settings.pgPassword ? "SET" : "EMPTY",
      },
      // What createPool actually uses
      resolved: {
        host: resolvedHost,
        password: resolvedPassword,
        source: activeSystem?.pgHost ? "system" : (settings.pgHost ? "top-level fallback" : "none"),
      },
      dbTest: dbStatus,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
