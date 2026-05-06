import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

interface Group {
  Id: number;
  Name: string;
}

export async function GET() {
  try {
    const data = await xapiFetch<{ value: Group[] }>("Groups?$select=Id,Name&$orderby=Name");
    const groups = (data.value ?? [])
      .filter((g) => !g.Name.startsWith("__"))
      .map((g) => ({ id: g.Id, name: g.Name }));
    return NextResponse.json({ groups });
  } catch (err: unknown) {
    const e = err as Error & { requires2fa?: boolean };
    if (e.requires2fa) {
      return NextResponse.json({ requires2fa: true }, { status: 401 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
