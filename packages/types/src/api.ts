// ─────────────────────────────────────────────
// 3CX XAPI (Configuration API) Types
// ─────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ODataList<T> {
  value: T[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
}

// Extension / User
export interface Extension {
  Id: number;
  Number: string;
  FirstName: string;
  LastName: string;
  DisplayName?: string;
  EmailAddress?: string;
  Mobile?: string;
  OutboundCallerID?: string;
  CurrentProfileName: string;
  IsRegistered?: boolean;
  Internal?: string; // "Registered" | "Unregistered" | "N/A"
  QueueStatus?: string;
  Enabled?: boolean;
}

export type ExtensionStatus =
  | "Registered"
  | "Unregistered"
  | "Available"
  | "Away"
  | "DND"
  | "Lunch"
  | "Business Trip"
  | "N/A";

// Active Call
export interface ActiveCall {
  Id: number;
  Caller: string;    // Format: "Number DisplayName" z.B. "11 Lukas Kunze"
  Callee: string;    // Format: "Number DisplayName" z.B. "20 Tadeus Birsgal"
  Status: "Talking" | "Ringing" | "Held" | "Rerouting" | "Routing";
  EstablishedAt?: string; // ISO 8601 – Zeitpunkt der Verbindung
  LastChangeStatus?: string; // ISO 8601 – letzter Statuswechsel
  ServerNow?: string;
}

// Call History
// CallHistoryView Felder (3CX v20 XAPI)
export interface CallHistoryEntry {
  SegmentId?: number;
  SegmentStartTime?: string;  // ISO 8601 mit Timezone z.B. "2026-01-15T08:01:12+02:00"
  SegmentEndTime?: string;
  SrcDisplayName?: string;
  SrcExtendedDisplayName?: string;
  SrcDn?: string;
  SrcCallerNumber?: string;
  SrcInternal?: boolean;
  SrcExternal?: boolean;
  DstDisplayName?: string;
  DstExtendedDisplayName?: string;
  DstDn?: string;
  DstCallerNumber?: string;
  DstInternal?: boolean;
  DstExternal?: boolean;
  CallTime?: string;    // ISO 8601 Dauer z.B. "PT4M9S"
  CallAnswered?: boolean;
  // Vom Server berechnet:
  Duration?: number;    // Millisekunden (aus CallTime geparst)
}

// Queue
export interface Queue {
  Id: number;
  Number?: string;    // Warteschlangen-Nebenstellennummer
  Name: string;
  IsRegistered?: boolean;
  PollingStrategy?: string;
  RingTimeout?: number;
  SLATime?: number;
  Agents?: QueueAgent[];
  Managers?: QueueManager[];
  // Vom Server angereichert (cross-referenz mit Extensions):
  LoggedInAgents?: number;
  // Vom Server angereichert (cross-referenz mit ActiveCalls):
  ActiveCallCount?: number;   // Aktive Gespräche IN dieser Queue
  WaitingCallCount?: number;  // Anrufe in Queue die noch NICHT angenommen (klingeln)
}

export interface QueueAgent {
  Id: number;
  Number: string;   // Nebenstellennummer
  Name: string;     // Anzeigename
  SkillGroup?: string;
  Tags?: string[];
  // Vom Server angereichert via Extensions:
  QueueStatus?: "LoggedIn" | "LoggedOut";
  IsRegistered?: boolean;     // Telefon/Gerät registriert (online)
  CurrentProfile?: string;    // Profil: "Available", "DND", "Away", "Lunch", "Business Trip"
  // Vom Server angereichert via ActiveCalls:
  HasActiveCall?: boolean;    // Agent ist gerade im Gespräch (Ringing oder Talking)
  IsRinging?: boolean;        // Telefon klingelt gerade (Status="Ringing" in ActiveCalls)
}

export interface QueueManager {
  Id?: number;
  Number?: string;
  Name?: string;
}

