import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, Extension } from "@3cx-dash/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const top = searchParams.get("top");
    const filter = searchParams.get("filter");
    const select =
      searchParams.get("select") ??
      "Id,Number,FirstName,LastName,CurrentProfileName,IsRegistered,Internal,QueueStatus,Enabled,OutboundCallerID,EmailAddress";

    let path = `Users?$select=${encodeURIComponent(select)}`;
    if (top) path += `&$top=${top}`;
    if (filter) path += `&$filter=${encodeURIComponent(filter)}`;

    const data = await xapiFetch<ODataList<Extension>>(path);
    return NextResponse.json(data);
  } catch (error) {
    // Fallback: Peers endpoint
    try {
      const data = await xapiFetch<ODataList<Extension>>("Peers?$select=Number,DisplayName,Registered");
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await xapiFetch<Extension>("Users", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
