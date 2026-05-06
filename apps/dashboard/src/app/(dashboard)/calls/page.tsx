"use client";

import { useState, useEffect } from "react";
import { GlassCard, CallStatusBadge, ExtensionAvatar } from "@3cx-dash/ui";
import { useActiveCalls } from "@/hooks/use-data";
import { formatDuration } from "@/lib/utils";
import { Phone, PhoneOff, PhoneMissed, ArrowRightLeft } from "lucide-react";

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
  const { data, mutate } = useActiveCalls();
  const activeCalls = data?.value ?? [];
  const [transferTarget, setTransferTarget] = useState("");
  const [transferCallId, setTransferCallId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function callAction(callId: string | number, action: string, body?: object) {
    setActionLoading(`${callId}-${action}`);
    try {
      const res = await fetch(`/api/calls/${callId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) throw new Error(await res.text());
      await mutate();
    } catch (e) {
      alert(`Fehler: ${e}`);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Aktive Anrufe</h1>
          <p className="text-sm text-muted">{activeCalls.length} laufende Verbindungen</p>
        </div>
      </div>

      {/* Transfer Modal */}
      {transferCallId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <GlassCard className="w-full max-w-sm p-6">
            <h3 className="mb-4 text-lg font-semibold text-heading">Anruf weiterleiten</h3>
            <input
              type="text"
              placeholder="Zielnebenstelle eingeben..."
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  callAction(transferCallId, "transfer", { destination: transferTarget });
                  setTransferCallId(null);
                  setTransferTarget("");
                }}
                disabled={!transferTarget}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Weiterleiten
              </button>
              <button
                onClick={() => { setTransferCallId(null); setTransferTarget(""); }}
                className="rounded-lg border border-glass px-4 py-2 text-sm text-secondary"
              >
                Abbrechen
              </button>
            </div>
          </GlassCard>
        </div>
      )}

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
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted">Aktionen</th>
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => callAction(call.Id, "hold")}
                            disabled={actionLoading === `${call.Id}-hold`}
                            title="Halten"
                            className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
                          >
                            <PhoneMissed className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => { setTransferCallId(String(call.Id)); }}
                            title="Weiterleiten"
                            className="rounded-lg p-1.5 text-amber-400 hover:bg-amber-500/10"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => callAction(call.Id, "drop")}
                            disabled={actionLoading === `${call.Id}-drop`}
                            title="Auflegen"
                            className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <PhoneOff className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Anruf starten */}
      <GlassCard className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-heading">Anruf starten</h2>
        <MakeCallForm onSuccess={() => mutate()} />
      </GlassCard>
    </div>
  );
}

function MakeCallForm({ onSuccess }: { onSuccess: () => void }) {
  const [dest, setDest] = useState("");
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/calls/make", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: dest, source: src }),
      });
      const data = await res.json();
      setResult(res.ok ? "✓ Anruf gestartet" : `Fehler: ${data.error}`);
      if (res.ok) { setDest(""); setSrc(""); onSuccess(); }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Von Nebenstelle *</label>
        <input
          type="text"
          placeholder="z.B. 11"
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          required
          className="rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 w-36"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Ziel-Nummer *</label>
        <input
          type="text"
          placeholder="z.B. 01725338790"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          required
          className="rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !dest || !src}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
      >
        <Phone className="h-4 w-4" />
        {loading ? "Wird verbunden..." : "Anruf starten"}
      </button>
      {result && <p className="flex items-center text-sm text-secondary">{result}</p>}
    </form>
  );
}
