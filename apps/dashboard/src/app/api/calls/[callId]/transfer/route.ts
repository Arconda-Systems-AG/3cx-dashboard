import { NextResponse } from "next/server";

export async function POST() {
  // Transfer ist in der 3CX XAPI v1 nicht verfügbar.
  // Die CallControl API (/callcontrol/) erfordert erweiterte API-Berechtigungen in 3CX.
  return NextResponse.json(
    { error: "Weiterleiten nicht verfügbar: CallControl API erfordert erweiterte 3CX-Berechtigungen." },
    { status: 501 }
  );
}
