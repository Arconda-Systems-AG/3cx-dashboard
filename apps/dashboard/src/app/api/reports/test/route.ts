import { NextResponse } from "next/server";

// Alias: POST /api/reports/test → POST /api/reports/daily mit { test: true }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { POST: dailyPost } = await import("../daily/route");
  const fakeRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ ...body, test: true }),
  });
  return dailyPost(fakeRequest);
}
