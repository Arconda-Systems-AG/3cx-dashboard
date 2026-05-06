import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";

interface GroupMember { Number: string }
interface User { Id: number; Number: string; OfficeHoursProps?: string[] }

async function getGroupUsers(groupId: number): Promise<User[]> {
  const membersData = await xapiFetch<{ value: GroupMember[] }>(
    `Groups(${groupId})/Members?$select=Number`
  );
  const memberNumbers = membersData.value.map((m) => m.Number);
  if (memberNumbers.length === 0) return [];

  const usersData = await xapiFetch<{ value: User[] }>(
    `Users?$top=500&$select=Id,Number,OfficeHoursProps`
  );
  const numberSet = new Set(memberNumbers.map(String));
  return usersData.value.filter((u) => numberSet.has(String(u.Number)));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = Number(searchParams.get("groupId"));
    if (!groupId) return NextResponse.json({ error: "groupId fehlt" }, { status: 400 });

    const users = await getGroupUsers(groupId);
    const firstUser = users[0];

    return NextResponse.json({
      autoAvailable: firstUser
        ? (firstUser.OfficeHoursProps ?? []).includes("AutoSwitchProfiles")
        : false,
      // restrictOutbound is not configurable via xAPI — kept for future support
      restrictOutbound: false,
    });
  } catch (err: unknown) {
    const e = err as Error & { requires2fa?: boolean };
    if (e.requires2fa) return NextResponse.json({ requires2fa: true }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { groupId, autoAvailable }
      : { groupId: number; autoAvailable: boolean; restrictOutbound?: boolean }
      = await request.json();

    if (!groupId) return NextResponse.json({ error: "groupId erforderlich" }, { status: 400 });

    const users = await getGroupUsers(groupId);
    if (users.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    const officeHoursProps = autoAvailable ? ["AutoSwitchProfiles"] : [];

    let updated = 0;
    await Promise.all(
      users.map(async (user) => {
        await xapiFetch(`Users(${user.Id})`, {
          method: "PATCH",
          body: JSON.stringify({ Id: user.Id, OfficeHoursProps: officeHoursProps }),
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
