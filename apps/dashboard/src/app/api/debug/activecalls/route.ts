import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

/**
 * GET /api/debug/activecalls
 *
 * Gibt ALLE ActiveCalls-Felder ungefiltert zurück.
 * Zweck: Prüfen ob 3CX bei Queue-Verteilung separate Ringing-Legs
 * für Agenten erstellt (Callee = Agenten-DN, Status = "Ringing").
 *
 * Test: Anruf in Queue eingehend + Phone eines Agenten klingelt lassen,
 * dann diesen Endpoint aufrufen und Rückmeldung ansehen.
 */
export async function GET() {
  try {
    // 1. Alle Calls ohne $select → alle Felder sichtbar
    const all = await xapiFetch<{ value: Record<string, unknown>[] }>("ActiveCalls");

    // 2. Nur Ringing-Calls extra hervorheben
    const ringing = (all.value ?? []).filter((c) => c.Status === "Ringing");
    const talking = (all.value ?? []).filter((c) => c.Status === "Talking");

    return NextResponse.json({
      total: all.value?.length ?? 0,
      ringingCount: ringing.length,
      talkingCount: talking.length,
      // Alle Felder des ersten Calls (Feldnamen-Übersicht)
      availableFields: all.value?.[0] ? Object.keys(all.value[0]) : [],
      // Alle Ringing-Calls komplett
      ringing,
      // Alle Talking-Calls komplett
      talking,
      // Alle Calls (max 20)
      allCalls: (all.value ?? []).slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
