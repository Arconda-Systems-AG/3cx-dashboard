import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

async function readSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeSettings(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

// POST /api/systems/[id]/activate – Telefonanlage aktivieren
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const settings = await readSettings();

    const exists = settings.systems.some((s) => s.id === id);
    if (!exists) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    settings.activeSystemId = id;
    await writeSettings(settings);

    return NextResponse.json({ ok: true, activeSystemId: id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
