import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

interface GroupMember { Number: string }
interface User { Id: number; Number: string }

export async function POST(request: Request) {
  try {
    const { groupId, roleName } = await request.json();
    if (!groupId || !roleName) {
      return NextResponse.json({ error: "groupId und roleName erforderlich" }, { status: 400 });
    }

    // 1. Mitglieder der Gruppe laden
    const membersData = await xapiFetch<{ value: GroupMember[] }>(
      `Groups(${groupId})/Members?$select=Number`
    );
    const memberNumbers = membersData.value.map((m) => m.Number);
    if (memberNumbers.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // 2. Alle Users laden → Number → Id mappen
    const usersData = await xapiFetch<{ value: User[] }>("Users?$select=Id,Number");
    const numberToId = new Map(usersData.value.map((u) => [String(u.Number), u.Id]));

    // 3. Für jeden Member: Rolle patchen
    let updated = 0;
    await Promise.all(
      memberNumbers.map(async (num) => {
        const userId = numberToId.get(String(num));
        if (!userId) return;
        await xapiFetch(`Users(${userId})`, {
          method: "PATCH",
          body: JSON.stringify({
            Id: userId,
            Groups: [{ GroupId: Number(groupId), Rights: { RoleName: roleName } }],
          }),
        });
        updated++;
      })
    );

    return NextResponse.json({ ok: true, updated });
  } catch (err: unknown) {
    const e = err as Error & { requires2fa?: boolean };
    if (e.requires2fa) return NextResponse.json({ requires2fa: true }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
