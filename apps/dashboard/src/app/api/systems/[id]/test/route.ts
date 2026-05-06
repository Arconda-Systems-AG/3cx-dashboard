import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, ThreeCXSystem } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { testSystemConnection } from "@/lib/threecx-client";

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

// POST /api/systems/[id]/test – Verbindungstest
// Body kann temporäre Credentials enthalten (für "Test vor dem Speichern")
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: Partial<ThreeCXSystem> | null = await request.json().catch(() => null);

    let system: ThreeCXSystem | undefined;

    if (body?.url && body?.authMethod) {
      // Temporäre Credentials direkt aus dem Request testen
      system = {
        id: id === "__new__" ? "__test__" : id,
        name: body.name ?? "Test",
        url: body.url.replace(/\/$/, "").trim(),
        authMethod: body.authMethod,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        webUser: body.webUser,
        webPassword: body.webPassword,
      };
    } else {
      // Gespeicherte Anlage testen
      const settings = await readSettings();
      system = settings.systems.find((s) => s.id === id);
      if (!system) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    const result = await testSystemConnection(system);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) });
  }
}