// Phone Device
export interface PhoneDevice {
  Id?: string;
  Extension?: string;
  MacAddress?: string;
  Model?: string;
  FirmwareVersion?: string;
  Status?: "Online" | "Offline" | "Unknown";
  IpAddress?: string;
  LastSeenAt?: string;
  Type?: string;
}

// System Info
// SystemStatus singleton: GET /xapi/v1/SystemStatus
export interface SystemInfo {
  Id?: number;
  FQDN?: string;
  Version?: string;
  Activated?: boolean;
  MaxSimCalls?: number;
  ExtensionsRegistered?: number;
  Ip?: string;
  IpV4?: string;
  IpV6?: string;
  // Legacy/compat aliases
  LicenseActive?: boolean;
  MaxSimultaneousCalls?: number;
  ProductName?: string;
  Name?: string;
}

// Event Log: GET /xapi/v1/EventLogs
export interface EventLogEntry {
  Id?: number;
  TimeGenerated?: string;  // Korrektfeld (nicht DateTime)
  Type?: string;
  EventId?: number;
  Message?: string;
  Group?: string;
  GroupName?: string;
  Source?: string;
  Params?: string[];
}

// ─────────────────────────────────────────────
// Multi-System Management
// ─────────────────────────────────────────────

export type AuthMethod = "client_credentials" | "web_auth";

export interface ThreeCXSystem {
  id: string;              // UUID oder Slug
  name: string;            // Anzeigename (z.B. "Arconda HQ")
  url: string;             // https://firma.3cx.de
  authMethod: AuthMethod;
  // --- client_credentials (XAPI) ---
  clientId?: string;
  clientSecret?: string;
  // --- web_auth (Nebenstelle + Passwort) ---
  webUser?: string;        // Nebenstellennummer, z.B. "87"
  webPassword?: string;
  // --- CallControl API (Enterprise) ---
  callControlClientId?: string;
  callControlClientSecret?: string;
  // --- PostgreSQL (pro Anlage) ---
  pgHost?: string;
  pgPort?: number;
  pgDatabase?: string;
  pgUser?: string;
  pgPassword?: string;
  // --- Kunden-Branding (pro Anlage) ---
  customerName?: string;
  customerLogoUrl?: string;
}

// ─────────────────────────────────────────────
// Stats / SLA Types
// ─────────────────────────────────────────────

export interface TodayStats {
  total_incoming: number;     // Amtsgespräche → Queue heute
  answered: number;           // davon angenommen
  abandoned: number;          // davon abgebrochen (Kunde hat aufgelegt)
  not_in_20s: number;         // Wartezeit > 20s (angenommen ODER abgebrochen)
  avg_wait_seconds: number;   // Ø Wartezeit in erster Queue (Sekunden)
  max_wait_seconds: number;   // Längste Wartezeit über alle Queue-Segmente (Sekunden)
  max_wait_queue: string;     // Queue-Name mit längster Wartezeit
  abwurf1_reached: number;    // Calls die Abwurf-Queue 1 erreichten
  abwurf2_reached: number;    // Calls die Abwurf-Queue 2 erreichten
}

export interface SlaViolation {
  callId: number;
  caller: string;
  callee: string;
  waitingSince: string;       // ISO timestamp (LastChangeStatus)
  waitingSeconds: number;     // Sekunden seit Eintritt in aktuellen Status
}

export interface HourlyBucket {
  hour: string;               // ISO timestamp (volle Stunde)
  total: number;
  answered: number;
  abandoned: number;
}

