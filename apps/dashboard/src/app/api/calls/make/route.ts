import { NextResponse } from "next/server";

// Entfernt (01.09.2026): reines Anzeige-Dashboard — es werden keine Anrufe
// über die Anlage gestartet. 410 statt Löschung, damit alte Clients eine
// klare Antwort bekommen.
export async function POST() {
  return NextResponse.json(
    { error: "Anrufe starten ist deaktiviert (Anzeige-Dashboard)." },
    { status: 410 }
  );
}
