import { NextResponse } from "next/server";

// Alias: POST /api/reports/test → POST /api/reports/daily mit { test: true }
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { POST: dailyPost } = await import("../daily/route");
  const fakeRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ ...body, test: true }),
  });
  return dailyPost(fakeRequest);
}