// App Settings (gespeichert auf PVC)
export interface AppSettings {
  // Telefonanlagen
  systems: ThreeCXSystem[];
  activeSystemId: string;
  // Polling-Intervalle
  pollIntervalActiveCalls: number; // ms
  pollIntervalExtensions: number;
  pollIntervalQueues: number;
  pollIntervalHealth: number;
  // UI
  showOfflineExtensions: boolean;
  maxCallHistoryDays: number;
  theme: "dark" | "light" | "system";
  // PostgreSQL Datenbankquelle (für Statistiken)
  pgHost?: string;
  pgPort?: number;
  pgDatabase?: string;
  pgUser?: string;
  pgPassword?: string;
  // Kunden-Branding (konfigurierbar in Einstellungen)
  customerName?: string;       // Anzeigename im Header (z.B. "HansaNord")
  customerLogoUrl?: string;    // Base64-Data-URL oder https-URL des Logos
  // E-Mail-Report (SMTP wie SA-API)
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;       // Klartext in settings.json, bei GET als "••••••••" zurück
  smtpFrom?: string;           // Absender-E-Mail
  reportRecipients?: string;   // Komma-getrennte Empfänger-E-Mails
  // KI-Auswertung
  aiUrl?: string;              // OpenAI-compatible API URL z.B. http://10.1.70.145:8000/v1
  aiApiKey?: string;           // API-Key (Klartext in settings.json, bei GET als "••••••••" zurück)
  aiModel?: string;            // Modell-Name z.B. "llama3", "gpt-3.5-turbo"
  // Automatisierung
  aiSchedule?: AiSchedule;
  reportSchedule?: ReportSchedule;
  reportProfiles?: ReportProfile[];
  // Live-Probleme-Schwellwerte (pro Dashboard/Mandant)
  qpMaxWaiting?: number;    // Überlastung: mehr wartende Anrufer als …
  qpWaitSeconds?: number;   // Wartezeit-Schwelle (s); Fallback wenn Queue-SLATime=0
  qpSlaTarget?: number;     // SLA-Tagesquote-Schwelle (%) für Sorgenkinder
  qpSlaMinCalls?: number;   // Mindest-Anrufe heute, damit SLA-% aussagekräftig ist
}

export interface AiSchedule {
  enabled: boolean;
  days: number[];         // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
  fromHour: number;       // Stunde ab der Analyse läuft (inkl.)
  toHour: number;         // Stunde bis zu der Analyse läuft (exkl.)
  intervalMinutes: number;
}

export interface ReportSchedule {
  enabled: boolean;
  days: number[];
  sendTime: string;       // "HH:MM" in Europe/Berlin
}

export interface ReportProfile {
  id: string;
  name: string;
  recipients: string;        // komma-getrennte E-Mails
  departmentId?: number;     // undefined = alle Queues
  departmentName?: string;
  enabled: boolean;
  days: number[];            // 0=So, 1=Mo, ..., 6=Sa
  sendTime: string;          // "HH:MM" Europe/Berlin
}

export const DEFAULT_SETTINGS: AppSettings = {
  systems: [],
  activeSystemId: "",
  pollIntervalActiveCalls: 5000,
  pollIntervalExtensions: 15000,
  pollIntervalQueues: 10000,
  pollIntervalHealth: 10000,
  showOfflineExtensions: true,
  maxCallHistoryDays: 7,
  theme: "dark",
  pgHost: "",
  pgPort: 5432,
  pgDatabase: "postgres",
  pgUser: "postgres",
  pgPassword: "",
  aiUrl: "",
  aiApiKey: "",
  aiModel: "",
  aiSchedule: { enabled: false, days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 18, intervalMinutes: 30 },
  reportSchedule: { enabled: false, days: [1, 2, 3, 4, 5], sendTime: "17:30" },
  reportProfiles: [],
  qpMaxWaiting: 5,
  qpWaitSeconds: 20,
  qpSlaTarget: 40,
  qpSlaMinCalls: 10,
};

// ─────────────────────────────────────────────
// KI-Auswertung
// ─────────────────────────────────────────────

export interface AiAnalysis {
  timestamp: string;
  status: "gut" | "warnung" | "kritisch";
  zusammenfassung: string;
  erkenntnisse: string[];
  empfehlungen: string[];
  anomalien: string[];
  dauer_ms?: number;
}
