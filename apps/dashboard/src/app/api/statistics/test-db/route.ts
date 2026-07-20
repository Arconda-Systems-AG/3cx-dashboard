import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { createPoolFromConfig } from "@/lib/pg";

const PW_PLACEHOLDER = "••••••••";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { host, port, database, user, systemId } = body;
    let { password } = body;

    if (!host) {
      return NextResponse.json({ ok: false, error: "Host fehlt" }, { status: 400 });
    }

    // Leeres oder Platzhalter-Passwort → gespeichertes Passwort verwenden.
    // Sonst würde der Test mit leerem String fehlschlagen, obwohl ein Passwort gespeichert ist.
    if (!password || password === PW_PLACEHOLDER) {
      const settings = await loadSettings();
      const sys = systemId ? settings.systems?.find((s) => s.id === systemId) : undefined;
      password = sys?.pgPassword ?? settings.pgPassword ?? "";
    }

    const start = Date.now();
    const pool = createPoolFromConfig({
      host,
      port: Number(port) || 5432,
      database: database || "postgres",
      user: user || "postgres",
      password: password || "",
    });

    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
      await pool.end();
    }

    return NextResponse.json({ ok: true, latency: Date.now() - start });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) });
  }
}
