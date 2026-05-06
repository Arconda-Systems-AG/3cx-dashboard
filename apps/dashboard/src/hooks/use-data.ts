"use client";

import useSWR, { mutate } from "swr";
import type { ODataList, Extension, ActiveCall, Queue, PhoneDevice, EventLogEntry, AppSettings, ThreeCXSystem, TodayStats, SlaViolation, HourlyBucket } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useHealth() {
  return useSWR("/api/health", fetcher, { refreshInterval: 10_000 });
}

export function useSystemInfo() {
  return useSWR<ODataList<any>>("/api/system/info", fetcher, { refreshInterval: 30_000 });
}

export function useActiveCalls() {
  return useSWR<ODataList<ActiveCall>>("/api/calls/active", fetcher, {
    refreshInterval: 5_000,
  });
}

export function useExtensions(filter?: string) {
  const url = filter
    ? `/api/extensions?filter=${encodeURIComponent(filter)}`
    : "/api/extensions";
  return useSWR<ODataList<Extension>>(url, fetcher, { refreshInterval: 15_000 });
}

export function useExtension(id: string | null) {
  return useSWR<Extension>(id ? `/api/extensions/${id}` : null, fetcher);
}

export function useQueues() {
  return useSWR<ODataList<Queue>>("/api/queues", fetcher, { refreshInterval: 10_000 });
}

export function usePhoneDevices() {
  return useSWR<ODataList<PhoneDevice>>("/api/devices", fetcher, { refreshInterval: 30_000 });
}

export function useCallHistory(params: {
  days?: number;
  extension?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.days) query.set("days", String(params.days));
  if (params.extension) query.set("extension", params.extension);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));

  return useSWR<ODataList<any>>(
    `/api/calls/history?${query.toString()}`,
    fetcher,
    { revalidateOnFocus: false }
  );
}

export function useEventLogs(filter?: string) {
  const url = filter
    ? `/api/system/events?filter=${encodeURIComponent(filter)}`
    : "/api/system/events";
  return useSWR<ODataList<EventLogEntry>>(url, fetcher, { refreshInterval: 30_000 });
}

export function useSettings() {
  return useSWR<AppSettings>("/api/settings", fetcher, {
    fallbackData: DEFAULT_SETTINGS,
    revalidateOnFocus: false,
  });
}

export async function updateSettings(settings: Partial<AppSettings>) {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Einstellungen konnten nicht gespeichert werden");
  await mutate("/api/settings");
  return res.json();
}

// Tages-Statistiken (CDR, minütlich aktualisiert)
export function useToday(queues?: string[]) {
  const params = new URLSearchParams();
  if (queues && queues.length > 0) params.set("queues", queues.join(","));
  return useSWR<TodayStats>(`/api/stats/today?${params.toString()}`, fetcher, { refreshInterval: 60_000 });
}

// Real-time SLA-Violations (Ringing > 20s, 5s Polling)
export function useSlaLive() {
  return useSWR<{ violations: SlaViolation[] }>("/api/stats/sla-live", fetcher, { refreshInterval: 5_000 });
}

// Stündliches Anrufaufkommen für Chart
export function useHourly(from?: string, to?: string, queues?: string[]) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (queues && queues.length > 0) params.set("queues", queues.join(","));
  return useSWR<{ buckets: HourlyBucket[] }>(
    `/api/stats/hourly?${params.toString()}`,
    fetcher,
    { refreshInterval: 120_000 }
  );
}

// Nicht angenommene Anrufe in den letzten 60 Minuten (DB-Query)
export function useRecentMissed() {
  return useSWR<{ missed_count: number | null; error?: string }>(
    "/api/stats/recent-missed",
    fetcher,
    { refreshInterval: 60_000 }
  );
}

// Abteilungen (3CX Groups mit Member-Nummern)
export interface DepartmentGroup {
  id: number;
  name: string;
  memberNumbers: string[];
}

export function useDepartments() {
  return useSWR<{ groups: DepartmentGroup[] }>("/api/groups", fetcher, { refreshInterval: 60_000 });
}

// Systems (Telefonanlagen)
export function useSystems() {
  return useSWR<{ systems: (Omit<ThreeCXSystem, "clientSecret" | "webPassword"> & { hasSecret: boolean })[]; activeSystemId: string }>(
    "/api/systems",
    fetcher,
    { revalidateOnFocus: false }
  );
}
