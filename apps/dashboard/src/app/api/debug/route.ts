import { NextResponse } from "next/server";
import { getActiveSystem, getAccessToken, getCallControlToken } from "@/lib/threecx-client";
import * as https from "https";
import * as http from "http";

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return { error: "decode failed" };
  }
}

function httpGet(url: string, headers: Record<string, string>, rejectUnauthorized = true): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
        rejectUnauthorized,
        timeout: 6_000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          resolve({ status: res.statusCode, statusText: res.statusMessage, server: res.headers["server"], body: body.slice(0, 300) });
        });
      }
    );
    req.on("error", (e) => resolve({ error: String(e) }));
    req.on("timeout", () => { req.destroy(); resolve({ error: "timeout" }); });
    req.end();
  });
}

export async function GET() {
  try {
    const system = await getActiveSystem();
    const hostname = new URL(system.url).hostname;

    const xapiToken = await getAccessToken(system).catch((e) => String(e));
    const xapiClaims = typeof xapiToken === "string" && !xapiToken.startsWith("Error")
      ? decodeJwt(xapiToken)
      : { error: xapiToken };

    const ccToken = await getCallControlToken().catch((e) => String(e));
    const ccClaims = typeof ccToken === "string" && !ccToken.startsWith("Error")
      ? decodeJwt(ccToken)
      : { error: ccToken };

    const authHeaders = { Authorization: `Bearer ${ccToken}`, Accept: "application/json" };
    const hostHeader = { Host: hostname };

    const results = await Promise.all([
      // CallControl REST: extern
      httpGet(`${system.url}/callcontrol/`, authHeaders),
      // CallControl REST: intern 443 TLS-skip
      httpGet(`https://10.1.1.220/callcontrol/`, { ...authHeaders, ...hostHeader }, false),
      // CallControl REST: intern 5001 (3CX HTTPS intern)
      httpGet(`https://10.1.1.220:5001/callcontrol/`, { ...authHeaders, ...hostHeader }, false),
      // CallControl REST: intern 5000 (3CX HTTP intern)
      httpGet(`http://10.1.1.220:5000/callcontrol/`, { ...authHeaders, ...hostHeader }),
      // XAPI intern 443 (Vergleich: läuft XAPI durch gleiche nginx location?)
      httpGet(`https://10.1.1.220/xapi/v1/`, { Authorization: `Bearer ${xapiToken}`, Accept: "application/json", ...hostHeader }, false),
      // CallControl WebSocket path (sollte erlaubt sein)
      httpGet(`https://10.1.1.220/callcontrol/websocket`, { ...authHeaders, ...hostHeader }, false),
    ]);

    const [ccExt, ccInt443, ccInt5001, ccInt5000, xapiInt, ccWs] = results;

    return NextResponse.json({
      system: { id: system.id, name: system.name, url: system.url, authMethod: system.authMethod },
      tokens: {
        xapi: { preview: typeof xapiToken === "string" ? xapiToken.slice(0, 20) + "..." : null, claims: xapiClaims },
        callControl: { sameAsXapi: ccToken === xapiToken, preview: typeof ccToken === "string" ? ccToken.slice(0, 20) + "..." : null, claims: ccClaims },
      },
      callControlTests: {
        "ext:443/callcontrol/": ccExt,
        "int:443/callcontrol/": ccInt443,
        "int:5001/callcontrol/": ccInt5001,
        "int:5000/callcontrol/": ccInt5000,
        "int:443/xapi/v1/ (compare)": xapiInt,
        "int:443/callcontrol/websocket": ccWs,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
