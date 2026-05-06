import { promises as fs } from "fs";
import path from "path";
import type { TokenResponse, AppSettings, ThreeCXSystem } from "@3cx-dash/types";

// ─────────────────────────────────────────────
// Token-Cache pro Telefonanlage (Modul-Level Singleton)
// Credentials verlassen NIEMALS den Server
// ─────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // Unix ms
}

const tokenCaches = new Map<string, TokenCache>();
// Puffer: 10 Sekunden vor Ablauf wird ein neues Token geholt.
// Klein genug für kurze Web-Auth-Tokens (60s), groß genug für normale OAuth2-Tokens (3600s).
const TOKEN_BUFFER_MS = 10_000;

// ─────────────────────────────────────────────
// Settings-Datei lesen
// ─────────────────────────────────────────────

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

async function readSettings(): Promise<AppSettings | null> {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    return JSON.parse(content) as AppSettings;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Aktive Telefonanlage ermitteln
// Reihenfolge: settings.json → Umgebungsvariablen
// ─────────────────────────────────────────────

export async function getActiveSystem(): Promise<ThreeCXSystem> {
  const settings = await readSettings();

  if (settings?.systems?.length && settings.activeSystemId) {
    const system = settings.systems.find((s) => s.id === settings.activeSystemId);
    if (system) return system;
  }

  // Fallback: Umgebungsvariablen (für Erststart / K8s Secret)
  const url = process.env.THREECX_URL;
  const clientId = process.env.THREECX_CLIENT_ID;
  const clientSecret = process.env.THREECX_CLIENT_SECRET;
  const webUser = process.env.THREECX_WEB_USER;
  const webPassword = process.env.THREECX_WEB_PASSWORD;

  if (!url) {
    throw new Error(
      "Keine 3CX-Konfiguration gefunden. Bitte eine Telefonanlage in den Einstellungen hinzufügen."
    );
  }

  return {
    id: "__env__",
    name: "Standard (Umgebungsvariablen)",
    url,
    authMethod: clientId && clientSecret ? "client_credentials" : "web_auth",
    clientId,
    clientSecret,
    webUser,
    webPassword,
  };
}

// ─────────────────────────────────────────────
// Token für eine bestimmte Telefonanlage holen
// ─────────────────────────────────────────────

export async function getAccessToken(system?: ThreeCXSystem): Promise<string> {
  const activeSystem = system ?? (await getActiveSystem());
  const cacheKey = activeSystem.id;
  const now = Date.now();

  const cached = tokenCaches.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_BUFFER_MS > now) {
    return cached.token;
  }

  // Cache invalidieren
  tokenCaches.delete(cacheKey);

  if (activeSystem.authMethod === "client_credentials" && activeSystem.clientId && activeSystem.clientSecret) {
    return getTokenViaClientCredentials(activeSystem, cacheKey, now);
  }

  if (activeSystem.webUser && activeSystem.webPassword) {
    return getTokenViaWebAuth(activeSystem, cacheKey, now);
  }

  throw new Error(
    `Telefonanlage "${activeSystem.name}": Keine Auth-Methode konfiguriert. Bitte Client-ID/Secret oder Nebenstelle/Passwort in den Einstellungen hinterlegen.`
  );
}

async function getTokenViaClientCredentials(
  system: ThreeCXSystem,
  cacheKey: string,
  now: number
): Promise<string> {
  const res = await fetch(`${system.url}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: system.clientId!,
      client_secret: system.clientSecret!,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`3CX OAuth2 fehlgeschlagen (${res.status}): ${text}`);
  }

  const data: TokenResponse = await res.json();
  tokenCaches.set(cacheKey, {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  });
  return data.access_token;
}

async function getTokenViaWebAuth(
  system: ThreeCXSystem,
  cacheKey: string,
  now: number,
  securityCode = ""
): Promise<string> {
  const res = await fetch(`${system.url}/webclient/api/Login/GetAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Username: system.webUser,
      Password: system.webPassword,
      SecurityCode: securityCode,
      vm: new URL(system.url).hostname,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`3CX Web-Auth fehlgeschlagen (${res.status}): ${text}`);
  }

  const data = await res.json();

  // 2FA: 3CX fordert OTP-Code an
  if (data.Status === "TFARequested" || data.Status === "OTPRequested") {
    const err = new Error("2FA erforderlich") as Error & { requires2fa: boolean; systemId: string };
    err.requires2fa = true;
    err.systemId = cacheKey;
    throw err;
  }

  // 3CX Web-Auth Response: { Status: "AuthSuccess", Token: { access_token: "...", expires_in: 60 } }
  // Oder direkt: { access_token: "...", expires_in: 3600 }
  const tokenObj = (data.Token && typeof data.Token === "object") ? data.Token : data;
  const token: string = tokenObj.access_token;
  const expiresIn: number = tokenObj.expires_in ?? 60;

  if (!token) throw new Error(`3CX Web-Auth: Kein Token in der Antwort. Status: ${data.Status}`);

  tokenCaches.set(cacheKey, {
    token,
    expiresAt: now + expiresIn * 1000,
  });
  return token;
}

