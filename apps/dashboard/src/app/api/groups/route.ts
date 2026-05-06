import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

interface GroupMember {
  Number?: string;
  UserId?: number;
}

interface Group {
  Id: number;
  Name: string;
  Members?: GroupMember[];
}

export async function GET() {
  try {
    const data = await xapiFetch<{ value: Group[] }>(
      "Groups?$select=Id,Name&$expand=Members($select=Number)"
    );
    const groups = (data.value ?? [])
      .filter((g) => !g.Name.startsWith("__"))
      .map((g) => ({
        id: g.Id,
        name: g.Name,
        memberNumbers: (g.Members ?? []).map((m) => m.Number).filter(Boolean) as string[],
      }));
    return NextResponse.json({ groups });
  } catch (err: unknown) {
    const e = err as Error & { requires2fa?: boolean };
    if (e.requires2fa) {
      return NextResponse.json({ requires2fa: true }, { status: 401 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
