import { NextResponse } from "next/server";
import { proxyRequest } from "@/lib/threecx-client";

interface ProxyRequestBody {
  api: "xapi" | "callcontrol";
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const payload: ProxyRequestBody = await request.json();

    if (!payload.api || !payload.method || !payload.path) {
      return NextResponse.json(
        { error: "api, method und path sind erforderlich" },
        { status: 400 }
      );
    }

    const method = payload.method.toUpperCase();
    const allowedMethods = ["GET", "POST", "PATCH", "PUT", "DELETE"];
    if (!allowedMethods.includes(method)) {
      return NextResponse.json({ error: `Methode ${method} nicht erlaubt` }, { status: 400 });
    }

    const result = await proxyRequest(
      payload.api,
      method,
      payload.path,
      payload.body,
      payload.headers
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
