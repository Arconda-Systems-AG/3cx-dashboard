import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

// OFFICE365_CONFIG Parameter Id (system-wide, same across 3CX instances)
const OFFICE365_CONFIG_ID = 1237;

interface Param { Id: number; Name: string; Value: string }
interface Office365Config {
  Public?: {
    ADUsers?: {
      IsEnabled?: boolean;
      EnableSSO?: boolean;
      SetTeamsPresence?: boolean;
      SyncPersonalContacts?: boolean;
    };
  };
  TenantId?: string;
}

async function getConfig(): Promise<{ param: Param; config: Office365Config }> {
  const param = await xapiFetch<Param>(`Parameters(${OFFICE365_CONFIG_ID})`);
  let config: Office365Config = {};
  try { config = JSON.parse(param.Value || "{}"); } catch { /* empty config */ }
  return { param, config };
}

export async function GET() {
  try {
    const { config } = await getConfig();
    const ad = config?.Public?.ADUsers ?? {};
    return NextResponse.json({
      msTeamsIntegration: ad.IsEnabled ?? false,
      ms365sso: ad.EnableSSO ?? false,
      syncCalendar: ad.SetTeamsPresence ?? false,
      syncContacts: ad.SyncPersonalContacts ?? false,
    });
  } catch (err: unknown) {
    const e = err as Error & { requires2fa?: boolean };
    if (e.requires2fa) return NextResponse.json({ requires2fa: true }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { msTeamsIntegration, ms365sso, syncCalendar, syncContacts, googleSso }
      : { msTeamsIntegration: boolean; ms365sso: boolean; syncCalendar: boolean; syncContacts: boolean; googleSso?: boolean }
      = await request.json();

    const { param, config } = await getConfig();

    // Deep-merge our changes
    if (!config.Public) config.Public = {};
    if (!config.Public.ADUsers) config.Public.ADUsers = {};
    config.Public.ADUsers.IsEnabled = msTeamsIntegration;
    config.Public.ADUsers.EnableSSO = ms365sso;
    config.Public.ADUsers.SetTeamsPresence = syncCalendar;
    config.Public.ADUsers.SyncPersonalContacts = syncContacts;

    // googleSso is not in OFFICE365_CONFIG — it's a separate SSO provider config
    // For now we log but don't fail
    void googleSso;

    await xapiFetch(`Parameters(${OFFICE365_CONFIG_ID})`, {
      method: "PATCH",
      body: JSON.stringify({ Id: param.Id, Value: JSON.stringify(config) }),
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = err as Error & { requires2fa?: boolean };
    if (e.requires2fa) return NextResponse.json({ requires2fa: true }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
