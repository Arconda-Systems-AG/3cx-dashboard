import { NextResponse } from "next/server";
import { isSettingsAuthorized } from "@/lib/settings-auth";

// Verwaltet die Cloudflare-Access-Policy (wer darf die externe URL öffnen).
// Instanz-Konfiguration über env: CF_API_TOKEN, CF_ACCOUNT_ID,
// CF_ACCESS_APP_ID, CF_ACCESS_POLICY_ID (per K8s-Secret cf-access).
function cfEnv() {
  const token = process.env.CF_API_TOKEN;
  const account = process.env.CF_ACCOUNT_ID;
  const appId = process.env.CF_ACCESS_APP_ID;
  const policyId = process.env.CF_ACCESS_POLICY_ID;
  if (!token || !account || !appId || !policyId) return null;
  return { token, account, appId, policyId };
}

interface IncludeRule {
  email?: { email: string };
  email_domain?: { domain: string };
}

const policyUrl = (e: NonNullable<ReturnType<typeof cfEnv>>) =>
  `https://api.cloudflare.com/client/v4/accounts/${e.account}/access/apps/${e.appId}/policies/${e.policyId}`;

export async function GET(request: Request) {
  if (!(await isSettingsAuthorized(request))) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const env = cfEnv();
  if (!env) {
    return NextResponse.json({ configured: false });
  }
  try {
    const res = await fetch(policyUrl(env), {
      headers: { Authorization: `Bearer ${env.token}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (!data.success) {
      return NextResponse.json({ error: JSON.stringify(data.errors) }, { status: 502 });
    }
    const include: IncludeRule[] = data.result.include ?? [];
    return NextResponse.json({
      configured: true,
      policyName: data.result.name,
      domains: include.filter((r) => r.email_domain).map((r) => r.email_domain!.domain),
      emails: include.filter((r) => r.email).map((r) => r.email!.email),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isSettingsAuthorized(request))) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const env = cfEnv();
  if (!env) {
    return NextResponse.json({ error: "Cloudflare-Access nicht konfiguriert (env fehlt)" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const domains: string[] = (body.domains ?? [])
      .map((d: string) => String(d).trim().toLowerCase().replace(/^@/, ""))
      .filter((d: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
    const emails: string[] = (body.emails ?? [])
      .map((e: string) => String(e).trim().toLowerCase())
      .filter((e: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e));

    if (domains.length === 0 && emails.length === 0) {
      return NextResponse.json(
        { error: "Mindestens eine Domain oder E-Mail-Adresse nötig — sonst sperrt ihr euch aus." },
        { status: 400 }
      );
    }

    const include: IncludeRule[] = [
      ...domains.map((domain) => ({ email_domain: { domain } })),
      ...emails.map((email) => ({ email: { email } })),
    ];

    // Bestehende Policy holen und nur include ersetzen (Name/decision behalten)
    const getRes = await fetch(policyUrl(env), {
      headers: { Authorization: `Bearer ${env.token}` },
      cache: "no-store",
    });
    const existing = await getRes.json();
    if (!existing.success) {
      return NextResponse.json({ error: JSON.stringify(existing.errors) }, { status: 502 });
    }

    const putRes = await fetch(policyUrl(env), {
      method: "PUT",
      headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: existing.result.name,
        decision: existing.result.decision,
        include,
        exclude: existing.result.exclude ?? [],
        require: existing.result.require ?? [],
        precedence: existing.result.precedence,
      }),
    });
    const updated = await putRes.json();
    if (!updated.success) {
      return NextResponse.json({ error: JSON.stringify(updated.errors) }, { status: 502 });
    }
    return NextResponse.json({ ok: true, domains, emails });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
