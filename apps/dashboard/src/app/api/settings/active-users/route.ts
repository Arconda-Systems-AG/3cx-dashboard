import { NextResponse } from "next/server";
import { isSettingsAuthorized } from "@/lib/settings-auth";
import { getActiveUsers, trackAccess } from "@/lib/access-tracker";

export async function GET(request: Request) {
  if (!(await isSettingsAuthorized(request))) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  trackAccess(request);
  return NextResponse.json({ users: getActiveUsers() });
}
