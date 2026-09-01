import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Passwortschutz für die Einstellungen. Init-Passwort gilt, bis in den
// Einstellungen ein eigenes gesetzt wird (Hash in settings.json).
const INIT_PASSWORD = "Geheim$2016";
export const SETTINGS_AUTH_COOKIE = "settings_auth";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

async function readRaw(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(getSettingsPath(), "utf-8"));
  } catch {
    return {};
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyAgainst(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

/** Aktuell gültiger Hash — gespeicherter oder (falls nie geändert) Init-Passwort */
async function currentHash(): Promise<string> {
  const raw = await readRaw();
  const stored = raw.settingsPasswordHash;
  if (typeof stored === "string" && stored.includes(":")) return stored;
  // Deterministischer Hash des Init-Passworts (fester Salt), damit Token
  // über Pod-Restarts hinweg gültig bleiben
  const hash = crypto.scryptSync(INIT_PASSWORD, "3cx-init-salt", 32).toString("hex");
  return `3cx-init-salt:${hash}`;
}

export async function verifyPassword(password: string): Promise<boolean> {
  return verifyAgainst(password, await currentHash());
}

/** Token = exp.HMAC(passwordHash, exp) — wird bei Passwortänderung automatisch ungültig */
export async function issueToken(): Promise<string> {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  const sig = crypto.createHmac("sha256", await currentHash()).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

export async function verifyToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const check = crypto.createHmac("sha256", await currentHash()).update(exp).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(check, "hex"));
  } catch {
    return false;
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Auto-Freischaltung über Cloudflare Access: Wer extern per E-Mail-OTP
 *  angemeldet ist, dessen Adresse reicht Cloudflare als Header durch.
 *  SETTINGS_ADMIN_EMAILS (kommagetrennt, "*@domain" erlaubt) definiert,
 *  welche Identitäten die Einstellungen ohne Passwort öffnen dürfen. */
function matchesAdminEmail(request: Request): boolean {
  const conf = (process.env.SETTINGS_ADMIN_EMAILS ?? "").toLowerCase();
  if (!conf) return false;
  const email = (request.headers.get("cf-access-authenticated-user-email") ?? "").toLowerCase();
  if (!email) return false;
  return conf
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => (p.startsWith("*@") ? email.endsWith(p.slice(1)) : email === p));
}

/** Gate für schreibende Settings-Routen. true = autorisiert. */
export async function isSettingsAuthorized(request: Request): Promise<boolean> {
  if (matchesAdminEmail(request)) return true;
  return verifyToken(getCookie(request, SETTINGS_AUTH_COOKIE));
}

export function authCookieHeader(token: string): string {
  return `${SETTINGS_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_TTL_MS / 1000}`;
}

export async function savePasswordHash(newPassword: string): Promise<void> {
  const settingsPath = getSettingsPath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const raw = await readRaw();
  raw.settingsPasswordHash = hashPassword(newPassword);
  await fs.writeFile(settingsPath, JSON.stringify(raw, null, 2), "utf-8");
}
