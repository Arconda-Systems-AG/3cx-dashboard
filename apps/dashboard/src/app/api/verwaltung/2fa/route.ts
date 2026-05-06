import { NextResponse } from "next/server";
import { completeWith2FA } from "@/lib/threecx-client";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
    await completeWith2FA(String(code));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 401 });
  }
}
