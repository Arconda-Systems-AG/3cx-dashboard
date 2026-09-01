import { NextResponse } from "next/server";

// Entfernt (01.09.2026): reines Anzeige-Dashboard — keine Anrufsteuerung.
export async function POST() {
  return NextResponse.json(
    { error: "Anrufsteuerung ist deaktiviert (Anzeige-Dashboard)." },
    { status: 410 }
  );
}
