"use client";

import { useState, useEffect } from "react";
import { GlassCard, CallStatusBadge, ExtensionAvatar } from "@3cx-dash/ui";
import { useActiveCalls } from "@/hooks/use-data";
import { formatDuration } from "@/lib/utils";
import { Phone } from "lucide-react";

/** "11 Lukas Kunze" → { number: "11", name: "Lukas Kunze" } */
function parseCaller(raw: string) {
  const idx = raw.indexOf(" ");
  if (idx > 0) return { number: raw.slice(0, idx), name: raw.slice(idx + 1) };
  return { number: raw, name: raw };
}

function LiveDuration({ establishedAt }: { establishedAt?: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!establishedAt) return;
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(establishedAt).getTime()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [establishedAt]);

  return <span className="tabular-nums text-xs text-secondary">{formatDuration(seconds)}</span>;
}

export default function CallsPage() {
  const { data } = useActiveCalls();
  const activeCalls = data?.value ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Aktive Anrufe</h1>
          <p className="text-sm text-muted">{activeCalls.length} laufende Verbindungen</p>
        </div>
      </div>

      <GlassCard>
        {activeCalls.length === 0 ? (
          <div className="py-16 text-center">
            <Phone className="mx-auto mb-3 h-8 w-8 text-muted" />
            <p className="text-sm text-muted">Keine aktiven Anrufe</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-glass">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Anrufer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Ziel</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {activeCalls.map((call) => {
                  const caller = parseCaller(call.Caller);
                  const callee = parseCaller(call.Callee);
                  return (
                    <tr key={call.Id} className="border-b border-glass/50 hover:bg-[var(--hover-row)] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ExtensionAvatar number={caller.number} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-body">{caller.name}</p>
                            <p className="text-xs text-muted">{caller.number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ExtensionAvatar number={callee.number} size="sm" />
                          <div>
                            <p className="text-sm text-body">{callee.name}</p>
                            <p className="text-xs text-muted">{callee.number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <CallStatusBadge status={call.Status} />
                      </td>
                      <td className="px-4 py-3">
                        <LiveDuration establishedAt={call.EstablishedAt} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

    </div>
  );
}
