import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { MakeCallRequest } from "@3cx-dash/types";

export async function POST(request: Request) {
  try {
    const body: MakeCallRequest = await request.json();
    if (!body.destination) {
      return NextResponse.json({ error: "destination fehlt" }, { status: 400 });
    }

    // XAPI: POST /xapi/v1/Users/Pbx.MakeCall
    // "dn" = Quell-Nebenstelle, "destination" = Ziel-Nummer
    const result = await xapiFetch<{ FinalStatus: string; ReasonText: string }>(
      "Users/Pbx.MakeCall",
      {
        method: "POST",
        body: JSON.stringify({
          destination: body.destination,
          ...(body.source ? { dn: body.source } : {}),
        }),
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
