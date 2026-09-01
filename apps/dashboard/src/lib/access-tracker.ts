// Live-Tracking externer Zugriffe: Cloudflare Access reicht bei jedem Request
// durch den Tunnel die angemeldete E-Mail als Header durch. Die Poll-Routen
// (health, live-problems, active calls) melden sie hier — dadurch wissen wir,
// wer das Dashboard gerade offen hat. In-Memory (Pod-Neustart leert die Liste).

interface Seen {
  lastSeen: number;
  firstSeen: number;
}

const globalStore = globalThis as unknown as { __accessSeen?: Map<string, Seen> };
const seen = (globalStore.__accessSeen ??= new Map<string, Seen>());

export function trackAccess(request: Request): void {
  const email = (request.headers.get("cf-access-authenticated-user-email") ?? "").toLowerCase();
  if (!email) return;
  const now = Date.now();
  const prev = seen.get(email);
  seen.set(email, { lastSeen: now, firstSeen: prev?.firstSeen ?? now });
  // Aufräumen: Einträge älter als 24h entfernen
  if (seen.size > 200) {
    for (const [k, v] of seen) if (now - v.lastSeen > 24 * 60 * 60 * 1000) seen.delete(k);
  }
}

export function getActiveUsers(windowMs = 15 * 60 * 1000): Array<{
  email: string;
  lastSeenSecondsAgo: number;
  activeSinceMinutes: number;
}> {
  const now = Date.now();
  return [...seen.entries()]
    .filter(([, v]) => now - v.lastSeen <= windowMs)
    .map(([email, v]) => ({
      email,
      lastSeenSecondsAgo: Math.round((now - v.lastSeen) / 1000),
      activeSinceMinutes: Math.round((now - v.firstSeen) / 60000),
    }))
    .sort((a, b) => a.lastSeenSecondsAgo - b.lastSeenSecondsAgo);
}
