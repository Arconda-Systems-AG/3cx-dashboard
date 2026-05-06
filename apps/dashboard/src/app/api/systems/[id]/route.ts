import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, ThreeCXSystem } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { invalidateTokenCache } from "@/lib/threecx-client";

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

// PATCH /api/systems/[id] – Telefonanlage bearbeiten
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: Partial<ThreeCXSystem> = await request.json();
    const settings = await readSettings();

    const idx = settings.systems.findIndex((s) => s.id === id);
    if (idx === -1) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    const existing = settings.systems[idx];

    // Leere Secrets = bestehende behalten
    const updated: ThreeCXSystem = {
      ...existing,
      name: body.name?.trim() ?? existing.name,
      url: body.url?.replace(/\/$/, "").trim() ?? existing.url,
      authMethod: body.authMethod ?? existing.authMethod,
    };

    if (updated.authMethod === "client_credentials") {
      updated.clientId = body.clientId ?? existing.clientId;
      if (body.clientSecret) updated.clientSecret = body.clientSecret;
      delete updated.webUser;
      delete updated.webPassword;
    } else {
      updated.webUser = body.webUser ?? existing.webUser;
      if (body.webPassword) updated.webPassword = body.webPassword;
      delete updated.clientId;
      delete updated.clientSecret;
    }

    settings.systems[idx] = updated;
    await writeSettings(settings);

    // Token-Cache für diese Anlage leeren
    invalidateTokenCache(id);

    const { clientSecret, webPassword, ...sanitized } = updated;
    return NextResponse.json({ system: { ...sanitized, hasSecret: !!(clientSecret || webPassword) } });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/systems/[id] – Telefonanlage löschen
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const settings = await readSettings();

    const idx = settings.systems.findIndex((s) => s.id === id);
    if (idx === -1) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    settings.systems.splice(idx, 1);

    // Aktive Anlage anpassen wenn gelöscht
    if (settings.activeSystemId === id) {
      settings.activeSystemId = settings.systems[0]?.id ?? "";
    }

    await writeSettings(settings);
    invalidateTokenCache(id);

    return NextResponse.json({ ok: true, activeSystemId: settings.activeSystemId });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
