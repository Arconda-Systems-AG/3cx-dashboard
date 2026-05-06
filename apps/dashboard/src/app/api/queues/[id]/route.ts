import { NextResponse } from "next/server";
import { xapiFetch } from "@/lib/threecx-client";
import type { Queue } from "@3cx-dash/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await xapiFetch<Queue>(`Queues(${id})?$expand=Agents,Managers`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
