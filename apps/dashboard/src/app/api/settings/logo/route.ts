import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import type { AppSettings } from "@3cx-dash/types";

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
  const p = getSettingsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(settings, null, 2), "utf-8");
}

/** GET /api/settings/logo — gibt customerLogoUrl als Data-URL zurück */
export async function GET() {
  const settings = await readSettings();
  return NextResponse.json({ logoUrl: settings.customerLogoUrl ?? null });
}

/** POST /api/settings/logo — multipart/form-data mit Feld "logo" (File) */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("logo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Kein Logo übergeben" }, { status: 400 });
    }

    // Max 2 MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo zu groß (max. 2 MB)" }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const settings = await readSettings();
    settings.customerLogoUrl = dataUrl;
    await writeSettings(settings);

    return NextResponse.json({ logoUrl: dataUrl });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** DELETE /api/settings/logo — entfernt das Logo */
export async function DELETE() {
  try {
    const settings = await readSettings();
    delete settings.customerLogoUrl;
    await writeSettings(settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
