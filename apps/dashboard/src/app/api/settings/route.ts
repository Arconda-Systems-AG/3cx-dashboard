import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

const PW_PLACEHOLDER = "••••••••";

export async function GET() {
  try {
    const settingsPath = getSettingsPath();
    const content = await fs.readFile(settingsPath, "utf-8");
    const settings: AppSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    // Passwörter maskieren — niemals Klartextpasswort an den Client schicken
    if (settings.smtpPassword) settings.smtpPassword = PW_PLACEHOLDER;
    if (settings.pgPassword) settings.pgPassword = PW_PLACEHOLDER;
    if (settings.aiApiKey) settings.aiApiKey = PW_PLACEHOLDER;
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function POST(request: Request) {
  try {
    const body: Partial<AppSettings> = await request.json();
    const settingsPath = getSettingsPath();

    // Verzeichnis erstellen falls nicht vorhanden
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });

    // Bestehende Einstellungen lesen und mergen
    let existing = DEFAULT_SETTINGS;
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      existing = { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    } catch {}

    // Passwort-Placeholder nicht übernehmen — nur echte Werte speichern
    if (body.smtpPassword === PW_PLACEHOLDER) delete body.smtpPassword;
    if (body.pgPassword === PW_PLACEHOLDER) delete body.pgPassword;
    if (body.aiApiKey === PW_PLACEHOLDER) delete body.aiApiKey;

    const updated: AppSettings = { ...existing, ...body };
    await fs.writeFile(settingsPath, JSON.stringify(updated, null, 2), "utf-8");

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
