import { NextResponse } from "next/server";
import { createPoolFromConfig } from "@/lib/pg";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { host, port, database, user, password } = body;

    if (!host) {
      return NextResponse.json({ ok: false, error: "Host fehlt" }, { status: 400 });
    }

    const start = Date.now();
    const pool = createPoolFromConfig({
      host,
      port: Number(port) || 5432,
      database: database || "postgres",
      user: user || "postgres",
      password: password || "",
    });

    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
      await pool.end();
    }

    return NextResponse.json({ ok: true, latency: Date.now() - start });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) });
  }
}
