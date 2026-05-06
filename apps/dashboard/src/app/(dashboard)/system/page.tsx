"use client";

import { useState } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import { useSystemInfo, useEventLogs, usePhoneDevices } from "@/hooks/use-data";
import { formatDateTime } from "@/lib/utils";
import { Server, AlertTriangle, Info, XCircle, Monitor } from "lucide-react";
import type { SystemInfo } from "@3cx-dash/types";

const eventIcons: Record<string, React.ReactNode> = {
  Error: <XCircle className="h-4 w-4 text-red-400" />,
  Warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  Information: <Info className="h-4 w-4 text-blue-400" />,
};

export default function SystemPage() {
  const { data: sysData } = useSystemInfo();
  // SystemStatus ist ein Singleton → direkt das Objekt, kein value-Array
  const sysInfo = (sysData as SystemInfo | null) ?? (sysData as { value?: SystemInfo[] } | null)?.value?.[0];
  const [logFilter, setLogFilter] = useState("");
  const { data: logsData } = useEventLogs(logFilter || undefined);
  const { data: devicesData } = usePhoneDevices();
  const logs = logsData?.value ?? [];
  const devices = devicesData?.value ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">System</h1>
        <p className="text-sm text-muted">3CX System-Informationen und Event Log</p>
      </div>

      {/* System Info */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sysInfo && (
          <>
            <GlassCard className="p-4">
              <p className="text-xs text-muted">Version</p>
              <p className="mt-1 text-xl font-bold text-heading">{sysInfo.Version ?? "–"}</p>
              <p className="text-sm text-secondary">{sysInfo.ProductName ?? sysInfo.Name ?? "3CX Phone System"}</p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-xs text-muted">FQDN</p>
              <p className="mt-1 font-mono text-sm text-heading break-all">{sysInfo.FQDN ?? "–"}</p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-xs text-muted">Aktive Anrufe</p>
              <p className="mt-1 text-xl font-bold text-heading">{sysInfo.ExtensionsRegistered ?? 0}</p>
              <p className="text-sm text-secondary">Nebenstellen registriert · max {sysInfo.MaxSimCalls ?? "?"} Anrufe</p>
            </GlassCard>
          </>
        )}
      </div>

      {/* Geräte */}
      {devices.length > 0 && (
        <GlassCard className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-heading">
            <Monitor className="h-4 w-4 text-primary" />
            Telefone / Geräte ({devices.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass text-left text-xs text-muted">
                  <th className="pb-2 pr-4">Nebenstelle</th>
                  <th className="pb-2 pr-4">Modell</th>
                  <th className="pb-2 pr-4">MAC</th>
                  <th className="pb-2 pr-4">IP</th>
                  <th className="pb-2 pr-4">Firmware</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((dev, i) => (
                  <tr key={dev.Id ?? i} className="border-b border-glass/30 hover:bg-[var(--hover-row)]">
                    <td className="py-2 pr-4 font-mono text-body">{dev.Extension ?? "–"}</td>
                    <td className="py-2 pr-4 text-body">{dev.Model ?? "–"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-secondary">{dev.MacAddress ?? "–"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-secondary">{dev.IpAddress ?? "–"}</td>
                    <td className="py-2 pr-4 text-xs text-secondary">{dev.FirmwareVersion ?? "–"}</td>
                    <td className="py-2">
                      <LedIndicator
                        status={dev.Status === "Online" ? "online" : "offline"}
                        size="sm"
                        label={dev.Status ?? "–"}
                        pulse={false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Event Log */}
      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-heading">
            <Server className="h-4 w-4 text-primary" />
            Event Log
          </h2>
          <select
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            className="rounded-lg border border-glass bg-input px-2 py-1 text-xs text-body focus:outline-none"
          >
            <option value="">Alle Level</option>
            <option value="Type eq 'Error'">Nur Fehler</option>
            <option value="Type eq 'Warning'">Nur Warnungen</option>
            <option value="Type eq 'Information'">Nur Information</option>
          </select>
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Keine Log-Einträge</p>
          ) : (
            logs.map((log, i) => (
              <div key={log.Id ?? i} className="flex items-start gap-3 rounded-lg p-2 hover:bg-surface-subtle">
                <div className="mt-0.5 flex-shrink-0">{eventIcons[log.Type ?? "Information"]}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-body">{log.Message ?? "–"}</p>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-xs text-muted">{formatDateTime(log.TimeGenerated ?? "")}</span>
                    {log.Source && <span className="text-xs text-muted">{log.Source}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}
