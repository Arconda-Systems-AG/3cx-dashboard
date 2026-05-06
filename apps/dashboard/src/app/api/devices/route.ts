import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, PhoneDevice } from "@3cx-dash/types";

export async function GET() {
  try {
    const data = await xapiFetch<ODataList<PhoneDevice>>(
      "PhoneDevices?$select=Id,Extension,MacAddress,Model,FirmwareVersion,Status,IpAddress,LastSeenAt,Type"
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
