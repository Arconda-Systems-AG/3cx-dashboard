import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
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

// GET /api/systems – alle Telefonanlagen
export async function GET() {
  try {
    const settings = await readSettings();
    // Secrets aus der Antwort entfernen (nie zum Client senden)
    const sanitized = (settings.systems ?? []).map(sanitizeSystem);
    return NextResponse.json({
      systems: sanitized,
      activeSystemId: settings.activeSystemId,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/systems – neue Telefonanlage hinzufügen
export async function POST(request: Request) {
  try {
    const body: Omit<ThreeCXSystem, "id"> = await request.json();

    if (!body.name || !body.url || !body.authMethod) {
      return NextResponse.json({ error: "name, url und authMethod sind erforderlich" }, { status: 400 });
    }

    const settings = await readSettings();
    const newSystem: ThreeCXSystem = {
      id: randomUUID(),
      name: body.name.trim(),
      url: body.url.replace(/\/$/, "").trim(),
      authMethod: body.authMethod,
      ...(body.authMethod === "client_credentials"
        ? { clientId: body.clientId, clientSecret: body.clientSecret }
        : { webUser: body.webUser, webPassword: body.webPassword }),
      // DB config
      ...(body.pgHost ? { pgHost: body.pgHost } : {}),
      ...(body.pgPort ? { pgPort: body.pgPort } : {}),
      ...(body.pgDatabase ? { pgDatabase: body.pgDatabase } : {}),
      ...(body.pgUser ? { pgUser: body.pgUser } : {}),
      ...(body.pgPassword && body.pgPassword !== PW_PLACEHOLDER ? { pgPassword: body.pgPassword } : {}),
      // Branding
      ...(body.customerName ? { customerName: body.customerName } : {}),
      ...(body.customerLogoUrl ? { customerLogoUrl: body.customerLogoUrl } : {}),
    };

    settings.systems = [...(settings.systems ?? []), newSystem];

    // Erste Anlage automatisch aktivieren
    if (!settings.activeSystemId || settings.systems.length === 1) {
      settings.activeSystemId = newSystem.id;
    }

    await writeSettings(settings);
    return NextResponse.json({ system: sanitizeSystem(newSystem), activeSystemId: settings.activeSystemId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

const PW_PLACEHOLDER = "••••••••";

function sanitizeSystem(s: ThreeCXSystem) {
  const { clientSecret, webPassword, pgPassword, ...rest } = s;
  return {
    ...rest,
    hasSecret: !!(clientSecret || webPassword),
    pgPassword: pgPassword ? PW_PLACEHOLDER : "",
  };
}
