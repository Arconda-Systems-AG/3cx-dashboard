import { NextResponse } from "next/server";
import { verifyPassword, issueToken, isSettingsAuthorized, authCookieHeader } from "@/lib/settings-auth";

export async function GET(request: Request) {
  return NextResponse.json({ authorized: await isSettingsAuthorized(request) });
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    if (typeof password !== "string" || !(await verifyPassword(password))) {
      // kleine Bremse gegen Durchprobieren
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
    }
    const res = NextResponse.json({ authorized: true });
    res.headers.set("Set-Cookie", authCookieHeader(await issueToken()));
    return res;
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
