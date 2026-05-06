import { Pool } from "pg";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";

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

export async function createPool(): Promise<Pool | null> {
  const settings = await loadSettings();
  if (!settings.pgHost) return null;

  return new Pool({
    host: settings.pgHost,
    port: settings.pgPort ?? 5432,
    database: settings.pgDatabase ?? "postgres",
    user: settings.pgUser ?? "postgres",
    password: settings.pgPassword ?? "",
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 3,
  });
}

export interface PgConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function createPoolFromConfig(config: PgConfig): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 5000,
    max: 1,
  });
}