// 2FA-Login abschließen: SecurityCode übergeben, Token in Cache speichern
export async function completeWith2FA(code: string, system?: ThreeCXSystem): Promise<string> {
  const activeSystem = system ?? (await getActiveSystem());
  const cacheKey = activeSystem.id;
  const now = Date.now();
  return getTokenViaWebAuth(activeSystem, cacheKey, now, code);
}

// Cache für eine Anlage leeren (z.B. nach Credentials-Änderung)
export function invalidateTokenCache(systemId: string) {
  tokenCaches.delete(systemId);
}

// Alle Caches leeren
export function invalidateAllTokenCaches() {
  tokenCaches.clear();
}

// ─────────────────────────────────────────────
// XAPI Fetcher (Configuration API)
// Base: https://<FQDN>/xapi/v1/
// ─────────────────────────────────────────────

export async function xapiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const system = await getActiveSystem();
  const token = await getAccessToken(system);
  const fullUrl = `${system.url}/xapi/v1/${path}`;

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
    signal: options?.signal ?? AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`XAPI ${res.status} ${res.statusText}: ${text}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await res.text()) as unknown as T;
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Call Control Fetcher
// Base: https://<FQDN>/callcontrol/
// ─────────────────────────────────────────────

export async function callControlFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const system = await getActiveSystem();
  const token = await getCallControlToken();
  const fullUrl = `${system.url}/callcontrol/${path}`;

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
    signal: options?.signal ?? AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CallControl ${res.status} ${res.statusText}: ${text}`);
  }

  if (res.status === 204) return {} as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await res.text()) as unknown as T;
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Call Control Token (web_auth via THREECX_CALL_USER / THREECX_CALL_PASSWORD)
// Separater Cache – 3CX client_credentials Token hat keinen CallControl-Zugriff
// ─────────────────────────────────────────────

export async function getCallControlToken(): Promise<string> {
  const system = await getActiveSystem();

  // Priorität 1: Dedizierter CallControl Service Principal (integer DN als client_id)
  // In 3CX Admin: Integrationen → API → client_id = Integer-DN (z.B. "200"), CallControl aktiviert
  const ccClientId = process.env.THREECX_CALL_CLIENT_ID ?? system.callControlClientId;
  const ccClientSecret = process.env.THREECX_CALL_CLIENT_SECRET ?? system.callControlClientSecret;

  if (ccClientId && ccClientSecret) {
    const cacheKey = `__cc_${system.id}`;
    const now = Date.now();
    const cached = tokenCaches.get(cacheKey);
    if (cached && cached.expiresAt - TOKEN_BUFFER_MS > now) return cached.token;
    tokenCaches.delete(cacheKey);
    return getTokenViaClientCredentials(
      { ...system, clientId: ccClientId, clientSecret: ccClientSecret },
      cacheKey,
      now
    );
  }

  // Priorität 2: Web-Auth Credentials (env-Vars > settings.json)
  const callUser = process.env.THREECX_CALL_USER ?? system.webUser;
  const callPassword = process.env.THREECX_CALL_PASSWORD ?? system.webPassword;

  if (callUser && callPassword) {
    const cacheKey = `__cc_wa_${system.id}`;
    const now = Date.now();
    const cached = tokenCaches.get(cacheKey);
    if (cached && cached.expiresAt - TOKEN_BUFFER_MS > now) return cached.token;
    tokenCaches.delete(cacheKey);
    return getTokenViaWebAuth({ ...system, webUser: callUser, webPassword: callPassword }, cacheKey, now);
  }

  // Fallback: normalen XAPI-Token versuchen
  return getAccessToken(system);
}

// Token für WebSocket (Client-seitig via /api/ws-token)
export async function getTokenForWebSocket(): Promise<{ token: string; wsUrl: string }> {
  const system = await getActiveSystem();
  const token = await getAccessToken(system);
  const wsUrl = system.url.replace("https://", "wss://").replace("http://", "ws://");
  return { token, wsUrl: `${wsUrl}/callcontrol/websocket` };
}

// Verbindungstest für eine bestimmte Anlage
export async function testSystemConnection(
  system: ThreeCXSystem
): Promise<{ ok: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    const token = await getAccessToken(system);
    const latency = Date.now() - start;
    // Kleiner Funktionstest: Token ist valide wenn wir hier ankommen
    void token; // suppress unused
    return { ok: true, latency };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Generischer Proxy-Request (für API Tester)
export async function proxyRequest(
  api: "xapi" | "callcontrol",
  method: string,
  urlPath: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; headers: Record<string, string>; body: unknown; duration: number }> {
  const system = await getActiveSystem();
  const token = await getAccessToken(system);

  const base = api === "xapi" ? `${system.url}/xapi/v1/` : `${system.url}/callcontrol/`;
  const fullUrl = `${base}${urlPath}`;
  const apiToken = api === "callcontrol" ? await getCallControlToken() : token;

  const start = Date.now();
  const res = await fetch(fullUrl, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders,
    },
    body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const duration = Date.now() - start;
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  let responseBody: unknown;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    responseBody = await res.json().catch(() => null);
  } else {
    responseBody = await res.text().catch(() => "");
  }

  return { status: res.status, headers: responseHeaders, body: responseBody, duration };
}
