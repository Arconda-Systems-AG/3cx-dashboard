import { NextResponse } from "next/server";
import {
  verifyPassword,
  savePasswordHash,
  isSettingsAuthorized,
  issueToken,
  authCookieHeader,
} from "@/lib/settings-auth";

export async function POST(request: Request) {
  try {
    if (!(await isSettingsAuthorized(request))) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }
    const { current, next } = await request.json();
    if (typeof current !== "string" || !(await verifyPassword(current))) {
      return NextResponse.json({ error: "Aktuelles Passwort ist falsch" }, { status: 401 });
    }
    if (typeof next !== "string" || next.length < 8) {
      return NextResponse.json({ error: "Neues Passwort: mindestens 8 Zeichen" }, { status: 400 });
    }
    await savePasswordHash(next);
    // Neuen Token ausstellen — alte Tokens (HMAC über alten Hash) sind ab jetzt ungültig
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", authCookieHeader(await issueToken()));
    return res;
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
